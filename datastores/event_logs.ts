import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * Event Logs Datastore
 *
 * Stores analytics and monitoring events for PR tracking operations.
 * Uses flexible properties object for extensible event-specific data.
 */
const EventLogsDatastore = DefineDatastore({
  name: "EventLogs",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string }, // UUID
    event_type: { type: Schema.types.string }, // 'pr_tracked' | 'refresh_run' | etc.
    channel_id: { type: Schema.slack.types.channel_id }, // Optional
    properties: { type: Schema.types.object }, // Event-specific data
    timestamp: { type: Schema.types.string }, // ISO string
  },
});

export default EventLogsDatastore;
