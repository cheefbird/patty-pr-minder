# Patty PR Minder - Implementation Plan

## Overview
This document breaks down the implementation of Patty PR Minder from the current Slack starter template into a fully-featured PR tracking bot. The plan is organized into 5 phases, each building upon the previous one.

---

## Architecture Overview

### Current State → Target State
**FROM:** Generic message-posting workflow with sample components
**TO:** Event-driven PR tracking system with GitHub integration

### Core Components Transformation
- **Workflow**: Sample workflow → PR tracking workflows (detection, refresh, cleanup)
- **Functions**: Sample function → GitHub API client, PR parser, status updater
- **Triggers**: Sample trigger → Message event trigger + scheduled triggers
- **Datastore**: Sample objects → Channel settings + PR tracking + Event logs

### Key Integrations
1. **GitHub API**: REST/GraphQL for PR metadata and status
2. **Slack Events API**: Message parsing for PR URL detection
3. **Slack Slash Commands**: `/prs` with rich Block Kit UI
4. **Background Jobs**: Scheduled PR refresh and cleanup

---

## Data Models

### Channel Settings
```typescript
interface ChannelSettings {
  channel_id: string;           // Primary key
  timezone: string;             // For end-of-day cleanup
  refresh_interval_minutes: number; // Default: 5
  cleanup_hour: number;         // Default: 23 (11 PM)
  label_filters: string[];      // Optional PR label filtering
  created_at: string;
  updated_at: string;
}
```

### PR Tracking
```typescript
interface TrackedPR {
  id: string;                   // Primary key: `${channel_id}-${repo}-${number}`
  channel_id: string;
  repo_full_name: string;       // "owner/repo"
  pr_number: number;
  title: string;
  author: string;
  html_url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  review_state: 'pending' | 'changes_requested' | 'approved' | 'mixed';
  ci_state: 'pending' | 'success' | 'failure' | 'error' | null;
  labels: string[];
  first_seen_at: string;        // When first posted in Slack
  last_seen_at: string;         // Last time URL was posted
  last_refreshed_at: string;    // Last GitHub API refresh
  created_at: string;
  updated_at: string;
}
```

### Event Log
```typescript
interface EventLog {
  id: string;                   // Primary key
  event_type: 'pr_tracked' | 'refresh_run' | 'slash_prs_run' | 'pr_closed_seen' | 'error_auth' | 'rate_limit_hit';
  channel_id?: string;
  properties: Record<string, any>; // Event-specific data
  timestamp: string;
}
```

---

## Phase 1: Foundation & Architecture (Week 1-2)

### Goals
- Replace sample code infrastructure
- Establish GitHub API integration
- Set up new data models
- Create basic error handling

### Tasks

#### 1.1 Replace Sample Infrastructure
- [ ] **Task**: Remove sample workflow, function, trigger
- [ ] **Files**: Delete/replace `workflows/sample_workflow.ts`, `functions/sample_function.ts`, `triggers/sample_trigger.ts`
- [ ] **Acceptance**: Clean slate for PR tracking components

#### 1.2 Update Manifest & Permissions
- [ ] **Task**: Add required Slack permissions and GitHub outgoing domains
- [ ] **File**: `manifest.ts`
- [ ] **Changes**:
  ```typescript
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "channels:history",    // NEW: Read messages to detect PRs
    "reactions:write",     // NEW: React to acknowledge PR detection
    "datastore:read",
    "datastore:write",
  ],
  outgoingDomains: [
    "api.github.com",     // NEW: GitHub API access
  ],
  ```

#### 1.3 Create New Datastores
- [ ] **Task**: Replace sample datastore with PR tracking schema
- [ ] **Files**:
  - `datastores/channel_settings.ts`
  - `datastores/tracked_prs.ts`
  - `datastores/event_logs.ts`
- [ ] **Acceptance**: Datastore definitions match schema above

