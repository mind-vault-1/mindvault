# Local-only validation mode

`MINDVAULT_LOCAL_VALIDATION=1` turns the MCP server into an offline validator.
Every tool call is checked locally and answered with a structured report; no
tool handler runs and no request leaves the process. It is intended for CI,
contributor laptops, and pre-deployment checks where the API, Horizon, Soroban
RPC, x402 facilitator, or sponsored-wallet service is unavailable or must not
be contacted.

## Enable it

Add the variable to your client's MCP server environment block:

```json
{
  "mcpServers": {
    "mindvault": {
      "command": "node",
      "args": ["/absolute/path/to/mindvault/mcp/dist/index.js"],
      "env": {
        "MINDVAULT_LOCAL_VALIDATION": "1"
      }
    }
  }
}
```

Truthy values are `1`, `true`, `yes`, and `on` (case-insensitive). Anything else
leaves live execution unchanged. See
[client configurations](mcp-client-configs.md) for the per-client setup and
[mcp-env-variables.md](mcp-env-variables.md) for the full variable reference.

## What happens to a call

Local validation takes precedence over mock mode, read-only mode, mainnet
guardrails, paid-operation confirmation, and the normal dispatch handlers. The
dispatcher accepts the tool name, then stops before auth checks, API reachability
preflight, and every handler. Startup contract-binding checks, catalog cache
pre-warming, and retention passes are skipped as well.

The reply uses the discriminator `mindvault.local-validation/v1` in both the
text and `structuredContent`:

```json
{
  "schema": "mindvault.local-validation/v1",
  "mode": "local-only",
  "ok": true,
  "noOutbound": true,
  "tool": "mindvault_browse",
  "arguments": { "status": "pass", "issues": [] },
  "configuration": {
    "status": "warn",
    "diagnostics": [
      {
        "variable": "STELLAR_NETWORK",
        "severity": "warning",
        "message": "Unrecognized value \"devnet\"; defaulting to testnet.",
        "expected": "testnet or mainnet"
      }
    ],
    "resolved": {
      "stellarNetwork": "testnet",
      "x402Network": "stellar:testnet",
      "registryContractIdConfigured": true
    }
  },
  "limitations": [
    "No MindVault API, Horizon, Soroban RPC, x402, sponsored-wallet, or other outbound request was made."
  ]
}
```

`arguments.status` is `fail` when the call's arguments do not match the shared
argument specs or the tool's advertised input schema. `configuration.status` is
`fail` for error-severity diagnostics, `warn` when only warnings were found, and
`pass` when the environment is clean. `ok` is true only when both checks pass.
Configuration findings use the same diagnostics collector as server startup, so
a problem reported here is the same problem that would block a live launch.

## Limitations

- No API, Horizon, Soroban RPC, x402, sponsored-wallet, or other outbound
  request is made. Endpoint reachability, response shapes, and credentials are
  therefore not validated.
- No wallet signature, payment challenge, or on-chain state is verified. A
  passing report does not mean a live call would succeed.
- Argument checks cover the advertised input schemas and the shared
  `TOOL_ARGUMENT_SPECS`. Semantic rules enforced by a remote service are out of
  scope.
- Tools that validate their own arguments (`mindvault_publish_status` and
  `mindvault_publish_batch`) are checked against their advertised input schema
  rather than the shared specs.
- No state, receipt, profile, or wallet file is read or written by a validation
  call. A successful report does not prove local persistence is healthy.
- Resource and prompt handlers are unaffected by this mode; it applies to tool
  calls only.

## Related

- [Client configurations](mcp-client-configs.md)
- [Tool arguments](mcp-tool-arguments.md)
- [Structured output](mcp-structured-output.md)
- [Deployment verification](mcp-deployment-verification.md)
