/**
 * RPC URL validation contract tests (Issue #1274).
 *
 * Covers the full validation contract for SOROBAN_RPC_URL and HORIZON_URL
 * across both the startup-diagnostics layer (diagnostics.ts) and the
 * install-verification layer (verifyInstall.ts):
 *
 *   - Valid http / https URLs are accepted
 *   - Unsupported schemes (ws, wss, ftp, …) are rejected with a specific message
 *   - Embedded credentials (user:pass@host) are rejected and never echoed
 *   - A completely unparseable string is rejected with a distinct message
 *   - Absent / empty values fall back to the network preset (no diagnostic)
 *   - Credential redaction is consistent: the raw password never appears in
 *     any diagnostic message, formatted report, or verifyInstall check detail
 *
 * Both layers are tested against the same inputs so a regression in either
 * layer is caught here.
 */

import { describe, it, expect } from "vitest";
import {
  collectStartupDiagnostics,
  formatDiagnostics,
  hasBlockingDiagnostics,
} from "./diagnostics.js";
import { verifyInstall } from "./verifyInstall.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const NODE_OK = "v20.11.0";
const SDK_OK = "1.29.0";

const RPC_VARS = ["HORIZON_URL", "SOROBAN_RPC_URL"] as const;
type RpcVar = (typeof RPC_VARS)[number];

/** A minimal env that passes every check other than the URLs under test. */
const BASE_ENV: NodeJS.ProcessEnv = { STELLAR_NETWORK: "testnet" };

/**
 * Return a testnet-inferred hostname URL for the given variable so that
 * validateNetworkConfig does not also fire a cross-network diagnostic, keeping
 * tests focused on scheme/credential behaviour.
 */
function testnetUrl(variable: RpcVar, creds?: string): string {
  const prefix = creds ? `${creds}@` : "";
  if (variable === "SOROBAN_RPC_URL") {
    return `https://${prefix}soroban-testnet.example.com`;
  }
  return `https://${prefix}horizon-testnet.example.com`;
}

// ── Diagnostics layer ─────────────────────────────────────────────────────────

