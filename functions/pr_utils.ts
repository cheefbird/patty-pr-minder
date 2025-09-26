/**
 * GitHub PR URL Parsing and Validation Utilities
 *
 * Core utilities for extracting and parsing GitHub PR URLs from messages.
 * Focused on URL parsing without over-engineering or unnecessary integration.
 */

export interface PRUrlInfo {
  owner: string;
  repo: string;
  number: number;
}

/**
 * GitHub PR URL regex pattern
 * Matches: https://github.com/{owner}/{repo}/pull/{number}
 * Supports: http->https upgrade, URL fragments, query parameters
 * Note: Allows any digits, but we validate PR number > 0 in parsing logic
 */
const GITHUB_PR_URL_PATTERN =
  /^https?:\/\/github\.com\/([a-zA-Z0-9][a-zA-Z0-9\-_.]{0,38}[a-zA-Z0-9])\/([a-zA-Z0-9][a-zA-Z0-9\-_.]{0,99}[a-zA-Z0-9])\/pull\/(\d+)(?:[/?#][^\s]*)?$/;

/**
 * Quick validation regex for performance optimization
 * Fast check before expensive full parsing
 */
const GITHUB_URL_QUICK_CHECK = /github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

/**
 * Sanitize and normalize URL input
 * - Removes Slack formatting
 * - Normalizes protocol (http -> https)
 * - Trims whitespace
 * - Removes tracking parameters
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== "string") {
    return "";
  }

  // Remove Slack URL formatting: <url|text> or <url>
  let cleaned = url.trim();
  if (cleaned.startsWith("<") && cleaned.includes(">")) {
    const match = cleaned.match(/^<([^|>]+)(?:\|[^>]+)?>$/);
    if (match) {
      cleaned = match[1];
    }
  }

  // Upgrade http to https for GitHub URLs
  if (cleaned.startsWith("http://github.com")) {
    cleaned = cleaned.replace("http://", "https://");
  }

  // Remove common tracking parameters
  try {
    const urlObj = new URL(cleaned);
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "ref"];
    trackingParams.forEach((param) => {
      urlObj.searchParams.delete(param);
    });
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return cleaned string
    return cleaned.trim();
  }
}

/**
 * Quick validation check for GitHub PR URLs
 * Fast rejection of obviously invalid URLs before expensive parsing
 */
export function isValidGitHubPRUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  // Length check - reject extremely long URLs (security)
  if (url.length > 2000) {
    return false;
  }

  const sanitized = sanitizeUrl(url);

  // Quick pattern check
  if (!GITHUB_URL_QUICK_CHECK.test(sanitized)) {
    return false;
  }

  // Full pattern validation with PR number check
  const match = sanitized.match(GITHUB_PR_URL_PATTERN);
  if (!match) {
    return false;
  }

  // Validate PR number is positive
  const prNumber = parseInt(match[3], 10);
  return !Number.isNaN(prNumber) && prNumber > 0;
}

/**
 * Parse GitHub PR URL and extract owner, repo, and PR number
 * Returns null if URL is invalid or not a GitHub PR URL
 */
export function parseGitHubPRUrl(url: string): PRUrlInfo | null {
  if (!url || typeof url !== "string") {
    return null;
  }

  // Quick validation first
  if (!isValidGitHubPRUrl(url)) {
    return null;
  }

  const sanitized = sanitizeUrl(url);
  const match = sanitized.match(GITHUB_PR_URL_PATTERN);

  if (!match) {
    return null;
  }

  const [, owner, repo, numberStr] = match;
  const number = parseInt(numberStr, 10);

  // Validate parsed components
  if (!owner || !repo || Number.isNaN(number) || number <= 0) {
    return null;
  }

  return {
    owner: owner.trim(),
    repo: repo.trim(),
    number,
  };
}
