/**
 * Keeps docs/mcp-client-compatibility.md honest.
 *
 * The matrix makes claims about the server: which capabilities it declares,
 * which clients `mindvault_client_config` knows, which prompts and resources
 * exist, which tools report progress, and which tools to fall back to when a
 * client lacks an optional feature. Each claim is checked against the code so
 * the page fails CI instead of drifting.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { CATALOG_RESOURCE_HOST, CATALOG_RESOURCE_SCHEME } from "./catalogResources.js";
import { PROMPT_DEFINITIONS } from "./prompts.js";
import { SERVER_STATUS_URI } from "./serverStatusResource.js";
import { TOOL_DEFINITIONS } from "./tools.js";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(SRC_DIR, "..", "..", "docs");
const doc = readFileSync(join(DOCS_DIR, "mcp-client-compatibility.md"), "utf-8");
const indexSource = readFileSync(join(SRC_DIR, "index.ts"), "utf-8");
const toolNames = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));

/** The table row whose first cell starts with `label`. */
function row(label: string): string {
  const line = doc.split("\n").find((l) => l.startsWith(`| ${label}`));
  if (!line) throw new Error(`no table row starting with "${label}"`);
  return line;
}

const backticked = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

describe("docs/mcp-client-compatibility.md", () => {
  it("documents exactly the capabilities the server declares", () => {
    const docJson = doc.match(/```json\n(\{[^\n]*"tools"[^\n]*\})\n```/);
    expect(docJson, "capabilities JSON block").not.toBeNull();
    const literal = indexSource.match(/capabilities:\s*(\{[^\n]*\}),?\n/);
    expect(literal, "capabilities literal in index.ts").not.toBeNull();
    const asJson = literal![1].replace(/([A-Za-z_]+):/g, '"$1":');
    expect(JSON.parse(docJson![1])).toEqual(JSON.parse(asJson));
  });

  it("lists exactly the clients mindvault_client_config supports", () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === "mindvault_client_config");
    const supported = (tool?.inputSchema.properties.client?.enum ?? []) as string[];
    expect(supported.length).toBeGreaterThan(0);

    const section = doc.split("## Client matrix")[1].split("\n## ")[0];
    const documented = section
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.startsWith("| Client") && !l.startsWith("| ---"))
      .map((l) => l.split("|")[2].trim())
      .filter((cell) => cell !== "—")
      .map((cell) => cell.replace(/`/g, ""));
    expect([...documented].sort()).toEqual([...supported].sort());
  });

  it("names the real prompts", () => {
    const documented = backticked(row("Prompts")).filter((n) => !n.startsWith("mindvault_"));
    expect(documented.sort()).toEqual(PROMPT_DEFINITIONS.map((p) => p.name).sort());
  });

  it("names the real resource URIs", () => {
    const resources = row("Resources");
    expect(resources).toContain(`\`${SERVER_STATUS_URI}\``);
    expect(resources).toContain(`\`${CATALOG_RESOURCE_SCHEME}://${CATALOG_RESOURCE_HOST}/<id>\``);
  });

  it("lists progress tools that the progress doc also lists", () => {
    const progressDoc = readFileSync(join(DOCS_DIR, "mcp-progress-notifications.md"), "utf-8");
    const tools = backticked(row("Progress notifications")).filter((n) =>
      n.startsWith("mindvault_"),
    );
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(progressDoc, tool).toContain(`\`${tool}\``);
  });

  it("only names tools that exist", () => {
    const named = new Set([...doc.matchAll(/`(mindvault_[a-z_]+)`/g)].map((m) => m[1]));
    expect(named.size).toBeGreaterThan(0);
    for (const name of named) expect(toolNames.has(name), name).toBe(true);
  });
});