describe("RPC URL validation — diagnostics layer", () => {
  describe("valid URLs are accepted", () => {
    it.each(RPC_VARS)("accepts https:// for %s", (variable) => {
      const diags = collectStartupDiagnostics(
        { ...BASE_ENV, [variable]: testnetUrl(variable) },
        true,
      );
      expect(diags.find((d) => d.variable === variable)).toBeUndefined();
    });

    it.each(RPC_VARS)("accepts http:// for %s", (variable) => {
      // Use the testnet-inferred hostname so validateNetworkConfig does not fire.
      const url = testnetUrl(variable).replace("https://", "http://");
      const diags = collectStartupDiagnostics({ ...BASE_ENV, [variable]: url }, true);
      expect(diags.find((d) => d.variable === variable)).toBeUndefined();
    });

    it.each(RPC_VARS)("accepts absent %s (preset in use)", (variable) => {
      const diags = collectStartupDiagnostics({ ...BASE_ENV }, true);
      expect(diags.find((d) => d.variable === variable)).toBeUndefined();
    });

    it.each(RPC_VARS)("accepts empty-string %s (treated as absent)", (variable) => {
      const diags = collectStartupDiagnostics({ ...BASE_ENV, [variable]: "" }, true);
      expect(diags.find((d) => d.variable === variable)).toBeUndefined();
    });
  });

  describe("unsupported schemes are rejected", () => {
    // For scheme tests we can use any hostname — the scheme check fires before
    // isHttpUrl() returns true, so validateNetworkConfig never sees these URLs.
    const badSchemes: Array<[RpcVar, string]> = [
      ["SOROBAN_RPC_URL", "ws://rpc.example.com"],
      ["SOROBAN_RPC_URL", "wss://rpc.example.com"],
      ["SOROBAN_RPC_URL", "ftp://rpc.example.com"],
      ["HORIZON_URL", "ws://horizon.example.com"],
      ["HORIZON_URL", "ftp://horizon.example.com"],
    ];

    it.each(badSchemes)("%s=%s → blocking error naming the scheme", (variable, url) => {
      const diags = collectStartupDiagnostics({ ...BASE_ENV, [variable]: url }, true);
      const diag = diags.find((d) => d.variable === variable);
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe("error");
      expect(diag?.message).toMatch(/Unsupported URL scheme/);
      expect(hasBlockingDiagnostics(diags)).toBe(true);
    });

    it("names the actual scheme in the message, not a generic placeholder", () => {
      const diags = collectStartupDiagnostics(
        { ...BASE_ENV, SOROBAN_RPC_URL: "wss://rpc.example.com" },
        true,
      );
      const diag = diags.find((d) => d.variable === "SOROBAN_RPC_URL")!;
      expect(diag.message).toContain("wss");
    });
  });

  describe("embedded credentials are rejected and redacted", () => {
    const credCases: Array<[RpcVar, string]> = [
      ["SOROBAN_RPC_URL", "alice:secret1"],
      ["SOROBAN_RPC_URL", "bob:secret2"],
      ["HORIZON_URL", "carol:secret3"],
      ["HORIZON_URL", "dave:secret4"],
    ];

    it.each(credCases)("%s with creds → blocking error, password not echoed", (variable, creds) => {
      const password = creds.split(":")[1];
      const url = testnetUrl(variable, creds);
      const diags = collectStartupDiagnostics({ ...BASE_ENV, [variable]: url }, true);
      const diag = diags.find((d) => d.variable === variable);
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe("error");
      expect(diag?.message).toMatch(/embedded credentials/);
      expect(diag?.message).not.toContain(password);
      expect(hasBlockingDiagnostics(diags)).toBe(true);
    });

    it("does not echo the password in the formatted report", () => {
      const diags = collectStartupDiagnostics(
        {
          ...BASE_ENV,
          SOROBAN_RPC_URL: testnetUrl("SOROBAN_RPC_URL", "u:verysecretpassword"),
        },
        true,
      );
      const report = formatDiagnostics(diags);
      expect(report).not.toContain("verysecretpassword");
    });

    it("does not echo the username in the formatted report", () => {
      const diags = collectStartupDiagnostics(
        {
          ...BASE_ENV,
          SOROBAN_RPC_URL: testnetUrl("SOROBAN_RPC_URL", "uniqueusername:pw"),
        },
        true,
      );
      const report = formatDiagnostics(diags);
      expect(report).not.toContain("uniqueusername");
    });

    it("URL with only a username (no password) is also flagged", () => {
      const diags = collectStartupDiagnostics(
        {
          ...BASE_ENV,
          HORIZON_URL: `https://usernameonly@horizon-testnet.example.com`,
        },
        true,
      );
      const diag = diags.find((d) => d.variable === "HORIZON_URL");
      expect(diag?.severity).toBe("error");
      expect(diag?.message).toMatch(/embedded credentials/);
    });
  });

  describe("unparseable URL is a distinct failure", () => {
    it.each(RPC_VARS)("unparseable %s reports 'Not a valid URL'", (variable) => {
      const diags = collectStartupDiagnostics(
        { ...BASE_ENV, [variable]: "not-a-url-at-all" },
        true,
      );
      const diag = diags.find((d) => d.variable === variable);
      expect(diag).toBeDefined();
      expect(diag?.message).toMatch(/Not a valid URL/);
      expect(diag?.message).not.toMatch(/Unsupported URL scheme/);
      expect(diag?.message).not.toMatch(/embedded credentials/);
    });

    it("distinguishes three failure modes: unparseable vs wrong scheme vs credentials", () => {
      const unparseable = collectStartupDiagnostics(
        { ...BASE_ENV, SOROBAN_RPC_URL: ":::bad" },
        true,
      ).find((d) => d.variable === "SOROBAN_RPC_URL");

      const wrongScheme = collectStartupDiagnostics(
        { ...BASE_ENV, SOROBAN_RPC_URL: "ftp://rpc.example.com" },
        true,
      ).find((d) => d.variable === "SOROBAN_RPC_URL");

      const withCreds = collectStartupDiagnostics(
        { ...BASE_ENV, SOROBAN_RPC_URL: testnetUrl("SOROBAN_RPC_URL", "user:pw") },
        true,
      ).find((d) => d.variable === "SOROBAN_RPC_URL");

      expect(unparseable?.message).toMatch(/Not a valid URL/);
      expect(wrongScheme?.message).toMatch(/Unsupported URL scheme/);
      expect(withCreds?.message).toMatch(/embedded credentials/);

      // Each message is exclusive — the patterns should not cross-match.
      expect(unparseable?.message).not.toMatch(/Unsupported URL scheme/);
      expect(unparseable?.message).not.toMatch(/embedded credentials/);
      expect(wrongScheme?.message).not.toMatch(/Not a valid URL/);
      expect(wrongScheme?.message).not.toMatch(/embedded credentials/);
      expect(withCreds?.message).not.toMatch(/Not a valid URL/);
      expect(withCreds?.message).not.toMatch(/Unsupported URL scheme/);
    });
  });
});

