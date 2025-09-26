# Repository Guidelines

## Onboarding Expectations
- Before touching code, read the entire repository: `README.md`, `docs/IMPLEMENTATION.md`, `docs/REQUIREMENTS.md`, and open issues so you understand current goals.
- Revisit Slack app concepts (manifest, functions, workflows, datastores) and Deno basics (permissions, tasks, module imports) at the start of every session.
- Review Slack CLI usage until you are comfortable running `slack run`, `slack deploy`, `slack activity --tail`, and managing environments; deployment work will rely on these commands. 
- Use the GitHub CLI (`gh issue list --state all --limit 100` and `gh issue view <id>`) to pull every issue, study them individually and holistically, and align them with the implementation plan so you know current progress.
- Capture any unknowns or risks you uncover during review and clarify them before you begin implementing changes.

## Project Structure & Key Artifacts
- `manifest.ts` tracks scopes, outgoing domains, and (soon) workflow registrations.
- `datastores/*.ts` define channel settings, tracked PRs, and event log schemas used by upcoming workflows.
- `.slack/` holds workspace bindings (never check in real workspace secrets); `.github/workflows/ci.yml` enforces format, lint, type-check, and test gates.
- `docs/` contains requirements and implementation plans; reference these before altering architecture or behavior.

## Development Workflow
- Copy `sample.env` to `.env`, provide a valid `GITHUB_TOKEN`, and leave `TEST_GH_API=0` unless you intentionally run the live GitHub integration test.
- Core commands:
  - `deno task test` to execute format, lint, and test in one pass.
  - `deno fmt --check`, `deno lint`, `deno check manifest.ts` when you need targeted checks.
  - `slack run` to exercise the bot locally; stop with `CTRL+C`.
  - `slack deploy` to release to Slack infrastructure once deployment work is approved.
- When a user asks “can you propose…”, supply options or recommendations only—do not implement changes unless explicit approval follows.

## Coding Style & Conventions
- Adhere to Deno fmt (2-space indentation, double quotes) and Biome defaults; avoid manual formatting exceptions.
- Use explicit TypeScript exports, `PascalCase` types, `camelCase` functions, and `SCREAMING_SNAKE_CASE` constants.
- Keep modules narrowly scoped, colocate helpers with related datastores or workflows, and add short inline comments for non-trivial logic.

## Testing & Review
- Place unit tests beside their sources (`*_test.ts`) and mock Slack and GitHub interactions. Only run the live GitHub test after setting `TEST_GH_API=1` with a real token.
- Run `deno task test` before pushing changes and record the commands you executed in PR descriptions.
- Pull requests must explain intent, list verification steps, link issues, and flag changes under `.slack/` so reviewers can replicate your setup.

## Deployment Readiness
- Keep manifest scopes and datastore schemas synchronized with the codebase and update docs when they change.
- Before deploying, verify Slack CLI auth, ensure `slack deploy` succeeds against a staging workspace, and document any manual steps for future agents.
