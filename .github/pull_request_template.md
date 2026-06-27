## Summary

<!-- What changed and why? -->

## Testing

<!-- How did you verify this? Include commands, curl snippets, or e2e-test output. -->

## Screenshots

<!-- If this touches the web UI, add before/after screenshots. Otherwise delete this section. -->

## Linked issues

<!-- Closes #, Fixes #, or "none" -->

---

**Checklist**

- [ ] PR title follows Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- [ ] Build passes (`pnpm build:server` / `pnpm --filter @mindvault/web build`)
- [ ] Tests pass (`pnpm test`)
- [ ] Contract changes tested (`pnpm contract:test`)
- [ ] No secrets committed (`.env` is gitignored; use `.env.example` for placeholders)
- [ ] Docs/comments updated if behaviour changed
