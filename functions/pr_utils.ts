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
const OWNER_SEGMENT = "[a-zA-Z0-9](?:[a-zA-Z0-9\\-_.]{0,38}[a-zA-Z0-9])?";
const REPO_SEGMENT = "[a-zA-Z0-9](?:[a-zA-Z0-9\\-_.]{0,99}[a-zA-Z0-9])?";

const GITHUB_PR_UI_URL_PATTERN = new RegExp(
  `^https?:\\/\\/(?:www\\.)?github\\.com\\/(${OWNER_SEGMENT})\\/(${REPO_SEGMENT})\\/pull\\/(\\d+)(?:[\\/?#][^\\s]*)?$`,
);

const GITHUB_PR_API_URL_PATTERN = new RegExp(
  `^https?:\\/\\/api\\.github\\.com\\/repos\\/(${OWNER_SEGMENT})\\/(${REPO_SEGMENT})\\/pulls\\/(\\d+)(?:[\\/?#][^\\s]*)?$`,
);

/**
 * Quick validation regex for performance optimization
 * Fast check before expensive full parsing
 */
const GITHUB_URL_QUICK_CHECK =
  /(github\.com\/[^/]+\/[^/]+\/pull\/\d+|api\.github\.com\/repos\/[^/]+\/[^/]+\/pulls\/\d+)/;

/**
 * Message scanning regex for GitHub PR URLs
 * Matches both Slack-wrapped (<url|text>) and plain URLs in a single pass
 */
const GITHUB_PR_MESSAGE_PATTERN =
  /<https?:\/\/(?:www\.|api\.)?github\.com\/[^>]+(?:\|[^>]+)?>|https?:\/\/(?:www\.|api\.)?github\.com\/[^\s<>]+/gi;

const LEADING_WRAPPER_CHARS = ["(", "[", "{", '"', "'", "`"];
const TRAILING_WRAPPER_CHARS = [")", "]", "}", ".", ",", "!", "?", ":", ";", '"', "'", "`"];

function matchPRComponents(url: string): PRUrlInfo | null {
  const uiMatch = GITHUB_PR_UI_URL_PATTERN.exec(url);
  if (uiMatch) {
    const [, owner, repo, numberStr] = uiMatch;
    const number = parseInt(numberStr, 10);
    if (!Number.isNaN(number) && number > 0) {
      return { owner: owner.trim(), repo: repo.trim(), number };
    }
    return null;
  }

  const apiMatch = GITHUB_PR_API_URL_PATTERN.exec(url);
  if (apiMatch) {
    const [, owner, repo, numberStr] = apiMatch;
    const number = parseInt(numberStr, 10);
    if (!Number.isNaN(number) && number > 0) {
      return { owner: owner.trim(), repo: repo.trim(), number };
    }
  }

  return null;
}

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

  // Remove common tracking parameters
  try {
    const urlObj = new URL(cleaned);
    const lowerHost = urlObj.hostname.toLowerCase();

    if (urlObj.protocol === "http:") {
      urlObj.protocol = "https:";
    }

    if (lowerHost === "www.github.com") {
      urlObj.hostname = "github.com";
    }

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

  return matchPRComponents(sanitized) !== null;
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
  return matchPRComponents(sanitized);
}

function stripMessageWrapping(value: string): string {
  let result = value.trim();

  while (result.length > 0 && LEADING_WRAPPER_CHARS.includes(result[0])) {
    result = result.slice(1).trimStart();
  }

  while (result.length > 0 && TRAILING_WRAPPER_CHARS.includes(result[result.length - 1])) {
    result = result.slice(0, -1).trimEnd();
  }

  return result;
}

function normalizeCandidateUrl(rawCandidate: string): string | null {
  const candidate = stripMessageWrapping(rawCandidate);

  // Sanitize and validate immediately
  const sanitized = sanitizeUrl(candidate);
  const prInfo = parseGitHubPRUrl(sanitized);
  if (prInfo) {
    return `https://github.com/${prInfo.owner}/${prInfo.repo}/pull/${prInfo.number}`;
  }

  // Attempt to recover by progressively trimming trailing wrapper characters
  let trimmed = candidate;
  while (trimmed.length > 0 && TRAILING_WRAPPER_CHARS.includes(trimmed[trimmed.length - 1])) {
    trimmed = trimmed.slice(0, -1).trimEnd();
    const retrySanitized = sanitizeUrl(trimmed);
    const retryInfo = parseGitHubPRUrl(retrySanitized);
    if (retryInfo) {
      return `https://github.com/${retryInfo.owner}/${retryInfo.repo}/pull/${retryInfo.number}`;
    }
  }

  return null;
}

/**
 * Extract GitHub PR URLs from a Slack message.
 * Handles Slack formatting (<url|text>), multiple URLs, and duplicate filtering.
 */
export function extractPRUrlsFromMessage(text: string): string[] {
  if (typeof text !== "string") {
    return [];
  }

  const trimmed = text.trim();
  if (trimmed.length === 0 || !trimmed.includes("github.com")) {
    return [];
  }

  const matches = trimmed.matchAll(GITHUB_PR_MESSAGE_PATTERN);
  const deduped = new Set<string>();
  const results: string[] = [];

  for (const match of matches) {
    const normalized = normalizeCandidateUrl(match[0]);
    if (!normalized || deduped.has(normalized)) {
      continue;
    }
    deduped.add(normalized);
    results.push(normalized);
  }

  return results;
}
