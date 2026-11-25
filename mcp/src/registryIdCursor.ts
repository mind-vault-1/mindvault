/**
 * Opaque cursor tokens for the contract's id-indexed listings.
 *
 * The vault registry returns an `IdCursor` — `Start`, `After(position, id,
 * created_at)`, or `End` — from `list_by_creator_page` and
 * `list_by_creator_page_filtered`. That is a contract-internal shape: an agent
 * should not have to know that a cursor is a triple, and it should not be
 * able to hand-edit one. The token below is a signed, expiring, base64url
 * envelope, the same shape `catalogCursor.ts` uses for the MindVault API
 * catalog, so a cursor stays opaque, versioned, and self-describing.
 *
 * The token is authenticated with `cursorToken.ts`: editing a payload breaks
 * the HMAC, and an expired token is rejected with a distinct error.
 */

import {
  createCursorToken,
  cursorErrorMessage,
  readCursorToken,
  type CursorFailureReason,
} from "./cursorToken.js";

/** The contract's id cursor, as the generated bindings model it. */
export type IdCursor =
  | { tag: "Start"; values: void }
  | { tag: "After"; values: readonly [number, string, number] }
  | { tag: "End"; values: void };

/** The decoded payload of a cursor token. */
interface IdCursorPayload {
  /** Token format version. Bump when the payload shape changes. */
  v: 1;
  /** `"s"` = start, `"e"` = end, `"a"` = after a specific entry. */
  t: "s" | "e" | "a";
  /** Position of the last entry of the previous page. */
  p?: number;
  /** Id of the last entry of the previous page. */
  i?: string;
  /** Creation ledger of the last entry of the previous page. */
  c?: number;
}

/** Bump when the token format changes, so old tokens are rejected cleanly. */
const CURSOR_VERSION = 1;

export function encodeIdCursor(cursor: IdCursor, now: () => number = Date.now): string {
  let payload: IdCursorPayload;
  if (cursor.tag === "Start") payload = { v: CURSOR_VERSION, t: "s" };
  else if (cursor.tag === "End") payload = { v: CURSOR_VERSION, t: "e" };
  else {
    const [position, id, createdAt] = cursor.values;
    payload = { v: CURSOR_VERSION, t: "a", p: position, i: id, c: createdAt };
  }
  return createCursorToken("registry", payload, now);
}

export type IdCursorResult =
  | { ok: true; cursor: IdCursor }
  | { ok: false; reason: CursorFailureReason; error: string };

export function decodeIdCursor(token: string, now: () => number = Date.now): IdCursorResult {
  const decoded = readCursorToken<Partial<IdCursorPayload>>(token, "registry", now);
  if (!decoded.ok) return decoded;

  const payload = decoded.payload;
  if (payload.v !== CURSOR_VERSION) {
    return { ok: false, reason: "invalid", error: cursorErrorMessage("registry", "invalid") };
  }

  if (payload.t === "s") return { ok: true, cursor: { tag: "Start", values: undefined } };
  if (payload.t === "e") return { ok: true, cursor: { tag: "End", values: undefined } };

  if (payload.t === "a") {
    const position = payload.p;
    const id = payload.i;
    const createdAt = payload.c;
    if (
      typeof position !== "number" ||
      !Number.isInteger(position) ||
      position < 0 ||
      typeof createdAt !== "number" ||
      !Number.isInteger(createdAt) ||
      createdAt < 0 ||
      typeof id !== "string" ||
      id.length === 0
    ) {
      return { ok: false, reason: "invalid", error: cursorErrorMessage("registry", "invalid") };
    }
    return { ok: true, cursor: { tag: "After", values: [position, id, createdAt] } };
  }

  return { ok: false, reason: "invalid", error: cursorErrorMessage("registry", "invalid") };
}
