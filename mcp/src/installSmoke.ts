/**
 * Fixture-backed install smoke check for the MindVault MCP server.
 *
 * The README tells an agent operator to install the server by pointing their
 * client at the built entry point:
 *
 *     claude mcp add mindvault node /path/to/mindvault/mcp/dist/index.js
 *
 * Nothing in CI exercised that path. The unit suites import modules directly,
 * the integration harness wires an in-memory transport to an already-imported
 * `Server`, and the tarball test inspects packaging metadata without ever
 * starting the process — so a build that compiles and packs correctly could
 * still fail to boot, and did: a duplicated `server.connect(transport)` made
 * every real install die on startup while the whole suite stayed green.
 *
 * This module defines that missing check as data: the ordered tool calls a
 * freshly installed client makes in its first seconds (list the tools, verify
 * the install, read the catalog, preview a resource, look one up on-chain), and
 * the environment that makes them deterministic. Every call is served by the
 * in-process fixtures of `mock.ts` (MINDVAULT_MOCK=1), so the check needs no
 * network, no funded wallet, and no live backend, and agent state is redirected
 * to a scratch HOME so a run never touches `~/.mindvault/state.json`.
 *
 * The module is transport-free and side-effect-free: `scripts/install-smoke.ts`
 * spawns the built server over stdio and feeds it these steps through
 * `runSmoke`, and the unit tests drive the same steps against a fake client.
 */

import type { SmokeReport, SmokeStep } from "./smoke.js";

/**
 * Tools a freshly installed server must advertise.
 *
 * Deliberately short: the point is to catch an install that boots but serves
 * nothing useful, not to duplicate the full tool-surface assertions that
 * `integration.test.ts` and the metadata snapshots already own.
 */
export const REQUIRED_INSTALL_TOOLS = [
  "mindvault_verify_install",
  "mindvault_wallet_info",
  "mindvault_browse",
  "mindvault_search",
  "mindvault_preview",
  "mindvault_buy",
] as const;

/** Resource id seeded by the mock fixtures; every fixture-backed step uses it. */
export const FIXTURE_RESOURCE_ID = "mock-1";

/**
 * Variables `mindvault_verify_install` flags as secret-bearing.
 *
 * Kept in sync with the check in verifyInstall.ts on purpose: a variable whose
 * name looks like a secret has no business in an MCP client config, so the
 * install check treats its presence as a finding. Dropping them here keeps the
 * smoke run deterministic on a developer machine or CI runner that happens to
 * export one, while still modelling the documented install exactly.
 */
const SECRET_ENV_NAME = /secret|private.*key|mnemonic/i;

/**
 * Environment for the child server process.
 *
 * `home` isolates agent state, and mock mode serves every upstream from
 * fixtures. `STELLAR_NETWORK` is pinned so the run does not inherit an
 * operator's mainnet setting, and the purchase store is redirected into the
 * scratch home so an export never reads a real purchase history.
 */
export function installSmokeEnv(
  home: string,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (!SECRET_ENV_NAME.test(key)) env[key] = value;
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    MINDVAULT_MOCK: "1",
    STELLAR_NETWORK: "testnet",
    MINDVAULT_PURCHASES_FILE: `${home}/purchases.json`,
  };
}

/**
 * The ordered install scenario.
 *
 * Read-only by design: an install check must be safe to run against any
 * configuration, so it never publishes, pays, or writes to the chain. Each step
 * asserts on the result text, because a tool can return a soft failure
 * ("No resources listed yet.") as a perfectly successful tool call.
 */
export function buildInstallSmokeSteps(): SmokeStep[] {
  return [
    {
      label: "Verify install",
      tool: "mindvault_verify_install",
      expect: (text) => /^✓ MindVault MCP install OK\./m.test(text),
      expectMessage:
        "mindvault_verify_install reported a problem with the installation (see the ✗ lines below).",
    },
    {
      label: "Browse catalog (fixtures)",
      tool: "mindvault_browse",
      expect: (text) => text.includes(FIXTURE_RESOURCE_ID),
      expectMessage: `Browse did not return the seeded fixture resource ${FIXTURE_RESOURCE_ID}. Is MINDVAULT_MOCK=1 set for the server process?`,
    },
    {
      label: "Browse sorted by price",
      tool: "mindvault_browse",
      args: { sort: "price_asc", limit: 10 },
      expect: (text) => text.includes(FIXTURE_RESOURCE_ID),
      expectMessage:
        "Sorted browse failed — the catalog sort arguments are advertised but not accepted.",
    },
    {
      label: "Search catalog (fixtures)",
      tool: "mindvault_search",
      args: { query: "Stellar" },
      expect: (text) => text.includes(FIXTURE_RESOURCE_ID),
      expectMessage: "Search did not match the seeded fixture resource.",
    },
    {
      label: "Preview resource (fixtures)",
      tool: "mindvault_preview",
      args: { resourceId: FIXTURE_RESOURCE_ID },
      expect: (text) => text.includes(FIXTURE_RESOURCE_ID),
      expectMessage: "Preview did not return the seeded fixture resource.",
    },
    {
      label: "Registry lookup (fixtures)",
      tool: "mindvault_registry_lookup",
      args: { resourceId: FIXTURE_RESOURCE_ID },
      expect: (text) => text.includes('"found": true'),
      expectMessage: "Registry lookup did not find the seeded fixture resource.",
    },
    {
      label: "Export receipts",
      tool: "mindvault_export_receipts",
      args: { format: "json" },
      expect: (text) => text.includes("mindvault.receipt-export/v1"),
      expectMessage: "Receipt export did not return a versioned export envelope.",
    },
  ];
}

/** Outcome of the tool-listing check that runs before the scenario. */
export interface ToolSurfaceCheck {
  ok: boolean;
  /** Advertised tools that were expected but missing. */
  missing: string[];
  /** How many tools the server advertised. */
  advertised: number;
}

/** Check that a freshly booted server advertises the tools an agent needs. */
export function checkToolSurface(toolNames: string[]): ToolSurfaceCheck {
  const advertised = new Set(toolNames);
  const missing = REQUIRED_INSTALL_TOOLS.filter((name) => !advertised.has(name));
  return { ok: missing.length === 0, missing, advertised: toolNames.length };
}

/** Human-readable one-line summary of a finished install smoke run. */
export function formatInstallSmokeReport(report: SmokeReport, entry: string): string {
  if (report.ok) {
    return `✓ install smoke passed — ${report.steps.length} checks against ${entry}`;
  }
  return `✗ install smoke failed at "${report.failedStep}" — ${entry}`;
}
