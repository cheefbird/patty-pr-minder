# Patty PR Minder

[![CI](https://github.com/cheefbird/patty-pr-minder/actions/workflows/ci.yml/badge.svg)](https://github.com/cheefbird/patty-pr-minder/actions/workflows/ci.yml)

Slack bot that tracks GitHub PR status and provides team visibility.

## Development Status

- 🔄 Phase 1: Foundation & Architecture (In Progress)
- 📋 Phase 2: Core PR Detection & Tracking (Planned)
- 📋 Phase 3: Advanced Features (Planned)

## Development

### Prerequisites

- [Deno](https://deno.land/) (latest version)
- [Slack CLI](https://api.slack.com/automation/cli) for deployment
- GitHub Personal Access Token (for PR data fetching)

### Quick Start

```bash
# Check code quality
deno task test

# Run specific checks
deno fmt --check  # Format check
deno lint         # Linting
deno check manifest.ts  # Type check
```

### CI/CD

This project uses GitHub Actions for continuous integration:

- **Format Check**: Ensures consistent code formatting
- **Linting**: Catches potential issues and enforces style
- **Type Checking**: Validates TypeScript throughout the project
- **Testing**: Runs unit tests (when present)
- **Build Verification**: Ensures Slack app compiles correctly

All PRs must pass CI checks before merging.

## Running Your Project Locally

While building your app, you can see your changes appear in your workspace in
real-time with `slack run`. You'll know an app is the development version if the
name has the string `(local)` appended.

```bash
# Run app locally
slack run

# Connected, awaiting events
```

To stop running locally, press `<CTRL> + C` to end the process.

## Deploying Your App

Once development is complete, deploy the app to Slack infrastructure using
`slack deploy`:

```bash
slack deploy
```

When deploying for the first time, you'll be prompted to create a new trigger
for the deployed version of your app.

## Viewing Activity Logs

Activity logs of your application can be viewed live and as they occur with the
following command:

```bash
slack activity --tail
```

## Project Structure

### `.slack/`

Contains `apps.dev.json` and `apps.json`, which include installation details for
development and deployed apps.

### `datastores/`

[Datastores](https://api.slack.com/automation/datastores) securely store data
for your application on Slack infrastructure. Required scopes include
`datastore:write` and `datastore:read`.

### `functions/`

[Functions](https://api.slack.com/automation/functions) are reusable building
blocks of automation that accept inputs, perform calculations, and provide
outputs.

### `workflows/`

A [workflow](https://api.slack.com/automation/workflows) is a set of steps
(functions) that are executed in order.

### `triggers/`

[Triggers](https://api.slack.com/automation/triggers) determine when workflows
are run based on events or user actions.

### `manifest.ts`

The [app manifest](https://api.slack.com/automation/manifest) contains the app's
configuration, including app name, description, and permissions.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and code
quality standards.

## Resources

To learn more about developing automations on Slack, visit:

- [Automation Overview](https://api.slack.com/automation)
- [CLI Quick Reference](https://api.slack.com/automation/cli/quick-reference)
- [Samples and Templates](https://api.slack.com/automation/samples)
