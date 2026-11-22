# Adding an MCP tool

This guide walks through adding a tool to the MindVault MCP server and
validating it before you open a PR. The worked example throughout is
`mindvault_registry_count`, an existing read-only tool small enough to follow
end to end.

For the protocol itself, see the MCP specification's
[Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
page. It defines `inputSchema`, `outputSchema`, `structuredContent` and
annotations. This server targets protocol revision 2025-06-18, as noted in
[`mcp/src/tools.ts`](../mcp/src/tools.ts).

## Where a tool is declared

Several files must agree for a single tool, and tests fail if any of them
disagree. Every row below is required unless it says otherwise.

| #   | File                                                              | Symbol                                      | What to add                                                                                                                 |
| --- | ----------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`mcp/src/tools.ts`](../mcp/src/tools.ts)                         | `TOOL_DEFINITIONS`                          | Name, description, `inputSchema`, `annotations`, and optionally `outputSchema`. This is what `tools/list` returns.          |
| 2   | [`mcp/src/validation.ts`](../mcp/src/validation.ts)               | `TOOL_ARGUMENT_SPECS`                       | One spec per argument. The dispatcher rejects anything not declared here.                                                   |
| 3   | [`mcp/src/index.ts`](../mcp/src/index.ts)                         | `dispatchToolOutcome`                       | A `case "<tool>":` in the switch that calls your handler.                                                                   |
| 4   | [`mcp/src/outputSchemas.ts`](../mcp/src/outputSchemas.ts)         | `<NAME>_OUTPUT_SCHEMA`                      | Only for structured tools. Referenced from the definition in row 1.                                                         |
| 5   | [`mcp/src/toolSideEffects.ts`](../mcp/src/toolSideEffects.ts)     | `TOOL_SIDE_EFFECTS`                         | What the handler does to local state, the network, and the wallet. Annotations and guardrails are checked against this row. |
| 6   | [`mcp/src/paidOperations.ts`](../mcp/src/paidOperations.ts)       | `USDC_SPENDING_TOOLS`, `FEE_SPENDING_TOOLS` | Only if the tool spends USDC or network fees.                                                                               |
| 7   | [`mcp/src/mainnetGuardrails.ts`](../mcp/src/mainnetGuardrails.ts) | `MAINNET_GATED_TOOLS`                       | Only if the tool submits a transaction.                                                                                     |
| 8   | [`mcp/src/toolDocs.ts`](../mcp/src/toolDocs.ts)                   | group lists                                 | Put the tool in a named reference group. A tool that falls through to `"Other"` fails `toolDocs.test.ts`.                   |
| 9   | [`mcp/src/validation.test.ts`](../mcp/src/validation.test.ts)     | `VALID_CALLS`                               | A valid argument object for the tool. The fixture table must cover every spec.                                              |

Read-only mode (`MINDVAULT_READ_ONLY=1`) needs no entry. It advertises exactly
the tools whose `annotations.readOnlyHint` is `true`, so a wrong annotation
there changes which tools a read-only deployment exposes.

## Worked example: `mindvault_registry_count`

**1. Definition** in `tools.ts`:

```ts
{
  name: "mindvault_registry_count",
  description: "Return on-chain resource counts directly from the vault-registry contract: …",
  inputSchema: {
    type: "object",
    properties: {
      creator: {
        type: "string",
        description: "Optional Stellar public key (G…). When supplied, also returns …",
        examples: ["GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"],
      },
    },
    required: [],
  },
  outputSchema: REGISTRY_COUNT_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
  annotations: {
    title: "Registry Count",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
},
```

Every property needs a `type` and a `description`. `toolSchemaSnapshots.test.ts`
fails otherwise. Write the description for the agent: say what the tool
returns and when to use it.

**2. Argument spec** in `validation.ts`:

```ts
mindvault_registry_count: {
  creator: { kind: "string" },
},
```

Spec names and `required` flags must match `inputSchema` exactly. Reuse the
shared specs (`STELLAR_ADDRESS` and others) where they fit.

**3. Dispatch** in `index.ts`, inside `dispatchToolOutcome`:

```ts
case "mindvault_registry_count":
  return registryCount(optionalString(args, "creator"));
```

The handler (`registryCount`) returns a JSON string. `normalizeToolResult` in
[`toolResult.ts`](../mcp/src/toolResult.ts) parses it into
`structuredContent`. The `tools/call` handler then checks the result against
the advertised `outputSchema` before sending it
(see [`mcp-structured-output.md`](mcp-structured-output.md)). Handlers must
branch on `_isMock()` so tests and the smoke run never touch the network.

**4. Output schema** in `outputSchemas.ts`: `REGISTRY_COUNT_OUTPUT_SCHEMA`.
`TOOL_DEFINITIONS` wraps every output schema with the error variant
automatically, so describe only the success shape.

