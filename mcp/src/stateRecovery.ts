/**
 * Recoverable diagnostics for a corrupt local state file (#1207).
 *
 * On startup the server reads ~/.mindvault/state.json. When that file cannot
 * be read, is not valid JSON, or holds no recognisable profile, it is moved
 * aside to `state.json.corrupt-<ms>` and the server starts with empty state.
 * Before this module, the only trace of that was a line on stderr, which an
 * agent never sees, so a user could lose their wallet without being told
 * where the original bytes went or how to get them back.
 *
 * This module turns the event into a deterministic, agent-safe record:
 * what happened, where the original file now is, which encrypted backups and
 * earlier quarantined copies exist, and the exact steps to recover. It never
 * includes file contents, so no secret key can leak through it.
 *
 * It also decides whether writes must be blocked: if the corrupt file could
 * not be moved aside, saving fresh state would overwrite the only copy of the
 * user's data, so the server refuses to save until an operator intervenes.
 *
 * Pure apart from the directory listing, which takes injectable fs ops.
 */

import { readdirSync, statSync } from "fs";
import { basename, dirname, join } from "path";

export type StateLoadReason = "unreadable" | "invalid_json" | "no_profiles";

export type StateLoadStatus =
  /** The state file loaded normally. */
  | "ok"
  /** No state file yet: a fresh install. */
  | "missing"
  /** The file was corrupt and has been moved aside; the server started fresh. */
  | "recovered"
  /** The file was corrupt and could NOT be moved aside; writes are blocked. */
  | "unrecovered";

export interface StateLoadDiagnostics {
  status: StateLoadStatus;
  stateFile: string;
  reason: StateLoadReason | null;
  /** Agent-safe description of the failure; never contains file contents. */
  detail: string | null;
  /** 1-based position of a JSON syntax error, when one could be located. */
  position: { line: number; column: number } | null;
  /** Where the corrupt file was moved, when it was. */
  quarantinePath: string | null;
  /** True when saving would overwrite the only copy of the corrupt file. */
  writesBlocked: boolean;
  detectedAt: string | null;
  /** Encrypted backups (mindvault_backup_state output), newest first. */
  backups: string[];
  /** Corrupt files quarantined by this or earlier starts, newest first. */
  quarantinedFiles: string[];
  nextSteps: string[];
}

export const STATE_LOAD_REASON_TEXT: Record<StateLoadReason, string> = {
  unreadable: "could not be read",
  invalid_json: "is not valid JSON",
  no_profiles: "did not contain a recognisable profile",
};

/**
 * Offset of the first JSON syntax error in `raw`, or null when it is valid.
 * A truncated document reports `raw.length`. Implemented here rather than read
 * from the parser's message because V8 omits the position for some errors and
 * words it differently across Node versions; this keeps diagnostics
 * deterministic.
 */
export function findJsonErrorOffset(raw: string): number | null {
  let i = 0;
  const ws = () => {
    while (i < raw.length && " \t\n\r".includes(raw[i])) i++;
  };
  const fail = (): never => {
    throw i;
  };
  const literal = (word: string) => {
    for (const ch of word) {
      if (raw[i] !== ch) fail();
      i++;
    }
  };
  const string = () => {
    i++; // opening quote
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '"') {
        i++;
        return;
      }
      if (ch < " ") fail();
      if (ch === "\\") {
        i++;
        if (raw[i] === "u") {
          for (let k = 0; k < 4; k++) {
            i++;
            if (!/[0-9a-fA-F]/.test(raw[i] ?? "")) fail();
          }
        } else if (!'"\\/bfnrt'.includes(raw[i] ?? "\0") || i >= raw.length) fail();
      }
      i++;
    }
    fail();
  };
  const number = () => {
    if (raw[i] === "-") i++;
    if (raw[i] === "0") i++;
    else if (/[1-9]/.test(raw[i] ?? "")) while (/[0-9]/.test(raw[i] ?? "")) i++;
    else fail();
    if (raw[i] === ".") {
      i++;
      if (!/[0-9]/.test(raw[i] ?? "")) fail();
      while (/[0-9]/.test(raw[i] ?? "")) i++;
    }
    if (raw[i] === "e" || raw[i] === "E") {
      i++;
      if (raw[i] === "+" || raw[i] === "-") i++;
      if (!/[0-9]/.test(raw[i] ?? "")) fail();
      while (/[0-9]/.test(raw[i] ?? "")) i++;
    }
  };
  const value = (): void => {
    ws();
    const ch = raw[i];
    if (ch === "{") {
      i++;
      ws();
      if (raw[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (raw[i] !== '"') fail();
        string();
        ws();
        if (raw[i] !== ":") fail();
        i++;
        value();
        ws();
        if (raw[i] === ",") {
          i++;
          continue;
        }
        if (raw[i] === "}") {
          i++;
          return;
        }
        fail();
      }
    }
    if (ch === "[") {
      i++;
      ws();
      if (raw[i] === "]") {
        i++;
        return;
      }
      for (;;) {
        value();
        ws();
        if (raw[i] === ",") {
          i++;
          continue;
        }
        if (raw[i] === "]") {
          i++;
          return;
        }
        fail();
      }
    }
    if (ch === '"') return string();
    if (ch === "t") return literal("true");
    if (ch === "f") return literal("false");
    if (ch === "n") return literal("null");
    if (ch === "-" || (ch !== undefined && ch >= "0" && ch <= "9")) return number();
    fail();
  };
  try {
    value();
    ws();
    if (i < raw.length) fail();
    return null;
  } catch (offset) {
    if (typeof offset !== "number") throw offset;
    return Math.min(offset, raw.length);
  }
}

