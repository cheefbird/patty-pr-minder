# Contributing to Patty PR Minder

## Development Workflow

1. **Fork and Clone**
   ```bash
   git clone your-fork-url
   cd patty-pr-minder
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Changes**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

4. **Test Locally**
   ```bash
   deno task test  # Run all checks
   ```

5. **Submit PR**
   - Ensure CI passes
   - Provide clear description
   - Link to related issues

## Code Quality Standards

### Formatting
- Use `deno fmt` for consistent formatting
- No custom formatting exceptions

### Linting
- Follow all `deno lint` rules
- Add `// deno-lint-ignore` only when absolutely necessary
- Include reason in ignore comments

### TypeScript
- Prefer explicit types over `any`
- Use proper Slack SDK types
- Export interfaces for reusable types

### Testing
- Test new functions and workflows
- Use descriptive test names
- Mock external APIs (GitHub, Slack)

### Commit Messages
- Use conventional commits format
- Examples:
  - `feat: add PR deduplication logic`
  - `fix: handle GitHub rate limiting`
  - `docs: update API documentation`

## CI/CD Pipeline

All PRs must pass:
- ✅ Format check (`deno fmt --check`)
- ✅ Linting (`deno lint`)
- ✅ Type checking (`deno check`)
- ✅ Tests (`deno test`)
- ✅ Build verification

## Getting Help

- Check existing issues for similar problems
- Review documentation in `/docs` folder
- Ask questions in PR comments
- Follow the issue templates for bug reports and features