import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const failures = [];

const doc = read("CONTRIBUTING.md");
const requiredHeadings = [
  "## Prerequisites",
  "### Contract-only contributors",
  "### First contribution: contract-only",
  "## Smart contract development",
];
for (const heading of requiredHeadings) {
  if (!doc.includes(heading)) {
    failures.push(`CONTRIBUTING.md is missing the ${heading} heading`);
  }
}

const requiredCommands = [
  "cargo test --manifest-path Cargo.toml",
  "pnpm contract:test",
  "cargo fmt --all -- --check",
  "make preflight",
  "make footprint",
  "pnpm contract:bindings",
];
for (const command of requiredCommands) {
  if (!doc.includes(command)) {
    failures.push(`CONTRIBUTING.md is missing the ${command} command`);
  }
}

const requiredPaths = [
  "docs/local-setup.md",
  "docs/registry-client-bindings.md",
  "docs/contract-storage-migration.md",
  "docs/contract-storage-footprint.md",
  "docs/contract-upgrade-checklist.md",
  "contract/README.md",
  "contract/Cargo.toml",
  "contract/contracts/vault-registry/Makefile",
  "contract/contracts/vault-registry/src/test.rs",
  "contract/contracts/vault-registry/src/test/payment_ownership_binding.rs",
];
for (const relativePath of requiredPaths) {
  if (!existsSync(join(root, relativePath))) {
    failures.push(`documented path does not exist: ${relativePath}`);
  }
}

const packageJson = JSON.parse(read("package.json"));
for (const script of ["contract:build", "contract:test", "contract:bindings"]) {
  if (!packageJson.scripts?.[script]) {
    failures.push(`package.json is missing the ${script} script`);
  }
}

const crateMakefile = read("contract/contracts/vault-registry/Makefile");
for (const target of ["preflight", "footprint"]) {
  if (!new RegExp(`^${target}:`, "m").test(crateMakefile)) {
    failures.push(`contract crate Makefile is missing the ${target} target`);
  }
}

if (failures.length > 0) {
  console.error("Contributor doc check failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("Contributor doc check passed.");
