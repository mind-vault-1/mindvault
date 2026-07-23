# MCP Tool Metrics

The MindVault MCP server can collect **optional, opt-in metrics** about tool
usage: how often each tool is called, how many calls fail, how long they take,
and how many x402 payment attempts succeed or fail. This is useful for operators
who want lightweight visibility into an agent's activity without wiring up a full
observability stack.

Metrics are **off by default** and add zero bookkeeping unless enabled.

## Enabling

Set the `MINDVAULT_METRICS` environment variable to a truthy value
(`1`, `true`, `yes`, or `on`) before starting the server:

```bash
MINDVAULT_METRICS=1 node /path/to/mindvault/mcp/dist/index.js
```

When disabled, the `mindvault_metrics` tool returns a short note explaining how
to turn it on rather than any counters.

## Reading metrics

Call the `mindvault_metrics` tool. Pass `reset: true` to clear the counters
after reading (useful for periodic sampling).

Example output when enabled:

```json
{
  "enabled": true,
  "since": "2026-07-23T18:00:00.000Z",
  "totals": { "calls": 7, "errors": 1 },
  "payments": { "attempts": 2, "failures": 0 },
  "tools": {
    "mindvault_browse": { "calls": 3, "errors": 0, "totalDurationMs": 41, "maxDurationMs": 18 },
    "mindvault_buy": { "calls": 2, "errors": 1, "totalDurationMs": 220, "maxDurationMs": 140 }
  }
}
```

- `totals` — aggregate call and error counts across all tools.
- `payments` — x402 payment attempts recorded on `mindvault_publish`
  (content verification) and `mindvault_buy`, with the failing subset.
- `tools` — per-tool call/error counts and durations in milliseconds
  (`totalDurationMs` is the sum, `maxDurationMs` the slowest single call).

## Safety

Metrics contain **only tool names, counts, and durations** — never tool
arguments, wallet keys, or API keys. Snapshots are safe to surface to an agent.
When metrics are disabled, no data is collected at all. Failures are still
reported through each tool's normal deterministic `Error: …` response; the
metrics layer only counts them and never alters the message.

The behavior is covered by unit tests in
[`mcp/src/metrics.test.ts`](../mcp/src/metrics.test.ts), including the success
and failure counter paths and the no-secret-leak guarantee.
