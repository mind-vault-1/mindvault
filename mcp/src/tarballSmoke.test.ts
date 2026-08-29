import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PACK_DIR = "tarball-smoke-tmp";

let packDir: string;
let tarball: string;

beforeAll(() => {
  packDir = mkdtempSync(join(tmpdir(), PACK_DIR));
  execFileSync("pnpm", ["run", "build"], {
    cwd: join(import.meta.dirname, ".."),
    stdio: "pipe",
  });
  execFileSync("npm", ["pack", "--pack-destination", packDir], {
    cwd: join(import.meta.dirname, ".."),
    stdio: "pipe",
  });
  const files = execFileSync("ls", [packDir], { encoding: "utf-8" }).trim().split("\n");
  const tgz = files.find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error("npm pack produced no .tgz in " + packDir);
  tarball = join(packDir, tgz);
}, 60_000);

afterAll(() => {
  if (packDir) rmSync(packDir, { recursive: true, force: true });
});

describe("npm package tarball smoke", () => {
  it("produces a valid .tgz file", () => {
    expect(tarball).toBeTruthy();
    const out = execFileSync("file", [tarball], { encoding: "utf-8" });
    expect(out.toLowerCase()).toContain("gzip");
  });

  it("contains package.json with expected name", () => {
    const json = execFileSync("tar", ["-xzf", tarball, "-O", "package/package.json"], {
      encoding: "utf-8",
    });
    const pkg = JSON.parse(json);
    expect(pkg.name).toBe("@mindvault/mcp");
    expect(pkg.version).toBeDefined();
    expect(pkg.main).toBe("dist/index.js");
  });

  it("contains dist/index.js entry point", () => {
    const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf-8" });
    expect(listing).toContain("package/dist/index.js");
  });

  it("package.json lists required runtime dependencies", () => {
    const json = execFileSync("tar", ["-xzf", tarball, "-O", "package/package.json"], {
      encoding: "utf-8",
    });
    const pkg = JSON.parse(json);
    const requiredDeps = ["@modelcontextprotocol/sdk", "@stellar/stellar-sdk"];
    for (const dep of requiredDeps) {
      expect(pkg.dependencies?.[dep]).toBeDefined();
    }
  });

  it("tarball does not leak node_modules or .env", () => {
    const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf-8" });
    expect(listing).not.toContain("node_modules/");
    expect(listing).not.toContain(".env");
  });
});
