/**
 * Install verification for the MindVault MCP server.
 *
 * `verifyInstall` runs a set of purely local, synchronous checks and returns a
 * structured report that an agent can act on without making any network calls.
 * It answers the question "is this MCP server installed and configured
 * correctly?" — useful as the very first thing a new agent calls after
 * connecting.
 *
 * Design constraints:
 *   - No I/O, no network, no process.exit — fully pure and unit-testable.
 *   - Never echoes secret values; anything that looks like a Stellar secret key
 *     is redacted before it appears in the output.
 *   - Returns a human-readable summary plus a machine-readable `ok` flag so
 *     an agent can branch on the result without parsing text.
 */

import { redactSecrets } from "./diagnostics.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstallCheck {
  /** Short label identifying this check. */
  name: string;
  /** Whether the check passed. */
  ok: boolean;
  /** Human-readable detail — what was found, or what is wrong. */
  detail: string;
}

export interface InstallVerification {
  /** True only when every check passed. */
  ok: boolean;
  /** The resolved Node.js version string, e.g. "v20.11.0". */
  nodeVersion: string;
  /** Individual check outcomes in a stable order. */
  checks: InstallCheck[];
  /** Multi-line human-readable summary, safe to surface directly to an agent. */
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Semver major from a Node.js version string such as "v20.11.0" → 20. */
function nodeMajor(version: string): number {
  const match = version.match(/^v?(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Validate that a string is an absolute http(s) URL.
 * Returns null when the value is absent/empty (treated as "using default").
 */
function urlIssue(variable: string, value: string | undefined): InstallCheck | null {
  if (!value || !value.trim()) return null; // unset → default in use, that is fine
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        name: variable,
        ok: false,
        detail: `${variable} must be an http(s) URL; got: "${redactSecrets(value)}"`,
      };
    }
    return { name: variable, ok: true, detail: `${variable}: ${value.trim()} (custom)` };
  } catch {
    return {
      name: variable,
      ok: false,
      detail: `${variable} is not a valid URL: "${redactSecrets(value)}"`,
    };
  }
}

// ── Core ──────────────────────────────────────────────────────────────────────

const NODE_MINIMUM = 20;

/**
 * Run install verification against the provided environment and Node.js version.
 * Both parameters are injectable so the function is deterministic in tests.
 */
export function verifyInstall(
  env: NodeJS.ProcessEnv,
  nodeVersion: string = process.version,
): InstallVerification {
  const checks: InstallCheck[] = [];

  // 1. Node.js version — must be ≥ 20
  const major = nodeMajor(nodeVersion);
  checks.push({
    name: "node_version",
    ok: major >= NODE_MINIMUM,
    detail:
      major >= NODE_MINIMUM
        ? `Node.js ${nodeVersion} (>= v${NODE_MINIMUM} required) ✓`
        : `Node.js ${nodeVersion} is below the minimum v${NODE_MINIMUM}. Upgrade Node.js.`,
  });

  // 2. STELLAR_NETWORK — must be "testnet", "mainnet", or absent (defaults to testnet)
  const rawNetwork = (env.STELLAR_NETWORK ?? "").trim().toLowerCase();
  const knownNetworks = new Set(["testnet", "mainnet", "pubnet", "public"]);
  if (rawNetwork === "" || knownNetworks.has(rawNetwork)) {
    checks.push({
      name: "STELLAR_NETWORK",
      ok: true,
      detail:
        rawNetwork === ""
          ? "STELLAR_NETWORK: unset (defaults to testnet)"
          : `STELLAR_NETWORK: ${rawNetwork}`,
    });
  } else {
    checks.push({
      name: "STELLAR_NETWORK",
      ok: false,
      detail: `STELLAR_NETWORK "${rawNetwork}" is not recognised. Use "testnet" or "mainnet".`,
    });
  }

  // 3. MINDVAULT_URL — optional, but must be a valid URL when set
  const urlCheckMv = urlIssue("MINDVAULT_URL", env.MINDVAULT_URL);
  checks.push(
    urlCheckMv ?? {
      name: "MINDVAULT_URL",
      ok: true,
      detail: "MINDVAULT_URL: unset (default hosted backend in use)",
    },
  );

  // 4. SPONSORED_ACCOUNT_URL — optional, but must be a valid URL when set
  const urlCheckSa = urlIssue("SPONSORED_ACCOUNT_URL", env.SPONSORED_ACCOUNT_URL);
  checks.push(
    urlCheckSa ?? {
      name: "SPONSORED_ACCOUNT_URL",
      ok: true,
      detail: "SPONSORED_ACCOUNT_URL: unset (default service in use)",
    },
  );

  // 5. HORIZON_URL and SOROBAN_RPC_URL — optional network-service overrides,
  // but must be valid HTTP(S) URLs before any request is attempted.
  for (const variable of ["HORIZON_URL", "SOROBAN_RPC_URL"] as const) {
    const check = urlIssue(variable, env[variable]);
    checks.push(
      check ?? {
        name: variable,
        ok: true,
        detail: `${variable}: unset (network preset in use)`,
      },
    );
  }

  // 6. VAULT_REGISTRY_CONTRACT_ID — required on mainnet; optional on testnet
  const isMainnet = rawNetwork === "mainnet" || rawNetwork === "pubnet" || rawNetwork === "public";
  const contractId = (env.VAULT_REGISTRY_CONTRACT_ID ?? "").trim();
  if (isMainnet && !contractId) {
    checks.push({
      name: "VAULT_REGISTRY_CONTRACT_ID",
      ok: false,
      detail:
        "VAULT_REGISTRY_CONTRACT_ID is required on mainnet. Deploy vault-registry and set its contract ID.",
    });
  } else if (contractId && !/^C[A-Z2-7]{55}$/.test(contractId)) {
    checks.push({
      name: "VAULT_REGISTRY_CONTRACT_ID",
      ok: false,
      detail:
        "VAULT_REGISTRY_CONTRACT_ID does not look like a Stellar contract ID (C + 55 base32 chars).",
    });
  } else {
    checks.push({
      name: "VAULT_REGISTRY_CONTRACT_ID",
      ok: true,
      detail: contractId
        ? `VAULT_REGISTRY_CONTRACT_ID: ${contractId}`
        : "VAULT_REGISTRY_CONTRACT_ID: unset (testnet default in use)",
    });
  }

  // 6. No plaintext secret key in the environment.  Operators sometimes
  //    accidentally put AGENT_SECRET_KEY or similar in the MCP client config;
  //    this check catches the most common variable names without echoing the value.
  const secretEnvVars = Object.keys(env).filter((k) => /secret|private.*key|mnemonic/i.test(k));
  if (secretEnvVars.length > 0) {
    checks.push({
      name: "no_plaintext_secrets",
      ok: false,
      detail: `Environment variable(s) that may contain secrets found in the MCP process env: ${secretEnvVars.join(", ")}. Move secrets out of the MCP client config.`,
    });
  } else {
    checks.push({
      name: "no_plaintext_secrets",
      ok: true,
      detail: "No obvious secret-key variable names found in the MCP process environment.",
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const allOk = checks.every((c) => c.ok);
  const lines: string[] = [];

  lines.push(allOk ? "✓ MindVault MCP install OK." : "✗ MindVault MCP install has issues.");
  lines.push("");

  for (const check of checks) {
    lines.push(`${check.ok ? "✓" : "✗"} ${check.detail}`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    lines.push("");
    lines.push(`${failed.length} check(s) failed. Fix the items marked ✗ above, then try again.`);
    lines.push("See docs/mcp-client-configs.md for install instructions.");
  }

  return {
    ok: allOk,
    nodeVersion,
    checks,
    summary: lines.join("\n"),
  };
}

/**
 * Format the verification result as a plain text string suitable for returning
 * directly from an MCP tool handler.
 */
export function formatVerifyInstall(result: InstallVerification): string {
  return result.summary;
}
