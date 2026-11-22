/**
 * Tests that keep docs/mcp-client-configs.md honest.
 *
 * The client config page is what operators paste into Claude Code, Claude
 * Desktop, Codex, Cursor, VS Code, and Windsurf. Documentation that drifts
 * from the code is worse than none — a stale variable name or an unbalanced
 * JSON snippet costs an operator a debugging session. These tests check the
 * page against the generated environment inventory: every variable listed
 * here is recognized, every JSON snippet parses, and the
 * documented state path is the one the server actually writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findEnvVarDoc } from "./envReference.js";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(SRC_DIR, "..", "..", "docs");
const CONFIG_DOC = join(DOCS_DIR, "mcp-client-configs.md");

const doc = readFileSync(CONFIG_DOC, "utf-8");

/** Variable names listed in the doc's environment table (`| \`NAME\` | …`). */
function documentedEnvironmentVariables(): Set<string> {
  const table = doc.slice(doc.indexOf("## Environment variables"), doc.indexOf("## State path"));
  const names = new Set<string>();
  for (const match of table.matchAll(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|/gm)) names.add(match[1]);
  return names;
}

/** Every fenced ```json block in the page. */
function jsonSnippets(): string[] {
  return [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
}

describe("docs/mcp-client-configs.md", () => {
  it("links to the generated reference for the complete environment inventory", () => {
    const section = doc.slice(
      doc.indexOf("## Environment variables"),
      doc.indexOf("## State path"),
    );
    expect(section).toContain("(mcp-env-variables.md)");
  });

  it("lists only variables from the environment inventory", () => {
    for (const variable of documentedEnvironmentVariables()) {
      expect(
        findEnvVarDoc(variable),
        `${variable} is missing from the environment reference`,
      ).toBeDefined();
    }
  });

  it("every JSON config snippet parses", () => {
    const snippets = jsonSnippets();
    expect(snippets.length).toBeGreaterThan(0);
    for (const snippet of snippets) {
      expect(() => JSON.parse(snippet), `invalid JSON snippet:\n${snippet}`).not.toThrow();
    }
  });

  it("every stdio config points at the built entrypoint", () => {
    for (const snippet of jsonSnippets()) {
      const config = JSON.parse(snippet) as Record<string, Record<string, { args?: string[] }>>;
      const servers = config.mcpServers ?? config.servers;
      for (const server of Object.values(servers)) {
        expect(server.args?.[0]).toMatch(/mcp\/dist\/index\.js$/);
      }
    }
  });

  it("documents the state path the server actually writes", () => {
    const index = readFileSync(join(SRC_DIR, "index.ts"), "utf-8");
    expect(index).toContain('join(homedir(), ".mindvault")');
    expect(index).toContain('join(STATE_DIR, "state.json")');
    expect(doc).toContain("~/.mindvault/state.json");
    expect(doc).toContain("0600");
  });

  it("covers each supported client and the required sections", () => {
    for (const heading of [
      "## Claude Code",
      "## Claude Desktop",
      "## Codex",
      "## Cursor",
      "## VS Code",
      "## Windsurf",
      "## Environment variables",
      "## State path",
      "## Network profile",
      "## Security notes",
    ]) {
      expect(doc, `missing section: ${heading}`).toContain(heading);
    }
  });
});
