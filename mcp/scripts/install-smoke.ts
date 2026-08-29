#!/usr/bin/env tsx
/**
 * MindVault MCP install smoke test.
 *
 * Launches the server exactly the way an agent client does after following the
 * README install — `node mcp/dist/index.js` over stdio — and drives the
 * fixture-backed scenario in `src/installSmoke.ts` against it. No network, no
 * funded wallet, no live backend: every upstream is served by the in-process
 * mock fixtures, and agent state is redirected to a temporary HOME.
 *
 * Exits non-zero on the first failed check, so CI fails on an install that
 * cannot boot or cannot serve its documented tools.
 *
 * Usage:
 *   pnpm --filter @mindvault/mcp smoke:install              # built dist (default)
 *   pnpm --filter @mindvault/mcp smoke:install --entry src  # sources via tsx
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  buildInstallSmokeSteps,
  checkToolSurface,
  formatInstallSmokeReport,
  installSmokeEnv,
} from "../src/installSmoke.js";
import { runSmoke, type SmokeToolClient } from "../src/smoke.js";

type Entry = "dist" | "src";

const require = createRequire(import.meta.url);
const mcpRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEntry(argv: string[]): Entry {
  const flagIndex = argv.findIndex((a) => a === "--entry" || a === "-e");
  const raw = (
    flagIndex >= 0 ? argv[flagIndex + 1] : (process.env.INSTALL_SMOKE_ENTRY ?? "dist")
  )?.toLowerCase();
  if (raw === "dist" || raw === "src") return raw;
  throw new Error(`Unknown --entry "${raw}". Use "dist" or "src".`);
}

/** Resolve the local tsx CLI, used to run the TypeScript sources directly. */
function tsxCliPath(): string {
  return join(dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
}

/**
 * The command an MCP client would be configured with.
 *
 * `dist` is the documented install target, so that is the default and the one
 * CI runs; `src` exists for a fast local loop that skips the build.
 */
function serverCommand(entry: Entry): { args: string[]; label: string } {
  if (entry === "src") {
    return { args: [tsxCliPath(), join(mcpRoot, "src", "index.ts")], label: "src/index.ts (tsx)" };
  }
  const built = join(mcpRoot, "dist", "index.js");
  if (!existsSync(built)) {
    throw new Error(
      `${built} does not exist. Build the server first:\n  pnpm --filter @mindvault/mcp build`,
    );
  }
  return { args: [built], label: "dist/index.js" };
}

async function main(): Promise<number> {
  const entry = parseEntry(process.argv.slice(2));
  const log = (line: string) => console.log(line);
  const { args, label } = serverCommand(entry);

  log(`MindVault MCP install smoke — entry: ${label}`);

  const home = mkdtempSync(join(tmpdir(), "mindvault-install-smoke-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    env: installSmokeEnv(home),
    cwd: mcpRoot,
    stderr: "inherit",
  });
  const client = new Client(
    { name: "mindvault-install-smoke", version: "1.0.0" },
    { capabilities: {} },
  );
  const smokeClient: SmokeToolClient = { callTool: (params) => client.callTool(params) };

  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    const surface = checkToolSurface(tools.map((t) => t.name));
    if (!surface.ok) {
      log(`✗ install smoke failed: missing tool(s) ${surface.missing.join(", ")}`);
      return 1;
    }
    log(`▶ Tool surface (${surface.advertised} tools advertised)`);
    log(`✓ Tool surface`);

    const report = await runSmoke(smokeClient, buildInstallSmokeSteps(), log);
    log("");
    log(formatInstallSmokeReport(report, label));
    return report.ok ? 0 : 1;
  } catch (err) {
    log(`✗ install smoke aborted: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    await client.close().catch(() => {});
    rmSync(home, { recursive: true, force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`✗ install smoke crashed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
