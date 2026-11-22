/**
 * Keeps docs/mcp-adding-a-tool.md honest.
 *
 * The guide tells contributors which files and symbols to touch when adding a
 * tool, which tests guard each one, and which package scripts to run. If any of
 * those is renamed or removed, the guide silently sends people to the wrong
 * place, so this test fails until the guide is updated with it.
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "./tools.js";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const MCP_DIR = join(SRC_DIR, "..");
const REPO_ROOT = join(MCP_DIR, "..");
const GUIDE = readFileSync(join(REPO_ROOT, "docs", "mcp-adding-a-tool.md"), "utf-8");

const read = (repoPath: string) => readFileSync(join(REPO_ROOT, repoPath), "utf-8");

/** Rows of the "Where a tool is declared" table: file link + backticked symbols. */
function declarationRows(): { file: string; symbols: string[] }[] {
  const rows: { file: string; symbols: string[] }[] = [];
  for (const line of GUIDE.split("\n")) {
    const m = line.match(/^\|\s*\d+\s*\|\s*\[`(mcp\/src\/[^`]+)`\]\([^)]*\)\s*\|([^|]*)\|/);
    if (!m) continue;
    const symbols = [...m[2].matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((s) => s[1]);
    rows.push({ file: m[1], symbols });
  }
  return rows;
}

describe("docs/mcp-adding-a-tool.md", () => {
  it("lists the declaration table", () => {
    expect(declarationRows().length).toBeGreaterThanOrEqual(8);
  });

  it.each(declarationRows())("$file defines the symbols the guide names", ({ file, symbols }) => {
    const source = read(file);
    for (const symbol of symbols) {
      expect(
        new RegExp(`\\b(?:const|function|let)\\s+${symbol}\\b`).test(source),
        `${file} should define ${symbol}`,
      ).toBe(true);
    }
  });

  it("links only to mcp/src files that exist", () => {
    for (const m of GUIDE.matchAll(/\]\(\.\.\/(mcp\/src\/[^)#]+)\)/g)) {
      expect(existsSync(join(REPO_ROOT, m[1])), m[1]).toBe(true);
    }
  });

  it("names only test files that exist", () => {
    const names = new Set(
      [...GUIDE.matchAll(/\b(?:src\/)?([A-Za-z]+\.test\.ts)\b/g)].map((m) => m[1]),
    );
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      expect(existsSync(join(SRC_DIR, name)), `mcp/src/${name}`).toBe(true);
    }
  });

  it("runs only package scripts that exist", () => {
    const scripts = JSON.parse(readFileSync(join(MCP_DIR, "package.json"), "utf-8")).scripts;
    const named = [...GUIDE.matchAll(/pnpm --filter @mindvault\/mcp ([a-z:-]+)/g)]
      .map((m) => m[1])
      .filter((s) => s !== "exec");
    expect(named.length).toBeGreaterThan(0);
    for (const script of named) expect(scripts, `mcp script ${script}`).toHaveProperty(script);
  });

  it("uses a worked example that is still a real, read-only tool", () => {
    const example = TOOL_DEFINITIONS.find((t) => t.name === "mindvault_registry_count");
    expect(example?.annotations.readOnlyHint).toBe(true);
    expect(read("mcp/src/index.ts")).toContain('case "mindvault_registry_count":');
    expect(read("mcp/src/toolSideEffects.ts")).toContain("mindvault_registry_count: READ,");
  });
});
