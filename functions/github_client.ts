export interface GitHubConfig {
  token?: string;
  baseURL?: string;
  userAgent?: string;
  timeout?: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}

export interface PRData {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  html_url: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
  mergeable_state?: "unknown" | "clean" | "dirty" | "unstable";
}

export interface GitHubClient {
  fetchPR(owner: string, repo: string, prNumber: number): Promise<PRData | null>;
  fetchPRs(owner: string, repo: string): Promise<PRData[]>;
  validateToken(): Promise<boolean>;
  getRateLimit(): Promise<RateLimitInfo | null>;
}

export class GitHubRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly documentationUrl?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class GitHubUnauthorizedError extends GitHubRequestError {}
export class GitHubForbiddenError extends GitHubRequestError {}
export class GitHubNotFoundError extends GitHubRequestError {}
export class GitHubUnprocessableEntityError extends GitHubRequestError {}
export class GitHubServerError extends GitHubRequestError {}
export class GitHubTimeoutError extends GitHubRequestError {}

export function createGitHubClient(config: GitHubConfig = {}): GitHubClient {
  const state: {
    config: Required<GitHubConfig>;
    rateLimit: RateLimitInfo | null;
  } = {
    config: {
      token: config.token ?? Deno.env.get("GITHUB_TOKEN") ?? "",
      baseURL: normalizeBaseURL(config.baseURL ?? "https://api.github.com"),
      userAgent: config.userAgent ?? "patty-pr-minder/1.0",
      timeout: config.timeout ?? 10_000,
    },
    rateLimit: null,
  };

  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const url = new URL(path, state.config.baseURL);
    const headers = new Headers(init.headers ?? {});

    if (state.config.token) {
      headers.set("Authorization", `token ${state.config.token}`);
    }

    headers.set("Accept", "application/vnd.github+json");
    headers.set("User-Agent", state.config.userAgent);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), state.config.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      updateRateLimitFromHeaders(response.headers, state);

      if (response.ok) {
        if (response.status === 204) {
          return undefined as T;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          return (await response.text()) as unknown as T;
        }

        return (await response.json()) as T;
      }

      const errorBody = await parseErrorBody(response);
      const errorMessage = extractErrorMessage(errorBody) ??
        `GitHub request failed with status ${response.status}`;
      const documentationUrl = extractDocumentationUrl(errorBody);

      switch (response.status) {
        case 401:
          throw new GitHubUnauthorizedError(
            errorMessage,
            response.status,
            response.statusText,
            documentationUrl,
            errorBody,
          );
        case 403:
          throw new GitHubForbiddenError(
            errorMessage,
            response.status,
            response.statusText,
            documentationUrl,
            errorBody,
          );
        case 404:
          throw new GitHubNotFoundError(
            errorMessage,
            response.status,
            response.statusText,
            documentationUrl,
            errorBody,
          );
        case 422:
          throw new GitHubUnprocessableEntityError(
            errorMessage,
            response.status,
            response.statusText,
            documentationUrl,
            errorBody,
          );
        default:
          if (response.status >= 500) {
            throw new GitHubServerError(
              errorMessage,
              response.status,
              response.statusText,
              documentationUrl,
              errorBody,
            );
          }

          throw new GitHubRequestError(
            errorMessage,
            response.status,
            response.statusText,
            documentationUrl,
            errorBody,
          );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new GitHubTimeoutError(
          `GitHub request timed out after ${state.config.timeout}ms`,
          408,
          "Request Timeout",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return {
    async fetchPR(_owner: string, _repo: string, _prNumber: number): Promise<PRData | null> {
      throw new Error("fetchPR is not implemented yet");
    },
    async fetchPRs(_owner: string, _repo: string): Promise<PRData[]> {
      throw new Error("fetchPRs is not implemented yet");
    },
    async validateToken(): Promise<boolean> {
      return state.config.token.length > 0;
    },
    async getRateLimit(): Promise<RateLimitInfo | null> {
      return state.rateLimit;
    },
  };
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
}

function updateRateLimitFromHeaders(
  headers: Headers,
  state: { rateLimit: RateLimitInfo | null },
): void {
  const limit = parseNumber(headers.get("x-ratelimit-limit"));
  const remaining = parseNumber(headers.get("x-ratelimit-remaining"));
  const reset = parseNumber(headers.get("x-ratelimit-reset"));
  const used = parseNumber(headers.get("x-ratelimit-used"));

  if (limit === null || remaining === null || reset === null) {
    return;
  }

  state.rateLimit = {
    limit,
    remaining,
    reset,
    used: used ?? limit - remaining,
  };
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.length ? text : null;
  } catch (_) {
    return null;
  }
}

function extractErrorMessage(body: unknown): string | null {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  if (typeof body === "string" && body.length > 0) {
    return body;
  }
  return null;
}

function extractDocumentationUrl(body: unknown): string | undefined {
  if (body && typeof body === "object" && "documentation_url" in body) {
    const documentationUrl = (body as { documentation_url?: unknown }).documentation_url;
    return typeof documentationUrl === "string" ? documentationUrl : undefined;
  }
  return undefined;
}

function parseNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