#### 1.4 GitHub API Client Foundation
- [ ] **Task**: Create GitHub API client with authentication and rate limiting
- [ ] **File**: `functions/github_client.ts`
- [ ] **Features**:
  - Token-based authentication (PAT or GitHub App)
  - Rate limit handling with retry logic
  - Error handling for common scenarios (401, 403, 404, 429)
  - Basic PR fetching functionality
- [ ] **Acceptance**: Can fetch PR data from public repos

#### 1.5 Utility Functions
- [ ] **Task**: Create PR URL parsing and validation utilities
- [ ] **File**: `functions/pr_utils.ts`
- [ ] **Functions**:
  ```typescript
  parseGitHubPRUrl(url: string): { owner: string, repo: string, number: number } | null
  isValidGitHubPRUrl(url: string): boolean
  extractPRUrlsFromMessage(text: string): string[]
  ```

#### 1.6 Basic Error Handling
- [ ] **Task**: Create error handling utilities and logging
- [ ] **File**: `functions/error_handler.ts`
- [ ] **Features**:
  - Structured error logging
  - User-friendly error message formatting
  - Rate limit backoff calculations

### Acceptance Criteria
- [ ] Sample code completely removed
- [ ] New datastores defined and deployable
- [ ] GitHub API client can fetch basic PR data
- [ ] PR URL parsing works for various GitHub URL formats
- [ ] Error handling framework in place

---

## Phase 2: Core PR Detection & Tracking (Week 3-4)

### Goals
- Implement message event handling
- Build PR detection and initial tracking
- Create basic `/prs` slash command
- Add deduplication logic

### Tasks

#### 2.1 Message Event Handler
- [ ] **Task**: Create workflow to handle channel messages
- [ ] **File**: `workflows/message_handler_workflow.ts`
- [ ] **Trigger**: Message events in channels where bot is present
- [ ] **Logic**:
  1. Pre-filter message (length > 10 chars, contains "github.com")
  2. Parse message for GitHub PR URLs using regex
  3. Skip if no URLs found
  4. Rate limit: Max 3 GitHub API calls per minute per channel
  5. For each URL, check if already tracked
  6. If new, fetch PR data from GitHub (queue if rate limited)
  7. Store in datastore
  8. React to message with ✅ or thread reply

#### 2.2 PR Detection Function
- [ ] **Task**: Core function to detect and track new PRs
- [ ] **File**: `functions/pr_tracker.ts`
- [ ] **Input**: Channel ID, message text, user ID, timestamp
- [ ] **Process**:
  ```typescript
  1. Extract PR URLs from message
  2. For each URL:
     a. Parse owner/repo/number
     b. Check if already tracked for this channel
     c. If new: fetch from GitHub API
     d. Store TrackedPR record
     e. Log 'pr_tracked' event
  3. Return summary of tracked PRs
  ```
- [ ] **Error Handling**:
  - Invalid URLs → ignore silently
  - Private repos without access → log warning, skip
  - Rate limits → queue for later retry

#### 2.3 Basic Slash Command
- [ ] **Task**: Implement `/prs` command with simple text output
- [ ] **Files**:
  - `workflows/prs_command_workflow.ts`
  - `functions/prs_lister.ts`
- [ ] **Workflow**:
  1. Get channel PRs from datastore
  2. Format as simple text list
  3. Return ephemeral response
- [ ] **Format**:
  ```
  📋 Open PRs in #channel-name (3)

  🔵 Draft: Fix authentication bug (#123) - @alice
  🟡 Ready: Add new API endpoint (#124) - @bob
  ✅ Approved: Update documentation (#125) - @charlie

  ⏰ Last updated: 2 minutes ago
  ```

#### 2.4 PR Deduplication
- [ ] **Task**: Ensure same PR URL doesn't create duplicates
- [ ] **Logic**: Use composite key `${channel_id}-${owner}-${repo}-${number}`
- [ ] **Update**: When duplicate detected, update `last_seen_at` timestamp
- [ ] **Acceptance**: Posting same PR multiple times updates existing record