/** 1-based line/column of a character offset in `raw`. */
export function offsetToPosition(raw: string, offset: number): { line: number; column: number } {
  const before = raw.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}

/**
 * Locate the first JSON syntax error in `raw` as a 1-based line/column, or
 * null when no error is found. `err` is accepted for call-site symmetry with
 * the parser; the position is always computed from `raw` itself.
 */
export function jsonErrorPosition(
  raw: string,
  _err?: unknown,
): { line: number; column: number } | null {
  const offset = findJsonErrorOffset(raw);
  return offset === null ? null : offsetToPosition(raw, offset);
}

/**
 * Strip a JSON parser message down to its kind, dropping any quoted excerpt of
 * the file (V8 includes a snippet of the input, which could hold a secret key).
 */
export function safeJsonErrorDetail(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/unexpected end/i.test(message)) return "JSON ends unexpectedly (the file looks truncated).";
  if (/expected (property name|',' or|':' after|double-quoted)/i.test(message)) {
    return "JSON is incomplete or malformed (a value, comma, colon or brace is missing).";
  }
  if (/unexpected token|unexpected non-whitespace|unexpected character/i.test(message)) {
    return "JSON contains an unexpected character.";
  }
  if (/bad control character|bad escaped character|unterminated string/i.test(message)) {
    return "JSON contains a malformed string.";
  }
  return "JSON could not be parsed.";
}

export interface RecoveryFsOps {
  readdirSync: (dir: string) => string[];
  statMtimeMs: (path: string) => number;
}

const defaultFsOps: RecoveryFsOps = {
  readdirSync: (dir) => readdirSync(dir),
  statMtimeMs: (path) => statSync(path).mtimeMs,
};

function newestFirst(paths: string[], ops: RecoveryFsOps): string[] {
  const withTime = paths.map((path) => {
    let mtime = 0;
    try {
      mtime = ops.statMtimeMs(path);
    } catch {
      mtime = 0;
    }
    return { path, mtime };
  });
  return withTime
    .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path))
    .map((entry) => entry.path);
}

function safeList(dir: string, ops: RecoveryFsOps): string[] {
  try {
    return ops.readdirSync(dir);
  } catch {
    return [];
  }
}

/** Encrypted backups and quarantined copies that could restore the state. */
export function listRecoveryArtifacts(
  stateFile: string,
  backupDir: string,
  ops: RecoveryFsOps = defaultFsOps,
): { backups: string[]; quarantinedFiles: string[] } {
  const backups = safeList(backupDir, ops)
    .filter((name) => /^state-.*\.backup$/.test(name))
    .map((name) => join(backupDir, name));
  const prefix = `${basename(stateFile)}.corrupt-`;
  const quarantinedFiles = safeList(dirname(stateFile), ops)
    .filter((name) => name.startsWith(prefix))
    .map((name) => join(dirname(stateFile), name));
  return {
    backups: newestFirst(backups, ops),
    quarantinedFiles: newestFirst(quarantinedFiles, ops),
  };
}