// ── verifyInstall layer ───────────────────────────────────────────────────────

describe("RPC URL validation — verifyInstall layer", () => {
  describe("valid URLs pass", () => {
    it.each(RPC_VARS)("accepts https:// for %s", (variable) => {
      const result = verifyInstall({ [variable]: testnetUrl(variable) }, NODE_OK, SDK_OK);
      const check = result.checks.find((c) => c.name === variable)!;
      expect(check.ok).toBe(true);
    });

    it.each(RPC_VARS)("absent %s is ok (preset in use)", (variable) => {
      const result = verifyInstall({}, NODE_OK, SDK_OK);
      const check = result.checks.find((c) => c.name === variable)!;
      expect(check.ok).toBe(true);
    });
  });

  describe("unsupported schemes are rejected", () => {
    it.each(RPC_VARS)("rejects ws:// for %s", (variable) => {
      const result = verifyInstall({ [variable]: "ws://rpc.example.com" }, NODE_OK, SDK_OK);
      const check = result.checks.find((c) => c.name === variable)!;
      expect(check.ok).toBe(false);
      expect(check.detail).toMatch(/unsupported scheme/i);
    });

    it.each(RPC_VARS)("rejects ftp:// for %s", (variable) => {
      const result = verifyInstall({ [variable]: "ftp://rpc.example.com" }, NODE_OK, SDK_OK);
      const check = result.checks.find((c) => c.name === variable)!;
      expect(check.ok).toBe(false);
      expect(check.detail).toMatch(/unsupported scheme/i);
    });
  });

  describe("embedded credentials are rejected and redacted", () => {
    const credCases: Array<[RpcVar, string]> = [
      ["SOROBAN_RPC_URL", "u1:cred1"],
      ["HORIZON_URL", "u2:cred2"],
    ];

    it.each(credCases)("%s with creds → check fails, password not echoed", (variable, creds) => {
      const password = creds.split(":")[1];
      const url = testnetUrl(variable, creds);
      const result = verifyInstall({ [variable]: url }, NODE_OK, SDK_OK);
      expect(result.ok).toBe(false);
      const check = result.checks.find((c) => c.name === variable)!;
      expect(check.ok).toBe(false);
      expect(check.detail).toMatch(/embedded credentials/);
      expect(check.detail).not.toContain(password);
    });

    it("does not echo credentials in the summary output", () => {
      const result = verifyInstall(
        { SOROBAN_RPC_URL: testnetUrl("SOROBAN_RPC_URL", "user:summarypassword") },
        NODE_OK,
        SDK_OK,
      );
      expect(result.summary).not.toContain("summarypassword");
    });

    it("distinguishes embedded credentials from unsupported scheme in check detail", () => {
      const schemeResult = verifyInstall(
        { SOROBAN_RPC_URL: "ws://rpc.example.com" },
        NODE_OK,
        SDK_OK,
      );
      const credResult = verifyInstall(
        { SOROBAN_RPC_URL: testnetUrl("SOROBAN_RPC_URL", "u:p") },
        NODE_OK,
        SDK_OK,
      );

      const schemeDetail = schemeResult.checks.find((c) => c.name === "SOROBAN_RPC_URL")!.detail;
      const credDetail = credResult.checks.find((c) => c.name === "SOROBAN_RPC_URL")!.detail;

      expect(schemeDetail).toMatch(/unsupported scheme/i);
      expect(schemeDetail).not.toMatch(/embedded credentials/i);
      expect(credDetail).toMatch(/embedded credentials/i);
      expect(credDetail).not.toMatch(/unsupported scheme/i);
    });
  });
});
