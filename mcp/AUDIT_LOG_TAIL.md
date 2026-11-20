# Debug bundle audit-log tail

`mindvault_debug_bundle` reads a bounded tail of the configured `MINDVAULT_AUDIT_LOG_FILE` rather than loading the entire audit history. Its on-disk read is limited to the last **256 KiB**, then at most `auditLogLines` entries are returned (default 50; maximum 500). Entries are reported in chronological order, with secret redaction retained.

The `auditLog.truncated` boolean is `true` when the 256 KiB window excluded older bytes. This may also mean that a line crossing the start of the window was skipped, to avoid reporting incomplete JSONL entries as full events. `false` means the file was read from its beginning (or no audit data was requested); a smaller `auditLogLines` setting can still omit earlier events. The field is additive and does not change existing bundle fields or the `mindvault.debug-bundle/v1` schema identifier.

Set `MINDVAULT_AUDIT_LOG_FILE` to enable file collection. This export is intended for recent diagnostics, not complete audit-history archival.
