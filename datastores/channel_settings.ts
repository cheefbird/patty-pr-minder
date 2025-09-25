import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * Channel Settings Datastore
 *
 * Stores per-channel configuration for PR tracking behavior.
 * Each channel can have custom timezone, refresh intervals, and filters.
 */
const ChannelSettingsDatastore = DefineDatastore({
  name: "ChannelSettings",
  primary_key: "channel_id",
  attributes: {
    channel_id: { type: Schema.slack.types.channel_id },
    timezone: { type: Schema.types.string }, // IANA timezone
    refresh_interval_minutes: { type: Schema.types.number }, // 15-60 min
    cleanup_hour: { type: Schema.types.number }, // 0-23 for daily cleanup
    label_filters: {
      type: Schema.types.array,
      items: { type: Schema.types.string },
    },
    created_at: { type: Schema.types.string },
    updated_at: { type: Schema.types.string },
  },
});

export default ChannelSettingsDatastore;
