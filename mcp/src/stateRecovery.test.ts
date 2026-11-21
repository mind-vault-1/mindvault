import { describe, it, expect } from "vitest";
import {
  buildStateDiagnostics,
  formatStateDiagnostics,
  findJsonErrorOffset,
  jsonErrorPosition,
  listRecoveryArtifacts,
  recoverySteps,
  safeJsonErrorDetail,
} from "./stateRecovery.js";

const STATE_FILE = "/home/u/.mindvault/state.json";
const BACKUP_DIR = "/home/u/.mindvault/backups";

function parseError(raw: string): unknown {
  try {
    JSON.parse(raw);
  } catch (err) {
    return err;
  }
  throw new Error("expected a parse error");
}

describe("jsonErrorPosition", () => {
  it("locates a syntax error as a 1-based line and column", () => {
    const raw = '{\n  "version": 2,\n  "profiles": {,\n}';
    const pos = jsonErrorPosition(raw, parseError(raw));
    expect(pos).toEqual({ line: 3, column: 16 });
  });

  it("finds an unquoted value even though the parser message has no position", () => {
    const raw = '{\n  "wallet": SECRET\n}';
    expect(jsonErrorPosition(raw, parseError(raw))).toEqual({ line: 2, column: 13 });
  });

  it("reports truncation at the end of the file", () => {
    expect(jsonErrorPosition('{"a": [1, 2')).toEqual({ line: 1, column: 12 });
    expect(jsonErrorPosition("")).toEqual({ line: 1, column: 1 });
  });

  it("returns null for valid JSON, including nested values, escapes and numbers", () => {
    expect(jsonErrorPosition('{"a":[1,-2.5e3,true,false,null,{"b":"x\\n\\u00e9"}]}')).toBeNull();
  });

  it("agrees with JSON.parse on what is valid", () => {
    const samples = ['{"a":1}', "[1,]", '{"a":1,}', "01", '"\\x"', "1 2", "[1e]", '{"a" 1}', "true", "nul"];
    for (const raw of samples) {
      let parses = true;
      try {
        JSON.parse(raw);
      } catch {
        parses = false;
      }
      expect(findJsonErrorOffset(raw) === null, raw).toBe(parses);
    }
  });
});

describe("safeJsonErrorDetail", () => {
  it("never repeats the file contents the parser quotes", () => {
    const secret = "SBADSECRETSEEDTHATMUSTNOTLEAK";
    const raw = `{"wallet": ${secret}}`;
    const detail = safeJsonErrorDetail(parseError(raw));
    expect(detail).not.toContain(secret);
    expect(detail).toBe("JSON contains an unexpected character.");
  });

  it("recognises a truncated file", () => {
    expect(safeJsonErrorDetail(parseError(""))).toBe("JSON ends unexpectedly (the file looks truncated).");
    expect(safeJsonErrorDetail(parseError('{"profiles": {'))).toBe(
      "JSON is incomplete or malformed (a value, comma, colon or brace is missing).",
    );
  });
});

describe("listRecoveryArtifacts", () => {
  const ops = (dirs: Record<string, string[]>, mtimes: Record<string, number> = {}) => ({
    readdirSync: (dir: string) => {
      if (!(dir in dirs)) throw new Error("ENOENT");
      return dirs[dir];
    },
    statMtimeMs: (path: string) => mtimes[path] ?? 0,
  });

  it("lists encrypted backups and quarantined copies, newest first", () => {
    const result = listRecoveryArtifacts(
      STATE_FILE,
      BACKUP_DIR,
      ops(
        {
          [BACKUP_DIR]: ["state-2026-01-01.backup", "state-2026-02-01.backup", "notes.txt"],
          "/home/u/.mindvault": ["state.json.corrupt-100", "state.json.corrupt-200", "state.json", "other.corrupt-1"],
        },
        {
          [`${BACKUP_DIR}/state-2026-01-01.backup`]: 1,
          [`${BACKUP_DIR}/state-2026-02-01.backup`]: 2,
          "/home/u/.mindvault/state.json.corrupt-100": 100,
          "/home/u/.mindvault/state.json.corrupt-200": 200,
        },
      ),
    );
    expect(result).toEqual({
      backups: [`${BACKUP_DIR}/state-2026-02-01.backup`, `${BACKUP_DIR}/state-2026-01-01.backup`],
      quarantinedFiles: ["/home/u/.mindvault/state.json.corrupt-200", "/home/u/.mindvault/state.json.corrupt-100"],
    });
  });

  it("treats missing directories as empty", () => {
    expect(listRecoveryArtifacts(STATE_FILE, BACKUP_DIR, ops({}))).toEqual({ backups: [], quarantinedFiles: [] });
  });
});

