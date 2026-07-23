#!/usr/bin/env tsx
/**
 * MindVault MCP end-to-end smoke test.
 *
 * Boots the MCP server over stdio and drives the full agent flow —
 * setup wallet → register → publish → preview → buy — then exits non-zero if
 * any tool call fails. Two targets:
 *
 *   --target mock     (default) run against an in-process HTTP stub; no network,
 *                     no funded wallet, deterministic output.
 *   --target testnet  run against the real hosted backend on Stellar testnet.
 *                     The publisher wallet must hold testnet USDC (see
 *                     docs/mcp-smoke-test.md).
 *
 * Usage: pnpm --filter @mindvault/mcp smoke [--target mock|testnet]
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildSmokeSteps, runSmoke, type SmokeToolClient } from "../src/smoke.js";
import { startMockServer, type MockServer } from "./mock-server.js";

type Target = "mock" | "testnet";

function parseTarget(argv: string[]): Target {
  const flagIndex = argv.findIndex((a) => a === "--target" || a === "-t");
  const raw = (
    flagIndex >= 0 ? argv[flagIndex + 1] : (process.env.SMOKE_TARGET ?? "mock")
  )?.toLowerCase();
  if (raw === "mock" || raw === "testnet") return raw;
  throw new Error(`Unknown --target "${raw}". Use "mock" or "testnet".`);
}

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const mcpRoot = join(here, "..");
const serverEntry = join(mcpRoot, "src", "index.ts");

/** Resolve the local tsx CLI so the child server runs TypeScript directly. */
function tsxCliPath(): string {
  const pkg = require.resolve("tsx/package.json");
  return join(dirname(pkg), "dist", "cli.mjs");
}

/**
 * Build the environment for the child MCP server. In mock mode every upstream is
 * pointed at the local stub via `*.localhost` hosts — chosen so the server's
 * network validation still infers testnet — and HOME is redirected to a temp dir
 * so the run never touches the operator's real ~/.mindvault/state.json.
 */
function childEnv(target: Target, mock: MockServer | null, home: string): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
  if (target === "testnet" || !mock) return base;
  return {
    ...base,
    STELLAR_NETWORK: "testnet",
    MINDVAULT_URL: mock.url,
    SPONSORED_ACCOUNT_URL: mock.url,
    HORIZON_URL: `http://horizon-testnet.localhost:${mock.port}`,
    SOROBAN_RPC_URL: `http://soroban-testnet.localhost:${mock.port}`,
  };
}

async function main(): Promise<number> {
  const target = parseTarget(process.argv.slice(2));
  const log = (line: string) => console.log(line);

  log(`MindVault MCP smoke test — target: ${target}`);

  const mock = target === "mock" ? await startMockServer() : null;
  const home = mkdtempSync(join(tmpdir(), "mindvault-smoke-"));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCliPath(), serverEntry],
    env: childEnv(target, mock, home),
    cwd: mcpRoot,
    stderr: "inherit",
  });

  const client = new Client({ name: "mindvault-smoke", version: "1.0.0" }, { capabilities: {} });
  const smokeClient: SmokeToolClient = {
    callTool: (params) => client.callTool(params),
  };

  try {
    await client.connect(transport);
    const report = await runSmoke(smokeClient, buildSmokeSteps(), log);

    log("");
    if (report.ok) {
      log(`✓ smoke passed — ${report.steps.length} steps`);
      return 0;
    }
    log(`✗ smoke failed at step: ${report.failedStep}`);
    return 1;
  } catch (err) {
    log(`✗ smoke aborted: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    await client.close().catch(() => {});
    if (mock) await mock.close().catch(() => {});
    rmSync(home, { recursive: true, force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`✗ smoke crashed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
