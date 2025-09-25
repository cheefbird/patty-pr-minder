# GitHub Actions Workflows

This directory contains the CI/CD workflows for Patty PR Minder.

## Workflows

### `ci.yml` - Continuous Integration
**Triggers**: Push to main, Pull Requests
**Purpose**: Code quality assurance and testing

**Checks Performed**:
- Code formatting (`deno fmt --check`)
- Linting (`deno lint`)
- Type checking (all `.ts` files)
- Unit testing (`deno task test`)
- Slack manifest validation

**Requirements for Contributors**:
- All code must be properly formatted
- No linting errors allowed
- TypeScript must compile without errors
- Tests must pass (when present)
- Slack manifest must be valid

### `deploy.yml` - Deployment (Future)
**Triggers**: Manual (workflow_dispatch)
**Purpose**: Deploy to Slack workspaces
**Status**: Placeholder - will be implemented in later phases

## Local Development

Before pushing changes, run locally:
```bash
# Run all CI checks locally
deno task test

# Individual checks
deno fmt --check
deno lint
deno check manifest.ts
```

## Troubleshooting

### Common CI Failures

#### Format Check Failed
```bash
# Fix formatting issues
deno fmt
```

#### Lint Errors
```bash
# See lint errors
deno lint

# Most common fixes:
# - Add missing type annotations
# - Remove unused variables
# - Fix import order
```

#### Type Check Failed
```bash
# Check specific file
deno check path/to/file.ts

# Common issues:
# - Missing imports
# - Type mismatches
# - Invalid Slack SDK usage
```

## Branch Protection

Main branch is protected and requires:
- CI workflow to pass
- At least one review (recommended)
- Up-to-date branches before merge