# Repository Guidelines

## Project Structure & Module Organization
- `manifest.ts` declares the Slack app manifest, outgoing domains, and datastore wiring.
- `datastores/*.ts` defines Slack datastore schemas (for example `tracked_prs.ts`) that upcoming workflows will query.
- `.slack/apps.dev.json` and `hooks.json` pin local Slack targets; avoid committing secrets or workspace-specific IDs.
- `docs/*.md` captures architecture notes and requirements referenced during onboarding.
- `assets/default_new_app_icon.png` is the app icon packaged with deployments; keep replacements square PNGs.
- `.github/workflows/` owns CI (`ci.yml`); keep it updated when adding checks or tasks.

## Build, Test, and Development Commands
- `deno task test` runs format check, lint, and `deno test --allow-read`; run it before every push.
- `deno fmt --check` verifies formatting; use `deno fmt` to auto-format when needed.
- `deno lint` enforces the Deno rule set aligned with Slack SDK expectations.
- `deno task check` shells into Biome for deeper static analysis and auto-organizes imports.
- `slack run` starts the app against your workspace; stop with `CTRL+C` when finished.
- `slack deploy` publishes to Slack infrastructure, while `slack activity --tail` tails production logs.

## Coding Style & Naming Conventions
- Formatting is managed by Deno fmt with 2-space indents and double quotes, as enforced by `biome.json`.
- Prefer explicit TypeScript exports (`PascalCase` types, `camelCase` functions, `SCREAMING_SNAKE_CASE` constants).
- Keep modules narrowly scoped - datastore helpers should live beside their schema files.
- Document non-obvious logic with concise inline comments; reserve block comments for multi-step flows.

## Testing Guidelines
- Author tests with Deno's standard asserts, naming files `*_test.ts` next to the code they cover.
- Use fixtures or mocks rather than real Slack or GitHub calls; stage shared helpers under `docs/` until a `tests/` folder lands.
- Run `deno test --allow-read path/to/file_test.ts` for focused suites, and ensure `deno task test` stays green before opening a PR.
- There is no formal coverage threshold yet, but new behavior must ship with “happy path” and failure-path coverage.

## Commit & Pull Request Guidelines
- Recent history favors short, imperative messages (for example `install biome`); keep that tone while adding Conventional Commit prefixes (`feat`, `fix`, `docs`) when it adds clarity.
- Branch off main using `feature/<slug>` or `chore/<task>` to mirror the CONTRIBUTING.md guidance.
- PRs must describe the problem, summarize the solution, and note local verification (commands run, screenshots for Slack UI changes).
- Link issues in the PR body, ensure GitHub Actions CI passes, and call out updates to `.slack/*.json` so reviewers can mirror your setup.

## Slack App Operations
- Manage secrets with `slack env add` or workspace-level configuration; never hard-code tokens or commit them inside `.slack` JSON.
- When adding new workflows or functions, register them in `manifest.ts` and document trigger behavior in `docs/` so future agents can replay the setup quickly.