#### 2.5 Message Event Trigger
- [ ] **Task**: Create trigger for message events
- [ ] **File**: `triggers/message_event_trigger.ts`
- [ ] **Type**: Event trigger on `message.channels`
- [ ] **Filters**: Only channels where bot is member

### Acceptance Criteria
- [ ] Bot detects GitHub PR URLs in messages automatically
- [ ] PR metadata is fetched and stored correctly
- [ ] `/prs` command shows tracked PRs for current channel only
- [ ] Duplicate PR URLs don't create duplicate records
- [ ] Bot gracefully handles private repos and API errors
- [ ] Message acknowledgment (reaction or thread) confirms tracking

---

## Phase 3: Advanced Features (Week 5-6)

### Goals
- Implement periodic PR status refresh
- Build rich Block Kit UI for `/prs` command
- Add end-of-day cleanup system
- Ensure per-channel data isolation

### Tasks

#### 3.1 Periodic Refresh System
- [ ] **Task**: Background job to refresh PR status from GitHub
- [ ] **Files**:
  - `workflows/refresh_workflow.ts`
  - `functions/pr_refresher.ts`
  - `triggers/refresh_trigger.ts`
- [ ] **Trigger**: Scheduled (hourly with internal batching)
- [ ] **Process**:
  ```typescript
  1. Process channels in priority order (most active first)
  2. For each channel, get open PRs for that channel only
  3. Group by repo to minimize API calls (max 80/hour)
  4. For each PR:
     a. Fetch latest data from GitHub
     b. Compare with stored data
     c. Update if changed
     d. Log significant changes
  5. Stop processing if approaching rate limits
  6. Log 'refresh_run' event with metrics
  ```
- [ ] **Rate Limiting**: Max 80 requests/hour (leaving 20 for real-time detection), implement queue with priority (new PRs first)

#### 3.2 Rich Block Kit UI
- [ ] **Task**: Enhance `/prs` command with interactive Block Kit interface
- [ ] **File**: `functions/prs_ui_builder.ts`
- [ ] **Features**:
  - Grouped sections: Open, Drafts, Recently Closed Today
  - Status indicators with emoji (🔵 Draft, 🟡 Ready, ✅ Approved, ❌ Changes Requested)
  - "Open PR" button for each item linking to GitHub
  - Metadata: Author, age, CI status, review count
  - Compact view with expand option for details
- [ ] **Layout**:
  ```
  📋 PRs in #dev-team (5 open)

  ✅ Fix auth bug (#123) @alice
     [Open PR]
  🟡 Add API endpoint (#124) @bob
     [Open PR]
  🔵 Draft: DB refactor (#125) @charlie
     [Open PR]

  [Show More...] (2 remaining)
  ```
  **Character Limit**: Max 15 PRs per response, pagination required for larger lists

#### 3.3 End-of-Day Cleanup
- [ ] **Task**: Automatic removal of closed PRs at day boundary
- [ ] **Files**:
  - `workflows/cleanup_workflow.ts`
  - `functions/pr_cleanup.ts`
  - `triggers/cleanup_trigger.ts`
- [ ] **Schedule**: Daily at channel's configured cleanup time
- [ ] **Logic**:
  ```typescript
  1. For each channel:
     a. Get channel timezone and cleanup hour
     b. Find closed/merged PRs older than today
     c. Archive PRs to event log before deletion
     d. Delete from active tracking
  2. Log 'cleanup_run' event with counts
  ```

#### 3.4 Channel Settings Management
- [ ] **Task**: Initialize and manage per-channel settings
- [ ] **File**: `functions/channel_settings.ts`
- [ ] **Auto-initialize**: When first PR detected in channel
- [ ] **Default Settings**:
  - Timezone: UTC
  - Refresh interval: Dynamic (15-60 min based on PR count)
  - Cleanup hour: 23 (11 PM)
  - Label filters: none

