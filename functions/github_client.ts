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
  fetchPRs(owner: string, repo: string): Promise<PRData[]>;
  validateToken(): Promise<boolean>;
  getRateLimit(): Promise<RateLimitInfo | null>;
}

export function createGitHubClient(config: GitHubConfig = {}): GitHubClient {
  const state: {
    config: Required<GitHubConfig>;
    rateLimit: RateLimitInfo | null;
  } = {
    config: {
      token: config.token ?? Deno.env.get("GITHUB_TOKEN") ?? "",
      baseURL: config.baseURL ?? "https://api.github.com",
      userAgent: config.userAgent ?? "patty-pr-minder/1.0",
      timeout: config.timeout ?? 10_000,
    },
    rateLimit: null,
  };

  return {
    async fetchPR(
      _owner: string,
      _repo: string,
      _prNumber: number,
    ): Promise<PRData | null> {
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
