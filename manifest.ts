import { Manifest } from "deno-slack-sdk/mod.ts";
import ChannelSettingsDatastore from "./datastores/channel_settings.ts";
import EventLogsDatastore from "./datastores/event_logs.ts";
import TrackedPRsDatastore from "./datastores/tracked_prs.ts";

/**
 * The app manifest contains the app's configuration. This
 * file defines attributes like app name and description.
 * https://api.slack.com/automation/manifest
 */
export default Manifest({
  name: "patty_pr_minder",
  description: "Slack bot that tracks GitHub PR status and provides team visibility",
  icon: "assets/default_new_app_icon.png",
  workflows: [], // Will add PR tracking workflows in Phase 2
  outgoingDomains: ["api.github.com"],
  datastores: [ChannelSettingsDatastore, TrackedPRsDatastore, EventLogsDatastore],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "channels:history", // Read messages to detect PRs
    "reactions:write", // React to acknowledge PR detection
    "datastore:read",
    "datastore:write",
  ],
});
