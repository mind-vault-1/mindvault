#!/usr/bin/env node
/**
 * Check Markdown files for broken repo-local links.
 *
 * External URLs (http/https) are skipped — see .markdown-link-check.json.
 * That avoids flaky CI when third-party sites rate-limit runners or are briefly
 * down. To also verify external links locally, run:
 *   DOCS_LINKS_CHECK_EXTERNAL=1 node scripts/check-doc-links.mjs
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mlcBin = require.resolve("markdown-link-check/markdown-link-check");
const configPath = join(root, ".markdown-link-check.json");

const checkExternal = process.env.DOCS_LINKS_CHECK_EXTERNAL === "1";
const configFlag = checkExternal ? [] : ["-c", configPath];

const skipDirs = new Set(["node_modules", ".git", "dist", "target"]);

function* walkMarkdown(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdown(fullPath);
      continue;
    }
    if (entry.name.endsWith(".md")) yield fullPath;
  }
}

let failed = false;

for (const file of walkMarkdown(root)) {
  const rel = relative(root, file);
  process.stdout.write(`Checking ${rel}... `);

  const result = spawnSync(
    process.execPath,
    [mlcBin, file, ...configFlag],
    { cwd: root, encoding: "utf8" },
  );

  if (result.status === 0) {
    process.stdout.write("ok\n");
    continue;
  }

  failed = true;
  process.stdout.write("FAILED\n");
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

if (failed) {
  console.error("\nDoc link check failed. Fix broken links or add exclusions to .markdown-link-check.json.");
  process.exit(1);
}

console.log("\nAll doc links OK.");
