import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chmodSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  exportState,
  restoreState,
  StateBackupError,
  readPersistedState,
  checkStatePermissions,
  scanPersistedStateSecrets,
} from "./stateBackup.js";
import { STATE_VERSION, type ProfileState } from "./profiles.js";

const STATE_DIR = join(homedir(), ".mindvault");
const STATE_FILE = join(STATE_DIR, "state.json");
const PASS = "test-passphrase-ok";

const sample: ProfileState = {
  version: STATE_VERSION,
  activeProfile: "publisher",
  profiles: {
    publisher: {
      wallet: { publicKey: "GPUB", secretKey: "SSECRET" },
      apiKey: "api-key-xyz",
    },
    buyer: {
      wallet: { publicKey: "GBUY", secretKey: "SBUY" },
    },
  },
};

function writeState(state: ProfileState = sample): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

describe("stateBackup", () => {
  const original = existsSync(STATE_FILE) ? readFileSync(STATE_FILE, "utf-8") : null;

  beforeEach(() => {
    writeState();
  });

  afterEach(() => {
    if (original !== null) {
      writeFileSync(STATE_FILE, original, { mode: 0o600 });
    } else if (existsSync(STATE_FILE)) {
      rmSync(STATE_FILE);
    }
  });

  it("exportState rejects short passphrases", () => {
    expect(() => exportState("short")).toThrow(StateBackupError);
    expect(() => exportState("short")).toThrow(/at least 8/);
  });

  it("exportState fails when state file is missing", () => {
    rmSync(STATE_FILE);
    expect(() => exportState(PASS)).toThrow(/No state file/);
  });

  it("exportState never leaks plaintext secrets", () => {
    const blob = exportState(PASS);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(blob).not.toContain("SSECRET");
    expect(blob).not.toContain("SBUY");
    expect(blob).not.toContain("api-key-xyz");
    expect(blob).not.toContain("GPUB");
  });

  it("identifies secrets before an unencrypted persisted-state backup is shared", () => {
    expect(scanPersistedStateSecrets(sample)).toEqual([
      { path: "profiles.publisher.wallet.secretKey", kind: "wallet-secret-key" },
      { path: "profiles.publisher.apiKey", kind: "api-key" },
      { path: "profiles.buyer.wallet.secretKey", kind: "wallet-secret-key" },
    ]);
    expect(scanPersistedStateSecrets({ profiles: { empty: {} } })).toEqual([]);
  });

  it("round-trips export → restore with same passphrase", () => {
    const blob = exportState(PASS);
    let restored: ProfileState | null = null;
    const msg = restoreState(blob, PASS, (s) => {
      restored = s;
    });
    expect(msg).toContain("2 profile");
    expect(msg).toContain("publisher");
    expect(restored).toEqual(sample);
  });

  it("restore rejects wrong passphrase without calling write", () => {
    const blob = exportState(PASS);
    let wrote = false;
    expect(() =>
      restoreState(blob, "wrong-passphrase", () => {
        wrote = true;
      }),
    ).toThrow(/integrity check failed/);
    expect(wrote).toBe(false);
  });

  it("restore rejects tampered blob without calling write", () => {
    const blob = exportState(PASS);
    const parts = blob.split(":");
    // flip last char of ciphertext
    const last = parts[3];
    const flipped = last.slice(0, -1) + (last.endsWith("A") ? "B" : "A");
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${flipped}`;
    let wrote = false;
    expect(() =>
      restoreState(tampered, PASS, () => {
        wrote = true;
      }),
    ).toThrow(StateBackupError);
    expect(wrote).toBe(false);
  });

  it("restore rejects invalid format", () => {
    expect(() => restoreState("not-a-blob", PASS, () => {})).toThrow(/Invalid backup format/);
    expect(() => restoreState("v2:a:b:c", PASS, () => {})).toThrow(/Invalid backup format/);
  });

  it("readPersistedState returns normalized profiles", () => {
    const state = readPersistedState();
    expect(state.activeProfile).toBe("publisher");
    expect(state.profiles.publisher?.wallet?.secretKey).toBe("SSECRET");
    expect(state.profiles.buyer?.wallet?.publicKey).toBe("GBUY");
  });
});

describe("checkStatePermissions", () => {
  const STATE_DIR = join(homedir(), ".mindvault");
  const STATE_FILE = join(STATE_DIR, "state.json");

  beforeEach(() => {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ version: 1, activeProfile: "default", profiles: {} }),
      {
        mode: 0o600,
      },
    );
  });

  afterEach(() => {
    if (existsSync(STATE_FILE)) rmSync(STATE_FILE);
  });

  it("reports safe when mode is 0600", () => {
    const result = checkStatePermissions();
    expect(result.exists).toBe(true);
    expect(result.isSafe).toBe(true);
    expect(result.mode).toBe("0600");
    expect(result.message).toContain("safe");
  });

  it("reports unsafe when mode is 0644 (world-readable)", () => {
    chmodSync(STATE_FILE, 0o644);
    const result = checkStatePermissions();
    expect(result.exists).toBe(true);
    expect(result.isSafe).toBe(false);
    expect(result.mode).toBe("0644");
    expect(result.message).toContain("UNSAFE");
    expect(result.message).toContain("world-readable");
    expect(result.message).toContain("chmod 0600");
  });

  it("reports unsafe when mode is 0666 (world-readable and writable)", () => {
    chmodSync(STATE_FILE, 0o666);
    const result = checkStatePermissions();
    expect(result.exists).toBe(true);
    expect(result.isSafe).toBe(false);
    expect(result.message).toContain("UNSAFE");
    expect(result.message).toContain("world-readable");
    expect(result.message).toContain("world-writable");
  });

  it("reports safe when file does not exist", () => {
    rmSync(STATE_FILE);
    const result = checkStatePermissions();
    expect(result.exists).toBe(false);
    expect(result.isSafe).toBe(true);
    expect(result.message).toContain("does not exist");
  });
});
