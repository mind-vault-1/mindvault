# Issue & PR Labels

MindVault uses a small, consistent label taxonomy so contributors and
maintainers can triage at a glance and so open-source contributor **waves** can
be tracked together.

The canonical label set lives in [`.github/labels.yml`](../.github/labels.yml).
It is applied to the repository by the **Sync labels** workflow
([`.github/workflows/labels.yml`](../.github/workflows/labels.yml)) — edit
`labels.yml`, merge to `main`, and the workflow syncs the changes. To also
delete labels that are no longer in the file, run the workflow manually from the
Actions tab with **prune** enabled.

## The four families

Every triaged issue gets one label from each of the first three families, plus
an optional wave:

| Family         | How many        | Purpose                                   |
| -------------- | --------------- | ----------------------------------------- |
| `area:`        | exactly one     | Which part of the codebase                |
| `type:`        | exactly one     | What kind of change                       |
| `difficulty:`  | exactly one     | Expected effort / experience needed       |
| `wave:`        | zero or one     | Which contributor cohort it belongs to    |

### Area

Mirrors the **Affected area** dropdown in the issue templates, plus the shared
client package.

- `area: server` — Express API, services, workers (`server/`)
- `area: web` — React web app (`web/`)
- `area: contract` — Soroban vault-registry contract (`contract/`)
- `area: mcp` — MCP server for AI agents (`mcp/`)
- `area: registry-client` — shared `@mindvault/registry-client` package
  (`packages/registry-client/`)
- `area: docs` — documentation, README, guides (`docs/`)
- `area: ci` — CI workflows, tooling, repo config (`.github/`, `scripts/`)

Use more than one area label only when a change genuinely spans modules (e.g. a
feature that needs both `area: server` and `area: web`).

### Type

- `type: feature` — new functionality or capability
- `type: bug` — something is broken and needs fixing
- `type: docs` — documentation-only change
- `type: refactor` — neither fixes a bug nor adds a feature
- `type: test` — adds or improves automated tests
- `type: chore` — tooling, deps, config, housekeeping
- `type: security` — security hardening or vulnerability remediation

### Difficulty

- `good first issue` — beginner-friendly and well-scoped, with clear acceptance
  criteria. Kept as its own GitHub-recognized label so the newcomers feed and
  the **Good First Issue** template keep working.
- `difficulty: easy` — small, low-risk change; little context required
- `difficulty: medium` — moderate effort; a couple of areas or some context
- `difficulty: hard` — substantial effort, deep context, or cross-cutting

A `good first issue` is also `difficulty: easy`. Apply both: the first powers
GitHub's newcomer discovery, the second keeps the difficulty scale complete.

### Wave

Open-source contributor waves group issues into cohorts that are opened,
triaged, and tracked together.

- `wave: backlog` — triaged and ready, but not yet assigned to a wave
- `wave: 1`, `wave: 2`, `wave: 3` — the active/scheduled cohorts

Add the next number (`wave: 4`, …) to `.github/labels.yml` when a new cohort
starts.

## Triage checklist

When a new issue comes in:

1. Add exactly one `area:` label (the template's Affected area answers this).
2. Add exactly one `type:` label.
3. Add exactly one difficulty label (`good first issue` + `difficulty: easy`, or
   one of `difficulty: easy|medium|hard`).
4. Optionally add `wave:` once the issue is slated for a cohort, otherwise
   `wave: backlog`.
5. Add `help wanted` if you'd welcome an external contributor picking it up.

## Workflow / status labels (kept)

These GitHub defaults remain in use:

- `help wanted` — maintainers would welcome a contributor picking this up
- `duplicate` — already tracked by another issue or PR
- `wontfix` — out of scope; will not be worked on
- `question` — a question or request for more information, not actionable work

## Cleaned-up / retired defaults

The following stock GitHub labels were **ambiguous or duplicated** by the new
taxonomy and should be removed (run **Sync labels** with prune enabled, which
drops any label not in `labels.yml`):

| Old default     | Replaced by                                   |
| --------------- | --------------------------------------------- |
| `bug`           | `type: bug`                                   |
| `enhancement`   | `type: feature`                               |
| `documentation` | `type: docs` (+ `area: docs`)                 |
| `invalid`       | `wontfix` or close as not-planned             |

Issue templates still apply the stock labels (`bug`, `enhancement`,
`documentation`) on creation; a triager swaps them for the prefixed `type:`
equivalents. Keeping the templates unchanged avoids surprising contributors,
while the prefixed labels keep the board consistent.
