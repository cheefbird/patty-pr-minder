import { assertEquals } from "@std/assert";
import {
  extractPRUrlsFromMessage,
  isValidGitHubPRUrl,
  type PRUrlInfo,
  parseGitHubPRUrl,
  sanitizeUrl,
} from "./pr_utils.ts";

Deno.test("sanitizeUrl - basic URL cleaning", () => {
  assertEquals(
    sanitizeUrl("  https://github.com/owner/repo/pull/123  "),
    "https://github.com/owner/repo/pull/123",
  );
});

Deno.test("sanitizeUrl - Slack URL formatting removal", () => {
  assertEquals(
    sanitizeUrl("<https://github.com/owner/repo/pull/123>"),
    "https://github.com/owner/repo/pull/123",
  );

  assertEquals(
    sanitizeUrl("<https://github.com/owner/repo/pull/123|PR Link>"),
    "https://github.com/owner/repo/pull/123",
  );
});

Deno.test("sanitizeUrl - HTTP to HTTPS upgrade", () => {
  assertEquals(
    sanitizeUrl("http://github.com/owner/repo/pull/123"),
    "https://github.com/owner/repo/pull/123",
  );
});

Deno.test("sanitizeUrl - canonicalizes common GitHub hosts", () => {
  assertEquals(
    sanitizeUrl("https://www.github.com/owner/repo/pull/123"),
    "https://github.com/owner/repo/pull/123",
  );

  assertEquals(
    sanitizeUrl("http://www.github.com/owner/repo/pull/123"),
    "https://github.com/owner/repo/pull/123",
  );
});

Deno.test("sanitizeUrl - tracking parameter removal", () => {
  const urlWithTracking =
    "https://github.com/owner/repo/pull/123?utm_source=slack&utm_medium=message&ref=notification";
  const cleaned = sanitizeUrl(urlWithTracking);
  assertEquals(cleaned, "https://github.com/owner/repo/pull/123");
});

Deno.test("sanitizeUrl - invalid input handling", () => {
  assertEquals(sanitizeUrl(""), "");
  assertEquals(sanitizeUrl(null as unknown as string), "");
  assertEquals(sanitizeUrl(undefined as unknown as string), "");
});

Deno.test("isValidGitHubPRUrl - valid URLs", () => {
  const validUrls = [
    "https://github.com/facebook/react/pull/12345",
    "https://github.com/microsoft/vscode/pull/98765",
    "http://github.com/golang/go/pull/54321", // http should work
    "https://www.github.com/foo/bar/pull/5",
    "https://github.com/owner/repo/pull/1",
    "https://github.com/test-org/test-repo/pull/999",
    "https://github.com/owner/repo/pull/123#discussion_r456789",
    "https://github.com/owner/repo/pull/123/files",
    "https://github.com/owner/repo/pull/123?tab=files",
  ];

  validUrls.forEach((url) => {
    assertEquals(isValidGitHubPRUrl(url), true, `Expected ${url} to be valid`);
  });
});

Deno.test("isValidGitHubPRUrl - invalid URLs", () => {
  const invalidUrls = [
    "",
    "not a url",
    "https://github.com/owner/repo/issues/123", // Issue, not PR
    "https://gitlab.com/owner/repo/merge_requests/123", // Not GitHub
    "https://github.com/owner", // Incomplete
    "https://github.com/owner/repo", // No PR
    "https://github.com/owner/repo/pull", // No number
    "https://github.com/owner/repo/pull/abc", // Non-numeric
    "https://github.com/owner/repo/pull/0", // Zero PR number
    "https://github.com/owner/repo/pull/-1", // Negative PR number
    "ftp://github.com/owner/repo/pull/123", // Wrong protocol
  ];

  invalidUrls.forEach((url) => {
    assertEquals(isValidGitHubPRUrl(url), false, `Expected ${url} to be invalid`);
  });
});

Deno.test("isValidGitHubPRUrl - security: extremely long URLs", () => {
  const longUrl = `https://github.com/owner/repo/pull/123${"x".repeat(3000)}`;
  assertEquals(isValidGitHubPRUrl(longUrl), false);
});

Deno.test("isValidGitHubPRUrl - Slack formatted URLs", () => {
  assertEquals(isValidGitHubPRUrl("<https://github.com/owner/repo/pull/123>"), true);
  assertEquals(isValidGitHubPRUrl("<https://github.com/owner/repo/pull/123|PR Link>"), true);
});

Deno.test("parseGitHubPRUrl - valid URLs", () => {
  const testCases: Array<[string, PRUrlInfo]> = [
    [
      "https://github.com/facebook/react/pull/12345",
      { owner: "facebook", repo: "react", number: 12345 },
    ],
    [
      "http://github.com/microsoft/vscode/pull/98765",
      { owner: "microsoft", repo: "vscode", number: 98765 },
    ],
    [
      "https://github.com/test-org/test-repo/pull/1",
      { owner: "test-org", repo: "test-repo", number: 1 },
    ],
    ["https://github.com/a/b/pull/9", { owner: "a", repo: "b", number: 9 }],
    ["https://www.github.com/foo/bar/pull/25", { owner: "foo", repo: "bar", number: 25 }],
    [
      "https://github.com/owner/repo/pull/123#discussion_r456789",
      { owner: "owner", repo: "repo", number: 123 },
    ],
    [
      "https://github.com/owner/repo/pull/123/files?tab=files",
      { owner: "owner", repo: "repo", number: 123 },
    ],
  ];

  testCases.forEach(([url, expected]) => {
    const result = parseGitHubPRUrl(url);
    assertEquals(result, expected, `Failed to parse ${url}`);
  });
});

