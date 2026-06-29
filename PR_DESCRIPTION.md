# Test Coverage, Release Automation, and Dependency Management

This PR adds comprehensive test coverage for previously untested endpoints, implements automated release tagging with changelog generation, and configures Dependabot for automated dependency updates.

## Changes

### Test Coverage

- **#295** - Added integration tests for `POST /verify-content` and `GET /agent/status` endpoints
  - Created `server/src/routes/verify.test.ts`
  - Tests mock the OpenRouter API call and assert verification request/response shapes
  - Covers both approve and reject outcomes for content verification
  - Validates agent status response shape and recent activity structure
  - Tests run deterministically without real API calls

- **#296** - Added tests for `GET /registry/status` endpoint
  - Created `server/src/routes/registry.test.ts`
  - Mocks `registryClient` and config to avoid live Soroban RPC calls
  - Asserts response shape including contractId, network, and resourceCount
  - Validates Cache-Control header behavior (30 second max-age)
  - Covers RPC/registry failure paths with 503 error responses
  - Removed the `// TODO: add tests` comment from `registry.ts`

### Release Automation

- **#302** - Added automated release tagging and changelog generation
  - Created `.github/workflows/release.yml` using release-please action
  - Configured to trigger on pushes to `main` branch
  - Supports semantic versioning based on Conventional Commits:
    - `feat:` triggers minor version bumps
    - `fix:` triggers patch version bumps
  - Automatically generates `CHANGELOG.md` with release notes
  - Monitors version files across all workspace packages (server, web, mcp, registry-client)
  - Documented release workflow in `CONTRIBUTING.md`

### Dependency Management

- **#301** - Added Dependabot configuration for automated dependency updates
  - Created `.github/dependabot.yml`
  - Configured for three ecosystems:
    - npm/pnpm workspace (root directory)
    - GitHub Actions (root directory)
    - Cargo (contract directory)
  - Set weekly schedule (Mondays) to limit PR noise
  - Grouped dependencies to reduce number of PRs
  - Configured open-pull-requests limits to prevent flooding
  - Ignored major version updates for stability

## Testing

All new tests follow the existing test patterns in the codebase:
- Use vitest for test framework
- Mock external dependencies (API calls, database, config)
- Test both success and failure paths
- Validate response shapes and headers

## Files Changed

- `server/src/routes/verify.test.ts` (new)
- `server/src/routes/registry.test.ts` (new)
- `server/src/routes/registry.ts` (removed TODO comment)
- `.github/workflows/release.yml` (new)
- `.github/dependabot.yml` (new)
- `CONTRIBUTING.md` (added Releases section)

Closes #295, #296, #302, #301