#### 3.5 Performance Optimizations
- [ ] **Task**: Add caching and query optimizations
- [ ] **Optimizations**:
  - Cache GitHub API responses for 1-2 minutes
  - Batch datastore queries where possible
  - Optimize PR list queries with indexes
  - Implement pagination for large channel PR lists

### Acceptance Criteria
- [ ] PR status updates automatically every 5 minutes
- [ ] `/prs` shows rich, interactive Block Kit interface
- [ ] "Open PR" buttons link correctly to GitHub
- [ ] Closed PRs are automatically cleaned up at end of day
- [ ] Each channel maintains separate PR list and settings
- [ ] UI gracefully handles empty states and loading states

---

## Phase 4: Production Readiness (Week 7-8)

### Goals
- Comprehensive error handling and user experience
- Secure GitHub token management
- Performance monitoring and optimization
- Channel setup and configuration flow

### Tasks

#### 4.1 Enhanced Error Handling
- [ ] **Task**: Comprehensive error handling with user-friendly messages
- [ ] **File**: `functions/error_messages.ts`
- [ ] **Scenarios**:
  ```typescript
  // GitHub authentication errors
  "🔒 Can't access private repo. Please check GitHub permissions."

  // Rate limiting
  "⏳ GitHub API rate limit reached. Trying again in 15 minutes."

  // Network errors
  "🌐 GitHub is temporarily unavailable. Retrying automatically."

  // Invalid PR URLs
  "❌ Invalid GitHub PR URL format"
  ```
- [ ] **Error Recovery**: Automatic retries with exponential backoff
- [ ] **User Notifications**: Thread replies for important errors only
- [ ] **Rate Limit Handling**: Queue PR detection when GitHub API limits reached
- [ ] **Volume Management**: Graceful degradation during high message volume periods

#### 4.2 GitHub Token Management
- [ ] **Task**: Secure token storage and rotation
- [ ] **Implementation**:
  - Support for both GitHub App and PAT authentication
  - Encrypted token storage in Slack datastore
  - Token validation and refresh logic
  - Graceful degradation when tokens expire
- [ ] **Setup Flow**:
  ```
  /prs-setup → Opens modal with GitHub authentication options
  → Validates token → Stores encrypted → Confirms setup
  ```

#### 4.3 Performance Monitoring
- [ ] **Task**: Add telemetry and performance tracking
- [ ] **Metrics**:
  - `/prs` command response time (p95, p99)
  - GitHub API response times and error rates
  - Background refresh job duration
  - Rate limit usage and remaining quota
- [ ] **Alerting**: Log warnings when approaching performance thresholds

#### 4.4 Setup and Configuration
- [ ] **Task**: Channel onboarding and settings management
- [ ] **Commands**:
  - `/prs-setup` - Initial GitHub authentication and settings
  - `/prs-config` - Update channel settings (timezone, filters, etc.)
- [ ] **Auto-setup**: Detect when bot added to new channel

#### 4.5 Data Migration and Validation
- [ ] **Task**: Safe deployment and data consistency
- [ ] **Migration**: Scripts to handle datastore schema changes
- [ ] **Validation**: Data integrity checks and cleanup tools
- [ ] **Backup**: Export/import functionality for PR data

#### 4.6 Testing Infrastructure
- [ ] **Task**: Comprehensive test coverage
- [ ] **Tests**:
  - Unit tests for all functions (PR parsing, GitHub client, etc.)
  - Integration tests for workflows
  - Mock GitHub API for consistent testing
  - Test different error scenarios and edge cases
- [ ] **Files**: Update all `*_test.ts` files with real test cases

