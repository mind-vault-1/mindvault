# Bounded audit-log queries

`queryAuditLog(path, query)` in `mcp/src/auditQuery.ts` lets MCP integrations and operator tooling inspect recent JSONL audit events without loading an entire file. It is a TypeScript API, **not a newly advertised MCP tool**.

Supported optional filters: `since` and `until` (parseable timestamps, inclusive), `tool` (exact `toolName` match), `outcome` (`start`, `success`, or `error`, exact `status` match), and `correlationId` (exact `correlationId` match). Filters compose with AND semantics. `offset` defaults to 0, and `limit` defaults to 50 (maximum 500). Results are in file order, with `nextOffset` for further pages and `truncated` to indicate older history outside the read window.

For exporting a single request trace across API, payment, and registry operations with explicit missing-span detection (`missingSpans`, `domainsObserved`, `complete`), use `exportCorrelationTrace(path, correlationId, options)` from `mcp/src/traceExport.ts` (also re-exported from `mcp/src/auditQuery.ts`).

Only the last 1 MiB of the file is read. An incomplete leading or trailing JSONL record is skipped. Entries are redacted again before return. Pagination offsets are stable for an unchanged file; concurrent rotation or writes can change the result set. For durable cross-rotation pagination, use a snapshot or cursor tied to a file generation.

This change does not modify existing MCP tool arguments or output schemas.