describe("buildStateDiagnostics", () => {
  const detectedAt = new Date("2026-11-21T10:00:00.000Z");

  it("reports a healthy load with no steps and writes allowed", () => {
    const d = buildStateDiagnostics({ status: "ok", stateFile: STATE_FILE });
    expect(d).toMatchObject({ status: "ok", writesBlocked: false, nextSteps: [], reason: null });
  });

  it("describes a recovered file: where it went, its damage, and how to restore", () => {
    const d = buildStateDiagnostics({
      status: "recovered",
      stateFile: STATE_FILE,
      reason: "invalid_json",
      detail: "JSON ends unexpectedly (the file looks truncated).",
      position: { line: 7, column: 3 },
      quarantinePath: `${STATE_FILE}.corrupt-1`,
      detectedAt,
      backups: [`${BACKUP_DIR}/state-x.backup`],
    });
    expect(d.writesBlocked).toBe(false);
    expect(d.detectedAt).toBe("2026-11-21T10:00:00.000Z");
    expect(d.nextSteps[0]).toContain(`${STATE_FILE}.corrupt-1`);
    expect(d.nextSteps[1]).toContain("line 7, column 3");
    expect(d.nextSteps[2]).toContain(`mindvault_restore_state with blob = the contents of ${BACKUP_DIR}/state-x.backup`);
    expect(d.nextSteps[3]).toContain("mindvault_backup_state");
  });

  it("blocks writes and says how to move the file aside when quarantine failed", () => {
    const d = buildStateDiagnostics({ status: "unrecovered", stateFile: STATE_FILE, reason: "unreadable" });
    expect(d.writesBlocked).toBe(true);
    expect(d.nextSteps[0]).toMatch(/Writes .* are blocked/);
    expect(d.nextSteps[1]).toContain(`mv "${STATE_FILE}"`);
  });

  it("points to wallet re-import when no backup exists", () => {
    const steps = recoverySteps({ status: "recovered", stateFile: STATE_FILE, quarantinePath: "q", backups: [] });
    expect(steps.join("\n")).toContain("mindvault_import_wallet");
  });

  it("is deterministic", () => {
    const input = { status: "recovered" as const, stateFile: STATE_FILE, reason: "no_profiles" as const, quarantinePath: "q", detectedAt };
    expect(buildStateDiagnostics(input)).toEqual(buildStateDiagnostics(input));
  });
});

describe("formatStateDiagnostics", () => {
  it("renders status, preserved path, backups and numbered steps", () => {
    const text = formatStateDiagnostics(
      buildStateDiagnostics({
        status: "recovered",
        stateFile: STATE_FILE,
        reason: "invalid_json",
        quarantinePath: `${STATE_FILE}.corrupt-9`,
        backups: ["/b/state-1.backup"],
      }),
    );
    expect(text).toContain("Status: recovered — the file is not valid JSON and was moved aside");
    expect(text).toContain(`Preserved at: ${STATE_FILE}.corrupt-9`);
    expect(text).toContain("Encrypted backups found: 1");
    expect(text).toMatch(/Next steps:\n1\. /);
  });

  it("flags an unrecovered file prominently", () => {
    const text = formatStateDiagnostics(buildStateDiagnostics({ status: "unrecovered", stateFile: STATE_FILE, reason: "unreadable" }));
    expect(text).toContain("Status: UNRECOVERED");
    expect(text).toContain("Writes are blocked");
  });

  it("says nothing needs doing for a missing or healthy file", () => {
    expect(formatStateDiagnostics(buildStateDiagnostics({ status: "missing", stateFile: STATE_FILE }))).not.toContain("Next steps");
  });
});
