import { assertEquals, assertStrictEquals } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { createGitHubClient } from "./github_client.ts";

interface PartialRateLimitHeaders {
  limit?: number;
  remaining?: number;
  reset?: number;
  used?: number;
}

function createJsonResponse(
  body: unknown,
  init: ResponseInit & { rateLimit?: PartialRateLimitHeaders },
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.rateLimit) {
    const { limit, remaining, reset, used } = init.rateLimit;
    if (limit !== undefined) headers.set("x-ratelimit-limit", String(limit));
    if (remaining !== undefined) {
      headers.set("x-ratelimit-remaining", String(remaining));
    }
    if (reset !== undefined) headers.set("x-ratelimit-reset", String(reset));
    if (used !== undefined) headers.set("x-ratelimit-used", String(used));
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

const originalFetch = globalThis.fetch;

async function withStubbedFetch(
  stub: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  globalThis.fetch = stub;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("GitHub client core behavior", async (t) => {
  await t.step("fetchPR returns data and uses cache", async () => {
    let callCount = 0;
    const prPayload = {
      number: 1,
      title: "Add retry logic",
      state: "open",
      draft: false,
      html_url: "https://github.com/cheefbird/patty-pr-minder/pull/1",
      user: { login: "cheefbird" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mergeable_state: "unknown" as const,
    };

    await withStubbedFetch(async () => {
      callCount += 1;
      await Promise.resolve();
      return createJsonResponse(prPayload, {
        status: 200,
        rateLimit: {
          limit: 5000,
          remaining: 4999,
          reset: Math.floor(Date.now() / 1000) + 60,
        },
      });
    }, async () => {
      const client = createGitHubClient({
        token: "test-token",
        cacheTTL: 120_000,
      });
      const first = await client.fetchPR("cheefbird", "patty-pr-minder", 1);
      assertEquals(first?.title, "Add retry logic");
      assertEquals(callCount, 1);

      const second = await client.fetchPR("cheefbird", "patty-pr-minder", 1);
      assertEquals(second?.number, 1);
      assertEquals(
        callCount,
        1,
        "cached response should avoid duplicate fetch",
      );
    });
  });

  await t.step(
    "fetchPR returns null for missing PR and memoizes result",
    async () => {
      let callCount = 0;
      await withStubbedFetch(async () => {
        callCount += 1;
        await Promise.resolve();
        if (callCount > 1) {
          throw new Error("fetch should not be called after caching null");
        }
        return createJsonResponse({ message: "Not Found" }, { status: 404 });
      }, async () => {
        const client = createGitHubClient({ token: "test-token" });
        const first = await client.fetchPR("cheefbird", "patty-pr-minder", 999);
        assertEquals(first, null);

        const second = await client.fetchPR(
          "cheefbird",
          "patty-pr-minder",
          999,
        );
        assertEquals(second, null);
        assertEquals(callCount, 1);
      });
    },
  );

  await t.step(
    "fetchPR retries after rate limiting and respects reset header",
    async () => {
      const time = new FakeTime();
      let callCount = 0;
      const resetSeconds = Math.floor((Date.now() + 2_000) / 1000);

      try {
        await withStubbedFetch(async () => {
          callCount += 1;
          await Promise.resolve();
          if (callCount === 1) {
            return createJsonResponse({ message: "rate limited" }, {
              status: 403,
              rateLimit: {
                limit: 5000,
                remaining: 0,
                reset: resetSeconds,
                used: 5000,
              },
            });
          }

          return createJsonResponse({
            number: 42,
            title: "Deduplicate PRs",
            state: "open",
            draft: false,
            html_url: "https://github.com/cheefbird/patty-pr-minder/pull/42",
            user: { login: "cheefbird" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            mergeable_state: "unknown" as const,
          }, {
            status: 200,
            rateLimit: {
              limit: 5000,
              remaining: 4999,
              reset: resetSeconds + 60,
            },
          });
        }, async () => {
          const client = createGitHubClient({
            token: "test-token",
            cacheEnabled: false,
          });
          const pending = client.fetchPR("cheefbird", "patty-pr-minder", 42);

          await time.tickAsync(2_500);
          const pr = await pending;

          assertEquals(pr?.number, 42);
          assertEquals(callCount, 2);
        });
      } finally {
        time.restore();
      }
    },
  );

  await t.step(
    "validateToken returns false when GitHub responds with 401",
    async () => {
      await withStubbedFetch(async (input) => {
        const request = new Request(input);
        await Promise.resolve();
        if (request.url.endsWith("/user")) {
          return createJsonResponse({ message: "Bad credentials" }, {
            status: 401,
          });
        }
        throw new Error(`Unexpected URL: ${request.url}`);
      }, async () => {
        const client = createGitHubClient({
          token: "bad-token",
          cacheEnabled: false,
        });
        const valid = await client.validateToken();
        assertEquals(valid, false);
      });
    },
  );

  await t.step(
    "getRateLimit returns latest headers after successful request",
    async () => {
      await withStubbedFetch(async () => {
        await Promise.resolve();
        return createJsonResponse({
          number: 7,
          title: "Add message trigger",
          state: "open",
          draft: false,
          html_url: "https://github.com/cheefbird/patty-pr-minder/pull/7",
          user: { login: "cheefbird" },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          mergeable_state: "unknown" as const,
        }, {
          status: 200,
          rateLimit: {
            limit: 5000,
            remaining: 4998,
            reset: 1_700_000_000,
            used: 2,
          },
        });
      }, async () => {
        const client = createGitHubClient({ token: "test-token" });
        await client.fetchPR("cheefbird", "patty-pr-minder", 7);
        const info = await client.getRateLimit();
        assertEquals(info, {
          limit: 5000,
          remaining: 4998,
          reset: 1_700_000_000,
          used: 2,
        });
      });
    },
  );
});

Deno.test({
  name: "integration: fetch PR from GitHub",
  ignore: Deno.env.get("TEST_GH_API") !== "1",
  permissions: { net: true, env: true },
}, async () => {
  const client = createGitHubClient();
  const pr = await client.fetchPR("octocat", "Hello-World", 1);
  if (pr) {
    assertStrictEquals(pr.number, 1);
  }
});
