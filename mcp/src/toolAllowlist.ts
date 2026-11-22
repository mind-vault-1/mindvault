/**
 * Explicit tool allowlist for restricted deployments (#1199).
 *
 * `MINDVAULT_READ_ONLY` (see `readOnlyMode.ts`) restricts the server to the
 * tools that declare `readOnlyHint`. That is a useful coarse boundary, but an
 * operator sometimes needs a narrower one: a support agent that may only see
 * the catalog and purchase receipts, or a kiosk that may only call
 * `mindvault_browse`. A single "read only" switch cannot express either.
 *
 * An allowlist is set once, on the server process:
 *
 *   MINDVAULT_TOOL_ALLOWLIST=mindvault_browse,mindvault_catalog_search
 *
 * Like read-only mode it is enforced in two places that must agree:
 *
 *   1. **ListTools advertises only allowed tools**, so an agent does not plan
 *      around a tool the deployment will refuse.
 *   2. **Dispatch refuses anything not on the list**, including tools held by a
 *      client with a cached tool list or one that simply guesses a name.
 *
 * When the variable is unset (or blank) the full servable surface is exposed,
 * so existing deployments are unaffected. Names are matched exactly and an
 * unknown name is refused: the allowlist is a security boundary, not a hint,
 * and no tool argument can widen it. It composes with read-only mode as an
 * intersection — a mutating tool that is explicitly allowlisted is still
 * refused when `MINDVAULT_READ_ONLY` is on.
 */

/** Environment variable holding the comma-separated tool allowlist. */
export const TOOL_ALLOWLIST_ENV_VAR = "MINDVAULT_TOOL_ALLOWLIST";

/** Parsed allowlist. An empty list means "no restriction". */
export interface ToolAllowlist {
  readonly names: ReadonlySet<string>;
  readonly isEmpty: boolean;
}

/** Parse a comma-separated allowlist: trim entries, drop blanks and duplicates. */
export function parseToolAllowlist(raw: string | undefined | null): ToolAllowlist {
  if (raw == null) return { names: new Set(), isEmpty: true };
  const names = new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
  return { names, isEmpty: names.size === 0 };
}

/** Read the allowlist from an environment (live on every call). */
export function resolveToolAllowlist(env: NodeJS.ProcessEnv = process.env): ToolAllowlist {
  return parseToolAllowlist(env[TOOL_ALLOWLIST_ENV_VAR]);
}

/** Whether a tool may be advertised/dispatched under this allowlist. */
export function isToolAllowed(toolName: string, allowlist: ToolAllowlist): boolean {
  if (allowlist.isEmpty) return true;
  return allowlist.names.has(toolName);
}

/**
 * Deterministic refusal for a tool outside the allowlist.
 *
 * No secrets, paths or stack traces; it names the operator variable and the
 * effective allowlist so the caller can act on it.
 */
export function toolAllowlistRefusalError(toolName: string, allowlist: ToolAllowlist): Error {
  const allowed = [...allowlist.names].sort();
  return new Error(
    [
      `Tool allowlist: "${toolName}" is not enabled for this MCP server (${TOOL_ALLOWLIST_ENV_VAR}).`,
      `Allowed tools: ${allowed.join(", ")}.`,
      `Lifting this requires restarting the server with a different ${TOOL_ALLOWLIST_ENV_VAR} — no tool argument can override it.`,
    ].join(" "),
  );
}

/** Assert a tool may run under the current allowlist. No-op when unrestricted. */
export function assertToolAllowedInAllowlist(
  toolName: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const allowlist = resolveToolAllowlist(env);
  if (isToolAllowed(toolName, allowlist)) return;
  throw toolAllowlistRefusalError(toolName, allowlist);
}

/** Narrow an advertised tool list to the configured allowlist. */
export function filterToolsForAllowlist<T extends { name: string }>(
  tools: readonly T[],
  env: NodeJS.ProcessEnv = process.env,
): T[] {
  const allowlist = resolveToolAllowlist(env);
  if (allowlist.isEmpty) return [...tools];
  return tools.filter((tool) => isToolAllowed(tool.name, allowlist));
}

/** Compact allowlist line for operator/agent status output. */
export function formatToolAllowlistDiagnostics(env: NodeJS.ProcessEnv = process.env): string {
  const allowlist = resolveToolAllowlist(env);
  if (allowlist.isEmpty) {
    return `Tool allowlist: off — set ${TOOL_ALLOWLIST_ENV_VAR} to a comma-separated list of tool names to restrict this server`;
  }
  const names = [...allowlist.names].sort().join(", ");
  return `Tool allowlist: ON (${TOOL_ALLOWLIST_ENV_VAR}) — ${allowlist.names.size} tools advertised: ${names}`;
}
