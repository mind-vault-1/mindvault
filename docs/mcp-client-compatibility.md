# MCP client compatibility matrix

This page answers two questions:

- Which MCP clients does the MindVault MCP server support?
- What do you lose if a client doesn't implement an optional MCP feature?

The copy-paste configs themselves are in
[`mcp-client-configs.md`](mcp-client-configs.md).

**Short version:** every client below can use every MindVault tool. The server
needs only stdio and MCP tools. Everything else it offers is optional, and the
same information is always reachable through a plain tool call.

## What the server requires and offers

These are the capabilities the server declares in its `initialize` response,
from [`mcp/src/index.ts`](../mcp/src/index.ts):

```json
{ "tools": {}, "prompts": {}, "resources": { "subscribe": true } }
```

| MCP feature                          | MindVault uses it for                                                                                                               | Required? | If the client lacks it                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stdio transport                      | The only transport: `node mcp/dist/index.js`                                                                                        | **yes**   | The client cannot connect. Remote-only (HTTP) clients are not supported.                                                                                       |
| `tools/list`, `tools/call`           | Every `mindvault_*` operation                                                                                                       | **yes**   | Nothing works.                                                                                                                                                 |
| Tool annotations                     | `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint` on every tool ([details](mcp-tool-annotations.md))                     | no        | Advisory only. The tool still works, but the client may not mark destructive calls or ask for confirmation. The server enforces its own guardrails either way. |
| `outputSchema` / `structuredContent` | Machine-readable results for structured tools ([details](mcp-structured-output.md))                                                 | no        | Every result also carries the same data as a JSON text block in `content`, so a text-only client loses nothing.                                                |
| Progress notifications               | `mindvault_publish_status` (`wait: true`), `mindvault_buy`, `mindvault_register_onchain` ([details](mcp-progress-notifications.md)) | no        | Sent only when the request carries a `progressToken`. Without one, the call returns its final result as normal.                                                |
| Resources                            | `mindvault://server/status`, `mindvault://resource/<id>`                                                                            | no        | Use `mindvault_network_profile` for the server status and `mindvault_preview` for a catalog entry.                                                             |
| Resource subscriptions               | `notifications/resources/updated` for `mindvault://server/status` ([details](mcp-server-status-resource.md))                        | no        | Re-read the status, or call `mindvault_network_profile`, after switching profile or network.                                                                   |
| Prompts                              | `publish` and `buy` templates                                                                                                       | no        | Ask the agent to call `mindvault_publish` / `mindvault_buy` directly.                                                                                          |
| Sampling, roots, elicitation         | Not used                                                                                                                            | no        | No effect.                                                                                                                                                     |

## Client matrix

| Client                              | `mindvault_client_config` id | Config file                                                                                                                  | Top-level key                       | Add from the CLI                             | Client MCP docs                                                                             |
| ----------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Claude Code                         | `claude-code`                | `.mcp.json` (project scope), or written by `claude mcp add`                                                                  | `mcpServers`                        | `claude mcp add mindvault -- node …`         | [Claude Code MCP](https://code.claude.com/docs/en/mcp)                                      |
| Claude Desktop                      | `claude-desktop`             | `claude_desktop_config.json` (per-OS path in [configs](mcp-client-configs.md#claude-desktop)); restart the app after editing | `mcpServers`                        | —                                            | [Connect local servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers) |
| Codex                               | `codex`                      | `~/.codex/config.toml`                                                                                                       | `[mcp_servers.<name>]`              | `codex mcp add mindvault -- node …`          | [Codex MCP](https://developers.openai.com/codex/mcp)                                        |
| Cursor                              | `cursor`                     | `.cursor/mcp.json` or `~/.cursor/mcp.json`                                                                                   | `mcpServers`                        | —                                            | [Cursor MCP](https://cursor.com/docs/context/mcp)                                           |
| VS Code (GitHub Copilot agent mode) | `vscode`                     | `.vscode/mcp.json`                                                                                                           | `servers` (needs `"type": "stdio"`) | —                                            | [VS Code MCP servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) |
| Windsurf                            | `windsurf`                   | `~/.codeium/windsurf/mcp_config.json`                                                                                        | `mcpServers`                        | —                                            | [Windsurf MCP](https://docs.windsurf.com/windsurf/cascade/mcp)                              |
| MCP Inspector (testing)             | —                            | none (command line)                                                                                                          | —                                   | `npx @modelcontextprotocol/inspector node …` | [Inspector](https://modelcontextprotocol.io/docs/tools/inspector)                           |

Notes that apply to every row:

- **Use an absolute path** to `mcp/dist/index.js`. Clients start the server
  from an unpredictable working directory.
- **Pass configuration as env vars** in the client config (`env` block, or
  `--env` for `claude mcp add`). The server has no `.env` file of its own. Every
  variable is listed in [`mcp-client-configs.md`](mcp-client-configs.md#environment-variables).
- **VS Code is the odd one out.** It uses `servers` instead of `mcpServers`, and
  each entry needs `"type": "stdio"`, so a block copied from another client's
  config has to be adapted.
- **Optional features differ by client and by client version.** Clients ship MCP
  support for resources, prompts and progress at different times. The links in
  the last column are the authority on what a given version supports. This
  page does not try to track that, because nothing MindVault does depends on it
  (see the previous table).

## Checking a client yourself

1. Connect the client and ask it to run `mindvault_browse`. If it returns
   catalog entries, the stdio transport and tool calls are working, which is
   everything MindVault needs.
2. Ask it to run `mindvault_client_config` with your client's id. The result is
   that client's config, pre-filled with the running server's real entrypoint
   path and network profile.
3. To see exactly what any client sees, run the Inspector against the built
   server with the offline mock enabled:

   ```bash
   pnpm --filter @mindvault/mcp build
   MINDVAULT_MOCK=1 npx @modelcontextprotocol/inspector node mcp/dist/index.js
   ```

   When this was written, a scripted SDK client connecting over stdio received
   the capabilities shown above, the `publish` and `buy` prompts, and the
   `mindvault://server/status` resource plus one `mindvault://resource/<id>`
   per mock catalog entry. Every listed tool carried annotations. A call to
   `mindvault_registry_count` returned a `text` content block **and**
   `structuredContent`.

## Compatibility notes

- **Transport.** Only stdio is supported. A client that can reach MCP servers
  only over HTTP (Streamable HTTP or SSE) cannot use MindVault without an
  stdio-to-HTTP bridge. No bridge is shipped or tested.
- **Protocol revision.** Tool annotations and structured output follow MCP
  revision `2025-06-18`
  ([tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)).
  Older clients that predate those fields ignore them and keep working on the
  text content.
- **Read-only deployments.** With `MINDVAULT_READ_ONLY=1`, every client sees
  only the browsing tools. Nothing in that mode is client-specific.

[`clientCompatibilityDocs.test.ts`](../mcp/src/clientCompatibilityDocs.test.ts)
keeps this page in sync with the code. It fails if the client ids, server
capabilities, prompt names, resource URIs or progress-reporting tools named
here drift from the implementation.

Related: [`mcp-client-configs.md`](mcp-client-configs.md),
[`mcp-verify-install.md`](mcp-verify-install.md),
[`mcp-architecture.md`](mcp-architecture.md).
