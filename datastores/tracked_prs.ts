import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * Tracked PRs Datastore
 *
 * Stores GitHub PR metadata and tracking information for each channel.
 * Uses composite primary key format: "${channel_id}::${owner}::${repo}::${number}"
 * Safe delimiter (::) prevents collision attacks from malicious repo names.
 *
 * Key Generation Utility (implement in application code):
 * const createTrackedPRId = (channel_id: string, owner: string, repo: string, number: number) =>
 *   `${channel_id}::${owner}::${repo}::${number}`;
 */
const TrackedPRsDatastore = DefineDatastore({
  name: "TrackedPRs",
  primary_key: "id", // Format: "${channel_id}::${owner}::${repo}::${number}"
  attributes: {
    id: { type: Schema.types.string },
    channel_id: { type: Schema.slack.types.channel_id },
    repo_full_name: { type: Schema.types.string }, // "owner/repo"
    pr_number: { type: Schema.types.number },
    title: { type: Schema.types.string },
    author: { type: Schema.types.string },
    html_url: { type: Schema.types.string },
    state: { type: Schema.types.string }, // 'open' | 'closed' | 'merged'
    draft: { type: Schema.types.boolean },
    review_state: { type: Schema.types.string }, // 'pending' | 'approved' | etc.
    ci_state: { type: Schema.types.string }, // 'success' | 'failure' | etc.
    labels: { type: Schema.types.array, items: { type: Schema.types.string } },
    first_seen_at: { type: Schema.types.string },
    last_seen_at: { type: Schema.types.string },
    last_refreshed_at: { type: Schema.types.string },
    created_at: { type: Schema.types.string },
    updated_at: { type: Schema.types.string },
  },
});

export default TrackedPRsDatastore;