**5. Side effects** in `toolSideEffects.ts`:

```ts
mindvault_registry_count: READ,
```

Use the presets (`READ`, `CHAIN_FEE`, `CHAIN_FEE_WITH_HISTORY`, …) or spell
out `{ local, remote, payment }`. Describe the worst case over all arguments.

**8–9.** The name is listed in the `"Registry & Diagnostics"` group in
`toolDocs.ts`, and `VALID_CALLS` has `mindvault_registry_count: {}`.

## Validate it

Run these from the repo root. They are the same commands CI runs in
[`.github/workflows/pr.yml`](../.github/workflows/pr.yml).

```bash
pnpm install
pnpm run build:registry-client                 # the MCP package imports it

# 1. Contract and unit tests for the tool surface
pnpm --filter @mindvault/mcp exec vitest run \
  src/listToolsContract.test.ts src/validation.test.ts \
  src/toolSideEffects.test.ts src/toolMetadata.test.ts \
  src/toolSchemaSnapshots.test.ts src/toolDocs.test.ts \
  src/toolDescriptions.test.ts src/outputSchemas.test.ts

# 2. Snapshots: review the diff, then accept it
pnpm --filter @mindvault/mcp exec vitest run -u \
  src/toolMetadata.test.ts src/toolSchemaSnapshots.test.ts
git diff mcp/src/__snapshots__/

# 3. Regenerate the tool reference, then confirm it is current
pnpm --filter @mindvault/mcp generate-tool-docs
pnpm --filter @mindvault/mcp check-tool-docs

# 4. Full MCP suite, build, and the stdio smoke run
pnpm --filter @mindvault/mcp test
pnpm --filter @mindvault/mcp build
pnpm --filter @mindvault/mcp smoke             # mock upstreams, no network
```

What each suite catches:

| Test file                     | Fails when                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `listToolsContract.test.ts`   | A tool is in one of rows 1–4 but not the others, checked against a live `tools/list` response.   |
| `validation.test.ts`          | Spec and `inputSchema` disagree on names or `required`, or `VALID_CALLS` is missing the tool.    |
| `toolSideEffects.test.ts`     | Annotations or guardrail lists disagree with `TOOL_SIDE_EFFECTS`, or a "read" tool writes files. |
| `toolMetadata.test.ts`        | Annotations are missing or contradictory. The pinned tool-name snapshot changed.                 |
| `toolSchemaSnapshots.test.ts` | A property lacks a type or description, or a schema changed without updating the snapshot.       |
| `toolDocs.test.ts`            | The tool is not in a named group.                                                                |
| `toolDescriptions.test.ts`    | `docs/mcp-tool-reference.md` is stale, so run `generate-tool-docs`.                              |

If a test fails on a clean checkout of `main` too, the failure predates your
change. Say so in the PR rather than updating snapshots to hide it.

### Try it in a real client

Build, then point the
[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) at the
stdio entrypoint with the mock upstreams enabled:

```bash
pnpm --filter @mindvault/mcp build
MINDVAULT_MOCK=1 npx @modelcontextprotocol/inspector node mcp/dist/index.js
```

In the Inspector, list tools and confirm your tool appears with the expected
annotations and schemas. Then call it, and check that the response has both a
text `content` block and, for structured tools, `structuredContent`. For a
specific editor or desktop client, see
[`mcp-client-configs.md`](mcp-client-configs.md).

## Checklist for the PR

- [ ] Rows 1–3, 5, 8 and 9 above, plus rows 4, 6 and 7 where they apply
- [ ] Annotations match what the handler does (`readOnlyHint` controls read-only mode)
- [ ] Mock branch in the handler, so tests and smoke runs work offline
- [ ] Snapshot diffs reviewed and committed
- [ ] `docs/mcp-tool-reference.md` and `mcp/GENERATED_MCP_TOOL_SUMMARY.md` regenerated
- [ ] New environment variables documented in [`mcp-client-configs.md`](mcp-client-configs.md). `clientConfigDocs.test.ts` enforces this.

## Compatibility notes

- Adding a tool is backward compatible. Clients discover it on the next
  `tools/list`.
- Renaming or removing a tool, removing an argument, or making an argument
  required is breaking for agents and saved prompts that call it. Call it out
  in the PR and in the changelog.
- Tightening an `outputSchema` can break clients that validate
  `structuredContent`, because the server refuses to send a result that does
  not match. Loosen first, then tighten once handlers comply.

Related: [`mcp-architecture.md`](mcp-architecture.md),
[`mcp-tool-annotations.md`](mcp-tool-annotations.md),
[`mcp-tool-arguments.md`](mcp-tool-arguments.md),
[`mcp-structured-output.md`](mcp-structured-output.md),
[`mcp-progress-notifications.md`](mcp-progress-notifications.md).
