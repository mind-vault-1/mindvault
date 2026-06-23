#!/usr/bin/env node
// Generate TypeScript bindings for the deployed vault-registry contract and
// flatten them into packages/registry-client/src/generated/index.ts.
//
// `stellar contract bindings typescript` writes a full sub-package (its own
// package.json, tsconfig, src/) which would nest inside our workspace and
// confuse pnpm. We only need the generated source — this script unwraps it.
//
// Override the contract ID or network by setting env vars:
//   VAULT_REGISTRY_CONTRACT_ID=C...  STELLAR_NETWORK=testnet  pnpm contract:bindings
// Or generate from a locally built wasm (preferred when changing the contract):
//   CONTRACT_WASM=contract/target/wasm32v1-none/release/vault_registry.wasm  pnpm contract:bindings

import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CONTRACT_WASM = process.env.CONTRACT_WASM;
const CONTRACT_ID =
  process.env.VAULT_REGISTRY_CONTRACT_ID ??
  "CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4";
const NETWORK = process.env.STELLAR_NETWORK ?? "testnet";

const tmpDir = path.join(root, "packages/registry-client/bindings-tmp");
const outDir = path.join(root, "packages/registry-client/src/generated");

rmSync(tmpDir, { recursive: true, force: true });

let bindingsCmd;
if (CONTRACT_WASM) {
  if (!existsSync(CONTRACT_WASM)) {
    console.error(`CONTRACT_WASM not found: ${CONTRACT_WASM}`);
    process.exit(1);
  }
  bindingsCmd = `stellar contract bindings typescript --wasm "${CONTRACT_WASM}" --output-dir "${tmpDir}" --overwrite`;
} else {
  bindingsCmd = `stellar contract bindings typescript --network ${NETWORK} --contract-id ${CONTRACT_ID} --output-dir "${tmpDir}" --overwrite`;
}

execSync(bindingsCmd, { stdio: "inherit" });

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
renameSync(path.join(tmpDir, "src/index.ts"), path.join(outDir, "index.ts"));
rmSync(tmpDir, { recursive: true, force: true });

console.log(`✅ Bindings written to ${path.relative(root, outDir)}/index.ts`);