Deno.test("parseGitHubPRUrl - invalid URLs return null", () => {
  const invalidUrls = [
    "",
    "not a url",
    "https://github.com/owner/repo/issues/123",
    "https://gitlab.com/owner/repo/merge_requests/123",
    "https://github.com/owner",
    null,
    undefined,
  ];

  invalidUrls.forEach((url) => {
    assertEquals(
      parseGitHubPRUrl(url as unknown as string),
      null,
      `Expected ${url} to return null`,
    );
  });
});

Deno.test("parseGitHubPRUrl - Slack formatted URLs", () => {
  const slackUrl = "<https://github.com/owner/repo/pull/123|Check this PR>";
  const result = parseGitHubPRUrl(slackUrl);
  assertEquals(result, { owner: "owner", repo: "repo", number: 123 });
});

Deno.test("parseGitHubPRUrl - special characters in owner/repo names", () => {
  const testCases: Array<[string, PRUrlInfo]> = [
    [
      "https://github.com/test-org/test_repo.js/pull/123",
      { owner: "test-org", repo: "test_repo.js", number: 123 },
    ],
    [
      "https://github.com/user.name/repo-name/pull/456",
      { owner: "user.name", repo: "repo-name", number: 456 },
    ],
  ];

  testCases.forEach(([url, expected]) => {
    const result = parseGitHubPRUrl(url);
    assertEquals(result, expected, `Failed to parse ${url}`);
  });
});

Deno.test("Performance test - parseGitHubPRUrl should be fast", () => {
  const testUrl = "https://github.com/facebook/react/pull/12345";
  const iterations = 1000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    parseGitHubPRUrl(testUrl);
  }
  const end = performance.now();

  const avgTime = (end - start) / iterations;
  console.log(`Average parse time: ${avgTime.toFixed(3)}ms`);

  // Should be well under 1ms per parse
  assertEquals(avgTime < 1, true, `Parsing too slow: ${avgTime}ms`);
});

Deno.test("extractPRUrlsFromMessage - basic extraction", () => {
  const message = "Please review https://github.com/org/repo/pull/42 today";
  const urls = extractPRUrlsFromMessage(message);
  assertEquals(urls, ["https://github.com/org/repo/pull/42"]);
});

Deno.test("extractPRUrlsFromMessage - handles Slack formatted links", () => {
  const message =
    "New PRs: <https://github.com/org/repo/pull/99|PR 99> and <https://github.com/foo/bar/pull/100>";
  const urls = extractPRUrlsFromMessage(message);
  assertEquals(urls, [
    "https://github.com/org/repo/pull/99",
    "https://github.com/foo/bar/pull/100",
  ]);
});

Deno.test("extractPRUrlsFromMessage - handles www.github.com links", () => {
  const message = "Check out https://www.github.com/org/repo/pull/333";
  const urls = extractPRUrlsFromMessage(message);
  assertEquals(urls, ["https://github.com/org/repo/pull/333"]);
});

Deno.test("extractPRUrlsFromMessage - removes duplicates", () => {
  const message =
    "Check https://github.com/org/repo/pull/1 and <https://github.com/org/repo/pull/1|duplicate>";
  const urls = extractPRUrlsFromMessage(message);
  assertEquals(urls, ["https://github.com/org/repo/pull/1"]);
});

Deno.test("extractPRUrlsFromMessage - ignores non PR links", () => {
  const message = "See https://github.com/org/repo/issues/1 for details";
  const urls = extractPRUrlsFromMessage(message);
  assertEquals(urls, []);
});

Deno.test("extractPRUrlsFromMessage - handles non string input", () => {
  const urls = extractPRUrlsFromMessage(undefined as unknown as string);
  assertEquals(urls, []);
});

Deno.test("extractPRUrlsFromMessage - performance with large messages", () => {
  // Test with realistic large Slack message (thread with multiple PRs)
  const largePRList = Array.from(
    { length: 20 },
    (_, i) => `https://github.com/repo${i}/project/pull/${i + 1}`,
  ).join(" ");
  const message = `Daily standup update: ${largePRList} - please review these PRs`;

  const start = performance.now();
  const urls = extractPRUrlsFromMessage(message);
  const end = performance.now();

  assertEquals(urls.length, 20);
  assertEquals(end - start < 5, true, `Message parsing too slow: ${end - start}ms`);
});

Deno.test("extractPRUrlsFromMessage - performance with no URLs", () => {
  const longMessage =
    "This is a very long message with lots of text ".repeat(100) +
    "but no GitHub URLs anywhere in the content at all";

  const start = performance.now();
  const urls = extractPRUrlsFromMessage(longMessage);
  const end = performance.now();

  assertEquals(urls, []);
  assertEquals(end - start < 1, true, `Non-URL message too slow: ${end - start}ms`);
});
