# Slack PR Tracker Bot  -  PRD v0.1 (Owner: <DRI>)

## 1) Problem & Context
- Pain: PR review links fly by in channel chatter. Teams lack a consolidated, always-current view of open PRs that need attention. Manual status checks and triage waste time.
- Who: Engineering teams using Slack and GitHub. Especially squads with review SLAs or high async collaboration.
- Why now: Remote/distributed teams rely on Slack for review coordination; GitHub review signals are fragmented; teams want lightweight automation without new dashboards.
- Assumptions: Slack is the team’s primary coordination tool; GitHub hosts repos; bot can be invited per-channel; minimal setup friction; Deno runtime is acceptable for hosting/deploy.

## 2) Goals & Success Metrics
- Primary: Reduce time-to-first-review for PRs posted in channels by X% within 30 days.
- Secondary: Increase % of PRs with at least one reviewer assigned within Y hours; slash command usage ≥ N/day/channel; bot adoption across ≥ M active channels.
- Guardrails: Zero message spam beyond configured cadence; polling stays within GitHub rate limits; no leakage of private repo info to unintended channels; `/prs` is **ephemeral by default** to the requester.

## 3) Users & JTBD
- Primary user: Engineers posting PRs and reviewers monitoring channel workload.
- JTBD: “When someone shares a GitHub PR in Slack, I want it tracked and kept up-to-date so I can see what needs review without leaving Slack.”
- Won’t-serve: Non-GitHub VCS; orgs that disallow Slack apps; channels without PR activity.

## 4) Scope (This Release)
- Must:
  - Auto-detect GitHub PR URLs posted in a channel where the bot is present and add to a per-channel running list.
  - Store PR metadata: repo, number, title, author, state (open/closed/merged), draft, review status (requested/changes requested/approved), CI status if available, last updated, age, labels.
  - Periodic GitHub status refresh on tracked PRs.
  - Closed PRs remain visible until end of local day, then auto-removed from the list.
  - Slash command to render a "beautiful" channel message with PR list, status chips, and an "Open PR" button per item.
  - Permissions & setup flow for Slack and GitHub.
  - **Authentication dependency:** GitHub App installation (preferred) or PAT provided during setup; secure storage of credentials and rotation policy.
- Should:
  - Simple filters in slash view (open only, mine, awaiting review, drafts hidden).
  - Per-channel settings: refresh cadence, cleanup time, label filters.
  - Minimal persistence layer for state and cursors.
- Won’t/Non-goals:
  - Web dashboard outside Slack.
  - Support for PRs from other platforms (Bitbucket, GitLab) in v0.1.
  - Complex SLA/rotation assignment logic.
  - Web dashboard outside Slack.
  - Support for PRs from other platforms (Bitbucket, GitLab) in v0.1.
  - Complex SLA/rotation assignment logic.

## 5) User Journeys
- Happy path A: Invite bot → post PR URL → bot parses and stores → periodic refresh updates status → user runs `/prs` → bot returns an **ephemeral** rich list with statuses and “Open PR” buttons → closed PRs auto-drop at day’s end.
- Edge cases: E1 PR link edited or deleted; E2 PR from private repo without valid token; E3 rate limits hit; E4 bot not in channel; E5 slash command in thread/DM; E6 multiple PR links in one message; E7 cross-repo PRs; E8 renamed default branch.

## 6) Requirements (Testable)
R1. Auto-track PRs from messages in channels where app is installed.
- Acceptance: Given the bot is in #dev, when a message includes a valid `https://github.com/<org>/<repo>/pull/<num>` URL, then the PR is added once with parsed metadata and acknowledged via a subtle reaction or thread reply.

R2. Periodically refresh PR statuses.
- Acceptance: Given tracked PRs exist, when the refresh interval elapses, then the app calls GitHub APIs to update state (open/closed/merged, draft, review statuses, CI) without duplicating entries and within rate limits.

R3. Retain closed PRs until end of day, then remove.
- Acceptance: Given a PR is closed at any time, when local channel day boundary occurs, then the PR is removed from the list and not shown in the next `/prs` output.

R4. Slash command renders list with actions.
- Acceptance: Given users run `/prs`, when there are tracked PRs, then the bot returns an **ephemeral** Block Kit message to the requester with grouped sections (Open, Drafts, Recently Closed today) and each item has an “Open PR” button that links to the PR.

R5. Per-channel scoping.
- Acceptance: Given multiple channels, when PRs are posted in each, then `/prs` lists only that channel’s tracked PRs.

R6. Permissions & errors are user-friendly.
- Acceptance: Given missing GitHub access, when a PR from a private repo is posted, then the bot posts a minimal error hint in thread and skips tracking until auth is fixed.

R7. Idempotency & de-duplication.
- Acceptance: Posting the same PR URL multiple times does not create duplicates; last-posted timestamp is updated.

R8. Performance.
- Acceptance: `/prs` response appears within p95 ≤ 1.5s for ≤ 25 PRs and p99 ≤ 3.5s for ≤ 100 PRs.

