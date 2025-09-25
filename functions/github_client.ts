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
  fetchPR(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PRData | null>;
  fetchPRs(
    owner: string,
    repo: string,
    options?: FetchPROptions,
  ): Promise<PRData[]>;
  validateToken(): Promise<boolean>;
  getRateLimit(): Promise<RateLimitInfo | null>;
}

export interface FetchPROptions {
  state?: "open" | "closed" | "all";
  perPage?: number;
  page?: number;
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

  const ensureToken = () => {
    if (!state.config.token) {
      throw new GitHubUnauthorizedError(
        "GitHub token is missing. Configure GITHUB_TOKEN before making API requests.",
        401,
        "Unauthorized",
      );
    }
  };

  const request = async <T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> => {
    const url = new URL(path, state.config.baseURL);
    const headers = new Headers(init.headers ?? {});

    ensureToken();
    headers.set("Authorization", `token ${state.config.token}`);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("User-Agent", state.config.userAgent);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      state.config.timeout,
    );

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

  const buildPRPath = (
    owner: string,
    repo: string,
    prNumber?: number,
  ): string => {
    const sanitizedOwner = sanitizeIdentifier(owner, "owner");
    const sanitizedRepo = sanitizeIdentifier(repo, "repo");

    if (prNumber !== undefined) {
      const sanitizedNumber = sanitizePRNumber(prNumber);
      return `/repos/${sanitizedOwner}/${sanitizedRepo}/pulls/${sanitizedNumber}`;
    }

    return `/repos/${sanitizedOwner}/${sanitizedRepo}/pulls`;
  };

  const fetchPR = async (
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<PRData | null> => {
    try {
      return await request<PRData>(buildPRPath(owner, repo, prNumber));
    } catch (error) {
      if (error instanceof GitHubNotFoundError) {
        return null;
      }
      throw error;
    }
  };

  const fetchPRs = async (
    owner: string,
    repo: string,
    options: FetchPROptions = {},
  ): Promise<PRData[]> => {
    const params = new URLSearchParams();
    const stateParam = options.state ?? "open";

    if (stateParam !== "open") {
      params.set("state", stateParam);
    }

    params.set("per_page", String(clamp(options.perPage ?? 30, 1, 100)));
    params.set("page", String(options.page ?? 1));

    const path = `${buildPRPath(owner, repo)}?${params.toString()}`;
    return await request<PRData[]>(path, { method: "GET" });
  };

  const validateToken = async (): Promise<boolean> => {
    try {
      await request("/user", { method: "GET" });
      return true;
    } catch (error) {
      if (error instanceof GitHubUnauthorizedError) {
        return false;
      }
      throw error;
    }
  };

  return {
    fetchPR,
    fetchPRs,
    validateToken,
    async getRateLimit(): Promise<RateLimitInfo | null> {
      return state.rateLimit;
    },
  };
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
}

function sanitizeIdentifier(value: string, field: "owner" | "repo"): string {
  if (!value || typeof value !== "string") {
    throw new GitHubRequestError(
      `Invalid ${field} provided.`,
      422,
      "Unprocessable Entity",
    );
  }

  const sanitized = value.trim();
  if (!sanitized.length) {
    throw new GitHubRequestError(
      `${field} cannot be empty.`,
      422,
      "Unprocessable Entity",
    );
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(sanitized)) {
    throw new GitHubRequestError(
      `${field} contains invalid characters.`,
      422,
      "Unprocessable Entity",
    );
  }

  return sanitized;
}

function sanitizePRNumber(prNumber: number): number {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new GitHubRequestError(
      "Pull request number must be a positive integer.",
      422,
      "Unprocessable Entity",
    );
  }
  return prNumber;
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
    const documentationUrl =
      (body as { documentation_url?: unknown }).documentation_url;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
