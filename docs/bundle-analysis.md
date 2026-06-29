# Web Bundle Analysis

## Overview

The MindVault web app uses [rollup-plugin-visualizer](https://github.com/btd/rollup-plugin-visualizer) to produce an interactive treemap of the production bundle. This lets contributors spot dependency bloat before it reaches main.

## Size budget

| Metric | Budget |
|--------|--------|
| Individual chunk warning threshold | **800 KB** (uncompressed) |

Vite emits a warning for any chunk that exceeds 800 KB. The CI build (`pnpm --filter @mindvault/web build`) will surface these warnings in the job log so regressions are visible on every PR.

## Baseline (as of initial measurement)

Run `pnpm --filter @mindvault/web bundle:stats` to generate an up-to-date `web/stats.html` report. The table below documents the baseline established when bundle analysis was introduced.

| Chunk | Approx. gzip size | Notes |
|-------|-------------------|-------|
| `index` (React + app code) | ~120 KB | Main entry |
| `@stellar/stellar-sdk` | ~210 KB | Stellar SDK — large but necessary |
| `@stellar/freighter-api` | ~30 KB | Wallet connector |
| `i18next` + translations | ~45 KB | EN + ES locales |
| `@sentry/react` | ~40 KB | Error tracking |
| **Total (gzip)** | **~445 KB** | Well within budget |

> These figures are approximate. Always regenerate the report after adding or upgrading dependencies.

## Generating a local report

```bash
# From the repo root:
pnpm --filter @mindvault/web bundle:stats
# Opens web/stats.html in your default browser (macOS/Linux).
# On Windows: open web/stats.html manually after the build completes.
```

`web/stats.html` is listed in `.gitignore` and is never committed.

## CI enforcement

`pnpm --filter @mindvault/web build` runs on every PR via `.github/workflows/pr.yml`. Vite prints a warning to stdout when any chunk exceeds the 800 KB threshold — check the **Typecheck, build, lint, and tests** job log for lines like:

```
(!) Some chunks are larger than 800 kB after minification.
```

If you see this warning, investigate with `bundle:stats` and consider code-splitting or replacing the offending dependency.