### Acceptance Criteria
- [ ] All error scenarios provide helpful user guidance
- [ ] GitHub tokens are stored securely and rotated properly
- [ ] Performance metrics are tracked and within SLA (1.5s p95)
- [ ] Channel setup flow is intuitive and reliable
- [ ] Test coverage >80% with all critical paths tested
- [ ] Production deployment scripts and monitoring ready

---

## Phase 5: Enhancement & Polish (Week 9-10)

### Goals
- Advanced filtering and customization
- Per-channel configuration options
- Analytics and monitoring
- Final optimizations and polish

### Tasks

#### 5.1 Advanced Filtering
- [ ] **Task**: Add filtering options to `/prs` command
- [ ] **File**: `functions/pr_filters.ts`
- [ ] **Filters**:
  - Show only open PRs (hide drafts)
  - Show only my PRs (PRs authored by user)
  - Show only PRs awaiting review
  - Filter by labels or repository
  - Hide/show PRs by age (newer than X days)
- [ ] **UI**: Dropdown selectors in Block Kit interface

#### 5.2 Channel Configuration
- [ ] **Task**: Granular per-channel settings
- [ ] **Settings**:
  ```typescript
  interface ChannelConfig {
    refresh_interval: 2 | 5 | 10 | 15; // minutes
    cleanup_hour: number;              // 0-23
    timezone: string;                  // IANA timezone
    show_drafts: boolean;
    show_ci_status: boolean;
    label_filters: string[];           // Only track PRs with these labels
    repo_filters: string[];            // Only track these repos
    auto_react: boolean;               // React to messages with PR URLs
  }
  ```
- [ ] **Command**: `/prs-config` with interactive modal

#### 5.3 Analytics and Telemetry
- [ ] **Task**: Comprehensive event tracking and reporting
- [ ] **Events**:
  ```typescript
  pr_tracked: { channel_id, repo, pr_number, author }
  refresh_run: { duration_ms, pr_count, errors, github_quota_remaining }
  slash_prs_run: { channel_id, pr_count_shown, filters_used, response_time_ms }
  pr_closed_seen: { pr_age_hours, time_to_first_review_hours }
  error_auth: { scope, error_type }
  rate_limit_hit: { service: 'github' | 'slack', wait_time_sec }
  ```
- [ ] **Dashboard**: Simple analytics view in `/prs-stats` command

#### 5.4 Advanced UI Features
- [ ] **Task**: Polish and enhance user interface
- [ ] **Features**:
  - Expandable PR details (description preview, assignees, etc.)
  - Quick actions (assign reviewer, add label)
  - Keyboard shortcuts for power users
  - Customizable emoji and status indicators
  - Thread summaries for PR discussions

#### 5.5 Performance Optimization
- [ ] **Task**: Final performance tuning
- [ ] **Optimizations**:
  - Intelligent caching with TTL
  - Background pre-loading of PR data
  - Query optimization and indexing
  - Lazy loading for large PR lists
  - Response compression and caching

#### 5.6 Documentation and Help
- [ ] **Task**: User documentation and help system
- [ ] **Commands**:
  - `/prs-help` - Interactive help and onboarding
  - Built-in tips and feature discovery
- [ ] **Documentation**: Update README with setup and usage instructions

### Acceptance Criteria
- [ ] Filtering works correctly and improves UX
- [ ] Channel configuration is flexible and easy to use
- [ ] Analytics provide useful insights into usage patterns
- [ ] UI is polished and responsive
- [ ] Performance meets all SLA requirements
- [ ] Users can easily discover and learn features

---

## Technical Constraints & Performance Expectations

### Slack Platform Limits
- **Event Processing**: 30,000 events/workspace/hour maximum
- **Datastore Queries**: 1MB scan limit, pagination required for large datasets
- **Block Kit Responses**: 50 blocks max, ~13k characters total, 15-20 PRs practical limit
- **Channel Monitoring**: 20 channels max per event trigger (or all channels with billing impact)
- **Outgoing Domains**: 10 domains maximum

