# Corrupt state file recovery (#1207)

At startup the MCP server loads `~/.mindvault/state.json`. A file is treated
as corrupt in three cases:

- it cannot be read (`unreadable`)
- it is not valid JSON (`invalid_json`)
- it parses but holds no valid profile (`no_profiles`)

The server handles a corrupt file like this:

1. The file is moved aside to `state.json.corrupt-<epoch ms>` with its bytes
   unchanged, and the server starts with empty state.
2. For invalid JSON, the line and column of the first syntax error are
   recorded. The parser's message is replaced with a fixed description, so
   file contents such as secret keys never reach stderr or tool output.
3. If the file cannot be moved aside (for example, the directory is
   read-only), every later state write is blocked. The damaged file is never
   overwritten by a fresh profile.

`mindvault_state_diagnostics` reports what happened:

- `status`: `ok`, `missing`, `recovered` or `unrecovered`
- `reason` and `detail`
- `position`
- `quarantinePath`
- `writesBlocked`
- the encrypted backups under `~/.mindvault/backups` and earlier quarantined
  copies, newest first
- numbered `nextSteps`: restore the newest backup with
  `mindvault_restore_state`, or re-import the wallet with
  `mindvault_import_wallet` when there is no backup, then take a fresh backup.

Coverage: [`mcp/src/stateRecovery.test.ts`](../mcp/src/stateRecovery.test.ts)
and [`mcp/src/stateDiagnostics.integration.test.ts`](../mcp/src/stateDiagnostics.integration.test.ts).
