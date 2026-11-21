/**
 * Startup handling of a corrupt state file, end to end (#1207).
 *
 * Each test writes a real ~/.mindvault/state.json under a temporary home, then
 * imports index.ts fresh so its startup loadState() runs against that file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";

const paths = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: joinPath } = await import("node:path");
  return { home: mkdtempSync(joinPath(tmpdir(), "mv-state-diag-")) };
});

vi.mock("os", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  homedir: () => paths.home,
}));
vi.mock("node:os", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  homedir: () => paths.home,
}));

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: class MockServer {
    setRequestHandler = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {
    constructor() {}
  },
}));
vi.mock("@x402/stellar", () => ({ createEd25519Signer: vi.fn() }));
vi.mock("@x402/stellar/exact/client", () => ({ ExactStellarScheme: vi.fn() }));
vi.mock("@x402/fetch", () => ({
  wrapFetchWithPayment: vi.fn(),
  x402Client: vi.fn(function () {
    return { register: vi.fn() };
  }),
}));

const STATE_DIR = join(paths.home, ".mindvault");
const STATE_FILE = join(STATE_DIR, "state.json");

async function bootWith(contents: string | null) {
  rmSync(STATE_DIR, { recursive: true, force: true });
  if (contents !== null) {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, contents, { mode: 0o600 });
  }
  vi.resetModules();
  return import("./index.js");
}

describe("corrupt state file at startup (#1207)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    try {
      chmodSync(STATE_DIR, 0o700);
    } catch {
      // directory may not exist
    }
  });

  it("reports a missing state file as a fresh install", async () => {
    const mod = await bootWith(null);
    expect(mod._stateDiagnostics()).toMatchObject({
      status: "missing",
      writesBlocked: false,
      nextSteps: [],
    });
  });

  it("reports a valid state file as ok", async () => {
    const mod = await bootWith(
      JSON.stringify({
        version: 2,
        activeProfile: "default",
        profiles: { default: { network: "testnet" } },
      }),
    );
    expect(mod._stateDiagnostics().status).toBe("ok");
  });

  it("quarantines invalid JSON, keeps the original bytes, and explains how to recover", async () => {
    const original =
      '{\n  "version": 2,\n  "profiles": {\n    "default": { "wallet": SECRETSEED }\n  }\n}';
    const mod = await bootWith(original);

    const d = mod._stateDiagnostics();
    expect(d.status).toBe("recovered");
    expect(d.reason).toBe("invalid_json");
    expect(d.position).toEqual({ line: 4, column: 28 });
    expect(d.writesBlocked).toBe(false);
    expect(existsSync(STATE_FILE)).toBe(false);
    expect(d.quarantinePath).toMatch(/state\.json\.corrupt-\d+$/);
    expect(readFileSync(d.quarantinePath!, "utf-8")).toBe(original);

    const text = await mod.dispatchTool("mindvault_state_diagnostics", {});
    expect(text).toContain("Status: recovered");
    expect(text).toContain(`Preserved at: ${d.quarantinePath}`);
    expect(text).toContain("line 4, column 28");
    // Neither the diagnostics nor the stderr log repeat the file contents.
    expect(text).not.toContain("SECRETSEED");
    expect(JSON.stringify(d)).not.toContain("SECRETSEED");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("SECRETSEED");
  });

  it("quarantines a file with no recognisable profile", async () => {
    const mod = await bootWith(JSON.stringify({ hello: "world" }));
    expect(mod._stateDiagnostics()).toMatchObject({ status: "recovered", reason: "no_profiles" });
  });

  it("lists encrypted backups so the agent can restore from the newest", async () => {
    mkdirSync(join(STATE_DIR, "backups"), { recursive: true });
    const mod = await (async () => {
      rmSync(STATE_FILE, { force: true });
      writeFileSync(join(STATE_DIR, "backups", "state-2026-11-01.backup"), "v1:x:y:z\n");
      writeFileSync(STATE_FILE, "not json");
      vi.resetModules();
      return import("./index.js");
    })();
    const d = mod._stateDiagnostics();
    expect(d.backups).toEqual([join(STATE_DIR, "backups", "state-2026-11-01.backup")]);
    expect(d.nextSteps.join("\n")).toContain("mindvault_restore_state with blob = the contents of");
  });

  it.skipIf(process.getuid?.() === 0)(
    "blocks writes when the corrupt file cannot be moved aside, so it is never overwritten",
    async () => {
      const original = "{ this is not json";
      rmSync(STATE_DIR, { recursive: true, force: true });
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(STATE_FILE, original, { mode: 0o600 });
      // A read-only directory makes the quarantine rename fail.
      chmodSync(STATE_DIR, 0o500);
      vi.resetModules();
      const mod = await import("./index.js");

      const d = mod._stateDiagnostics();
      expect(d.status).toBe("unrecovered");
      expect(d.writesBlocked).toBe(true);
      expect(d.nextSteps[0]).toMatch(/blocked/);

      // A tool that saves state must not clobber the damaged file.
      await mod.dispatchTool("mindvault_use_profile", { name: "other" });
      chmodSync(STATE_DIR, 0o700);
      expect(readFileSync(STATE_FILE, "utf-8")).toBe(original);
      expect(readdirSync(STATE_DIR).filter((f) => f.startsWith("state.json."))).toEqual([]);
      expect(errorSpy.mock.calls.flat().join(" ")).toContain("not saving state");
    },
  );
});
