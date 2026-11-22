#!/usr/bin/env node
/**
 * Keep docs/contract-test-map.md in sync with the vault-registry test files.
 *
 * Fails when a file under contract/contracts/vault-registry/src/test/ has no
 * row in the map, when a row names a file that does not exist, or when a row's
 * "Compiled" cell disagrees with whether src/test.rs `include!`s the file.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const crateDir = join(root, "contract", "contracts", "vault-registry");
const testDir = join(crateDir, "src", "test");
const testRs = readFileSync(join(crateDir, "src", "test.rs"), "utf8");
const mapPath = join(root, "docs", "contract-test-map.md");
const map = readFileSync(mapPath, "utf8");

const included = new Set(
  [...testRs.matchAll(/^\s*include!\("test\/([^"]+\.rs)"\);/gm)].map((m) => m[1]),
);
const onDisk = new Set(readdirSync(testDir).filter((f) => f.endsWith(".rs")));

// Rows of the "Test files" table: | `src/test/<file>.rs` | yes|no | ... |
const rows = new Map();
for (const m of map.matchAll(/^\|\s*`src\/test\/([^`]+\.rs)`\s*\|\s*(yes|no)\s*\|/gm)) {
  if (rows.has(m[1])) {
    console.error(`docs/contract-test-map.md lists src/test/${m[1]} more than once`);
    process.exitCode = 1;
  }
  rows.set(m[1], m[2] === "yes");
}

const problems = [];
for (const file of onDisk) {
  if (!rows.has(file)) problems.push(`src/test/${file} exists but has no row in the map`);
}
for (const [file, compiled] of rows) {
  if (!onDisk.has(file)) {
    problems.push(`src/test/${file} is in the map but does not exist`);
    continue;
  }
  const actual = included.has(file);
  if (compiled !== actual) {
    problems.push(
      `src/test/${file}: map says Compiled=${compiled ? "yes" : "no"}, but src/test.rs ${
        actual ? "includes" : "does not include"
      } it`,
    );
  }
}
for (const file of included) {
  if (!existsSync(join(testDir, file))) {
    problems.push(`src/test.rs includes test/${file}, which does not exist`);
  }
}

if (problems.length > 0 || process.exitCode) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error("\nUpdate the Test files table in docs/contract-test-map.md.");
  process.exit(1);
}
console.log(
  `contract test map OK: ${rows.size} files mapped, ${included.size} compiled via include!.`,
);