## 7) Non-Functional Requirements
- Perf: p95 ≤ 1.5s list render; p99 ≤ 3.5s; background refresh jittered to distribute load.
- Availability: 99.9% monthly; graceful degradation when GitHub/Slack degraded.
- Privacy/Sec: Store minimal PR metadata; encrypt tokens at rest; principle of least privilege; no posting outside the originating channel.
- Accessibility/i18n: Use accessible emoji and text contrasts in Block Kit; date/time localized; English-only v0.1.

## 8) Analytics & Telemetry
- Events: `pr_tracked` {channel_id, repo, pr_number, author}; `refresh_run` {count, duration, github_status}; `slash_prs_run` {channel_id, count_shown, duration}; `pr_closed_seen` {age}; `error_auth` {scope}; `rate_limit_hit` {service}.
- Funnels: PR posted → tracked → refreshed → reviewed (first review comment) → merged.
- Alert thresholds: Refresh failure rate > 5% over 15 min; `/prs` p95 > 2.5s over 15 min; GitHub rate-limit remaining < 10%.

## 9) Risks & Open Questions
- Risks: Rate limiting on GitHub; Slack message length limits; timezone boundaries per channel; private repos permissions; message spam perception.
- Open Qs: Q1 What is the canonical timezone for end-of-day cleanup per channel? Q3 What is the desired refresh cadence (e.g., 2–5 min)? Q4 How are GitHub tokens provided (app installation vs PAT)?
- Decisions: D1 `/prs` output is **ephemeral by default** (owner: PM, date: today).

## 10) Release & Rollout
- Milestones: Alpha (date), Beta (date), GA (date)
- Flags/Stages: Per-channel feature flag for cleanup and filters; staged org rollout; optional flag to allow sharing an ephemeral `/prs` snapshot into the channel.
- Experiment: Hypothesis: consolidated list reduces TTR by ≥20%; Metrics: TTR, merges/day; Stop/ship: no regression over 2 weeks.
- Kill-switch: Config flag to disable auto-posting and polling; owner on-call.

## 11) Dependencies & Ownership
- Services/Teams: Slack Events API & Slash Commands; GitHub REST/GraphQL; **GitHub App installation or PAT for auth**; secret store (KMS/Secrets Manager/Env with KMS); data store (KV/SQLite/Redis); scheduler/cron.
- External constraints: GitHub and Slack app review policies; org security reviews; **org approval to install the GitHub App and/or policies governing PAT issuance and rotation**.
- DRIs: PM…, Eng…, Design…

## 12) Need Professional Help in Developing Your Product?

Please contact me at https://sammuti.com
---
### Appendix
A) Competitors/benchmarks  
- GritBot-like PR notifiers; Pull Reminders; native GitHub Slack app (baseline).  
B) Detailed flows & wireframes  
- TBD  
C) API contracts  
- Slack: slash command `/prs`, events `message.channels`, permissions `commands`, `channels:history`, `chat:write`.
- GitHub: `GET /repos/{owner}/{repo}/pulls/{pull_number}`, reviews, checks; app or PAT scopes `repo`, `read:org` if needed.
- **Auth modes:** GitHub App (preferred) using App ID, Client ID/Secret, private key; or PAT fallback. **Token storage:** secret store; **rotation:** policy owner Eng.
D) Data model & migrations  
- `Channel`: id, settings, tz, created_at  
- `PR`: channel_id, repo, number, title, author, state, draft, review_state, ci_state, labels[], first_seen_at, last_seen_at, last_refreshed_at  
- `EventLog`: type, props, ts  
E) Security/compliance notes  
- Encrypt tokens; rotate secrets; store minimal data; signed Slack requests validation; GitHub webhook signatures if used.  
F) Ops/runbooks & alarms  
- Pager for refresh failures, rate-limit alerts, Slack API errors; safe retry with backoff.  
G) Alternatives considered  
- Web UI; daily digest only; webhook > polling hybrid.  
H) Changelog  
- v0.1 initial draft) Need Professional Help in Developing Your Product?

Please contact me at https://sammuti.com
---
### Appendix
A) Competitors/benchmarks  
- GritBot-like PR notifiers; Pull Reminders; native GitHub Slack app (baseline).  
B) Detailed flows & wireframes  
- TBD  
C) API contracts  
- Slack: slash command `/prs`, events `message.channels`, permissions `commands`, `channels:history`, `chat:write`.
- GitHub: `GET /repos/{owner}/{repo}/pulls/{pull_number}`, reviews, checks; app or PAT scopes `repo`, `read:org` if needed.
D) Data model & migrations  
- `Channel`: id, settings, tz, created_at  
- `PR`: channel_id, repo, number, title, author, state, draft, review_state, ci_state, labels[], first_seen_at, last_seen_at, last_refreshed_at  
- `EventLog`: type, props, ts  
E) Security/compliance notes  
- Encrypt tokens; rotate secrets; store minimal data; signed Slack requests validation; GitHub webhook signatures if used.  
F) Ops/runbooks & alarms  
- Pager for refresh failures, rate-limit alerts, Slack API errors; safe retry with backoff.  
G) Alternatives considered  
- Web UI; daily digest only; webhook > polling hybrid.  
H) Changelog  
- v0.1 initial draft

