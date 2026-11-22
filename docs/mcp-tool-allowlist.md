# MCP Tool Allowlist

`MINDVAULT_TOOL_ALLOWLIST` restricts an MCP server to an explicit list of tools. It is intended for deployments that need a narrower boundary than [`MINDVAULT_READ_ONLY`](./environment-variables.md#mcp-read-only-mode): for example, a support console that may browse the catalog and read purchase history but cannot publish, buy, or rotate credentials.

This is an operator setting on the server process. No tool argument can widen it, and changing the list requires a restart.

## Configuration

```
MINDVAULT_TOOL_ALLOWLIST=mindvault_browse,mindvault_catalog_search,mindvault_purchase_history
```

Entries are comma-separated, trimmed, and deduplicated. Names must match the exact tool names in [`mcp-tool-reference.md`](./mcp-tool-reference.md). An unset or blank value means "no restriction": every implemented tool is advertised and dispatchable, exactly as before this feature existed.

## Enforcement

The allowlist is applied in two places, and both matter:

1. **`tools/list` advertises only allowed tools.** An agent does not plan around a tool the deployment will refuse.
2. **Dispatch refuses every other tool.** A client working from a cached tool list, or one that guesses a name, still receives a deterministic refusal that names the tool, the configured list, and the environment variable that controls it.

A name in the allowlist that is not an implemented tool is never advertised — the allowlist can only narrow the real tool surface, never invent one.

## Interaction with other guardrails

- **Read-only mode** intersects with the allowlist. A mutating tool listed in `MINDVAULT_TOOL_ALLOWLIST` is still refused when `MINDVAULT_READ_ONLY=1`.
- **Mainnet and paid-operation guardrails** still apply to any mutating or spending tool that survives both filters. Being allowlisted does not bypass per-call confirmation.
- **Dry runs** do not bypass the allowlist. As with read-only mode, the allowlist describes what the server is for, not what a call costs.

## Operational implications

- The capability version derived from `tools/list` changes when the allowlist changes, so clients that pin a tool-set fingerprint will see a new value after a restart.
- Refusals are agent-facing and contain no secrets, paths, or stack traces. They are safe to surface directly to a user.
- Removing a tool from the list takes effect only after the server process is restarted with the new value.

The complete variable inventory, including defaults and accepted values, is generated in [`mcp-env-variables.md`](./mcp-env-variables.md); see also [`environment-variables.md`](./environment-variables.md#mcp-tool-allowlist).
