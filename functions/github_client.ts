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

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

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
    ensureToken();
    await respectRateLimit(state.rateLimit);
    return await attemptRequest<T>(path, init, state, 1);
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

async function attemptRequest<T>(
  path: string,
  init: RequestInit,
  state: {
    config: Required<GitHubConfig>;
    rateLimit: RateLimitInfo | null;
  },
  attempt: number,
): Promise<T> {
  const url = new URL(path, state.config.baseURL);
  const headers = new Headers(init.headers ?? {});

  headers.set("Authorization", `token ${state.config.token}`);
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

    const error = createErrorForStatus(
      response.status,
      errorMessage,
      response.statusText,
      documentationUrl,
      errorBody,
    );

    if (shouldRetry(error, attempt, state.rateLimit)) {
      const delayMs = nextBackoffDelay(attempt, state.rateLimit);
      await delay(delayMs);
      return await attemptRequest<T>(path, init, state, attempt + 1);
    }

    throw error;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = new GitHubTimeoutError(
        `GitHub request timed out after ${state.config.timeout}ms`,
        408,
        "Request Timeout",
      );
      if (shouldRetry(timeoutError, attempt, state.rateLimit)) {
        const delayMs = nextBackoffDelay(attempt, state.rateLimit);
        await delay(delayMs);
        return await attemptRequest<T>(path, init, state, attempt + 1);
      }
      throw timeoutError;
    }

    if (error instanceof GitHubRequestError) {
      if (shouldRetry(error, attempt, state.rateLimit)) {
        const delayMs = nextBackoffDelay(attempt, state.rateLimit);
        await delay(delayMs);
        return await attemptRequest<T>(path, init, state, attempt + 1);
      }
      throw error;
    }

    if (error instanceof Error && error.name === "TypeError") {
      if (shouldRetry(null, attempt, state.rateLimit)) {
        const delayMs = nextBackoffDelay(attempt, state.rateLimit);
        await delay(delayMs);
        return await attemptRequest<T>(path, init, state, attempt + 1);
      }
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function createErrorForStatus(
  status: number,
  message: string,
  statusText: string,
  documentationUrl: string | undefined,
  errorBody: unknown,
): GitHubRequestError {
  switch (status) {
    case 401:
      return new GitHubUnauthorizedError(
        message,
        status,
        statusText,
        documentationUrl,
        errorBody,
      );
    case 403:
      return new GitHubForbiddenError(
        message,
        status,
        statusText,
        documentationUrl,
        errorBody,
      );
    case 404:
      return new GitHubNotFoundError(
        message,
        status,
        statusText,
        documentationUrl,
        errorBody,
      );
    case 422:
      return new GitHubUnprocessableEntityError(
        message,
        status,
        statusText,
        documentationUrl,
        errorBody,
      );
    default:
      if (status >= 500) {
        return new GitHubServerError(
          message,
          status,
          statusText,
          documentationUrl,
          errorBody,
        );
      }
      return new GitHubRequestError(
        message,
        status,
        statusText,
        documentationUrl,
        errorBody,
      );
  }
}

function shouldRetry(
  error: GitHubRequestError | null,
  attempt: number,
  rateLimit: RateLimitInfo | null,
): boolean {
  if (attempt >= MAX_RETRIES) {
    return false;
  }

  if (rateLimit && rateLimit.remaining === 0) {
    return true;
  }

  if (!error) {
    return true;
  }

  if (
    error instanceof GitHubUnauthorizedError ||
    error instanceof GitHubNotFoundError ||
    error instanceof GitHubUnprocessableEntityError
  ) {
    return false;
  }

  if (error instanceof GitHubForbiddenError) {
    return rateLimit?.remaining === 0;
  }

  if (
    error instanceof GitHubServerError || error instanceof GitHubTimeoutError
  ) {
    return true;
  }

  return error.status >= 500;
}

function nextBackoffDelay(
  attempt: number,
  rateLimit: RateLimitInfo | null,
): number {
  const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  if (rateLimit && rateLimit.remaining === 0) {
    const now = Date.now();
    const resetMs = rateLimit.reset * 1_000;
    return Math.max(resetMs - now, backoff);
  }
  return backoff;
}

async function respectRateLimit(
  rateLimit: RateLimitInfo | null,
): Promise<void> {
  if (!rateLimit || rateLimit.remaining > 0) {
    return;
  }

  const delayMs = Math.max(
    rateLimit.reset * 1_000 - Date.now(),
    BASE_BACKOFF_MS,
  );
  if (delayMs > 0) {
    await delay(delayMs);
  }
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

function buildPRPath(
  owner: string,
  repo: string,
  prNumber?: number,
): string {
  const sanitizedOwner = sanitizeIdentifier(owner, "owner");
  const sanitizedRepo = sanitizeIdentifier(repo, "repo");

  if (prNumber !== undefined) {
    const sanitizedNumber = sanitizePRNumber(prNumber);
    return `/repos/${sanitizedOwner}/${sanitizedRepo}/pulls/${sanitizedNumber}`;
  }

  return `/repos/${sanitizedOwner}/${sanitizedRepo}/pulls`;
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

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