### GitHub API Constraints
- **Rate Limits**: 5,000 requests/hour for authenticated users
- **Practical Limit**: 80 requests/hour (reserve 20 for real-time detection)
- **Performance Impact**: Can refresh ~80 PRs per hour maximum
- **Batching Required**: Group requests by repository to optimize quota usage

### Realistic Performance Expectations
- **PR Detection**: Near real-time (< 30 seconds) for normal message volumes
- **Status Refresh**: 15-60 minute intervals based on workspace PR count
- **UI Response Time**: < 2 seconds for up to 15 PRs, pagination beyond that
- **Supported Scale**: Optimal for workspaces with < 100 active PRs across all channels

### Architecture Implications
- **No Cross-Channel Aggregation**: "All open PRs" queries not feasible at scale
- **Channel-First Design**: All operations scoped to individual channels
- **Queue-Based Processing**: Essential for message event handling
- **Priority Systems**: Active channels and new PRs get processing priority

---

## Deployment Strategy

### Environment Setup
1. **Development**: Local Slack workspace with test channels
2. **Staging**: Limited rollout to internal team channels
3. **Production**: Gradual rollout with feature flags

### Feature Flags
- `auto_pr_detection`: Enable/disable automatic PR URL detection
- `background_refresh`: Enable/disable periodic status updates
- `rich_ui`: Toggle between simple and rich Block Kit interface
- `analytics`: Enable/disable telemetry collection

### Rollback Plan
- Configuration flags to disable features
- Data export/import for migration scenarios
- Graceful degradation when GitHub API unavailable

### Monitoring and Alerting
- GitHub API rate limit usage (alert at 80%)
- `/prs` command response time (alert if p95 > 2.5s)
- Background refresh failure rate (alert if >5% over 15 min)
- Error rate tracking for all critical paths

---

## Risk Mitigation

### Technical Risks
1. **GitHub Rate Limiting**: Max 80 requests/hour shared across all channels - queue system required
2. **Slack Message Limits**: 15 PRs max per Block Kit response, mandatory pagination
3. **Token Expiration**: Automated rotation and user notifications
4. **Data Consistency**: Transaction-like operations where possible
5. **Message Processing Volume**: Max 30k events/hour per workspace - implement filtering
6. **Datastore Performance**: 1MB scan limits require pagination for large PR lists

### User Experience Risks
1. **Information Overload**: Default to essential info, expandable details
2. **Channel Spam**: Ephemeral responses and minimal notifications
3. **Setup Complexity**: Guided onboarding with sensible defaults

### Security Considerations
1. **Token Storage**: Encryption at rest, principle of least privilege
2. **Data Isolation**: Strict per-channel data separation
3. **Input Validation**: Sanitize all user inputs and URLs
4. **Rate Limiting**: Protect against abuse and API quota exhaustion

---

## Success Metrics

### Technical Metrics
- `/prs` command p95 response time ≤ 2 seconds (up to 15 PRs)
- Background refresh processes 80 PRs/hour maximum
- PR detection latency < 30 seconds during normal message volume
- Error rate < 2% for GitHub API operations (accounting for rate limits)
- Block Kit UI renders correctly with pagination for >15 PRs

### User Experience Metrics
- Time from PR posting to tracking ≤ 30 seconds (normal conditions)
- User adoption: ≥50% of invited channels actively use the bot
- Command usage: ≥3 `/prs` commands per active channel per day
- User satisfaction: ≥4.2/5 based on feedback (accounting for rate limit delays)
- Successful PR refresh rate: ≥90% within configured intervals

### Business Metrics
- Reduce average time-to-first-review by 20%
- Increase percentage of PRs with assigned reviewers within 2 hours
- Reduce "lost" PRs (PRs that receive no attention for >48 hours)

This implementation plan provides a comprehensive roadmap for transforming the starter template into a fully-featured PR tracking bot that meets all requirements while maintaining high quality and user experience standards.