export interface StateDiagnosticsInput {
  status: StateLoadStatus;
  stateFile: string;
  reason?: StateLoadReason | null;
  detail?: string | null;
  position?: { line: number; column: number } | null;
  quarantinePath?: string | null;
  detectedAt?: Date | null;
  backups?: string[];
  quarantinedFiles?: string[];
}

/** Ordered, deterministic recovery steps for a load outcome. */
export function recoverySteps(input: StateDiagnosticsInput): string[] {
  const backups = input.backups ?? [];
  const restoreStep = backups.length
    ? `Restore the newest encrypted backup: call mindvault_restore_state with blob = the contents of ${backups[0]} and the passphrase used to create it.`
    : "No encrypted backup was found. If you have one elsewhere, restore it with mindvault_restore_state; otherwise re-import the wallet with mindvault_import_wallet (or create a new one with mindvault_setup_wallet).";

  switch (input.status) {
    case "ok":
    case "missing":
      return [];
    case "recovered":
      return [
        `Your previous state file was preserved at ${input.quarantinePath}. Nothing in it was deleted.`,
        input.position
          ? `It is damaged at line ${input.position.line}, column ${input.position.column}. If you can repair it, stop the server, move it back to ${input.stateFile}, and restart.`
          : `If you can repair it, stop the server, move it back to ${input.stateFile}, and restart.`,
        restoreStep,
        "After recovering, call mindvault_backup_state to take a fresh encrypted backup.",
      ];
    case "unrecovered":
      return [
        `Writes to ${input.stateFile} are blocked so the damaged file is not overwritten; wallet and profile changes in this session will not be saved.`,
        `Stop the server and move the file aside yourself, e.g. mv "${input.stateFile}" "${input.stateFile}.corrupt-manual", then fix its permissions or disk issue and restart.`,
        restoreStep,
      ];
  }
}

export function buildStateDiagnostics(input: StateDiagnosticsInput): StateLoadDiagnostics {
  return {
    status: input.status,
    stateFile: input.stateFile,
    reason: input.reason ?? null,
    detail: input.detail ?? null,
    position: input.position ?? null,
    quarantinePath: input.quarantinePath ?? null,
    writesBlocked: input.status === "unrecovered",
    detectedAt: input.detectedAt ? input.detectedAt.toISOString() : null,
    backups: input.backups ?? [],
    quarantinedFiles: input.quarantinedFiles ?? [],
    nextSteps: recoverySteps(input),
  };
}

/** Human-readable rendering for the tool's text content. */
export function formatStateDiagnostics(d: StateLoadDiagnostics): string {
  const lines = [`State file: ${d.stateFile}`];
  switch (d.status) {
    case "ok":
      lines.push("Status: ok — the state file loaded normally.");
      break;
    case "missing":
      lines.push(
        "Status: missing — no state file yet (fresh install). Run mindvault_setup_wallet to create one.",
      );
      break;
    case "recovered":
      lines.push(
        `Status: recovered — the file ${d.reason ? STATE_LOAD_REASON_TEXT[d.reason] : "was unusable"} and was moved aside; the server started with empty state.`,
      );
      break;
    case "unrecovered":
      lines.push(
        `Status: UNRECOVERED — the file ${d.reason ? STATE_LOAD_REASON_TEXT[d.reason] : "was unusable"} and could not be moved aside. Writes are blocked.`,
      );
      break;
  }
  if (d.detail) lines.push(`Detail: ${d.detail}`);
  if (d.position) lines.push(`Position: line ${d.position.line}, column ${d.position.column}`);
  if (d.quarantinePath) lines.push(`Preserved at: ${d.quarantinePath}`);
  if (d.detectedAt) lines.push(`Detected at: ${d.detectedAt}`);
  if (d.status === "recovered" || d.status === "unrecovered") {
    lines.push(`Encrypted backups found: ${d.backups.length}`);
    for (const path of d.backups) lines.push(`  - ${path}`);
    if (d.quarantinedFiles.length) {
      lines.push(`Quarantined copies: ${d.quarantinedFiles.length}`);
      for (const path of d.quarantinedFiles) lines.push(`  - ${path}`);
    }
  }
  if (d.nextSteps.length) {
    lines.push("", "Next steps:");
    d.nextSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  return lines.join("\n");
}
