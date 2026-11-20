/**
 * Progress notification helpers for long-running MCP tools.
 *
 * When a client supplies a progress token via `_meta.progressToken`, the server
 * emits `notifications/progress` at each phase boundary so the client can show
 * a progress indicator. When no token is supplied the helpers are no-ops.
 */
import { randomUUID } from "node:crypto";
import { type Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";

export type SendNotification = (notification: ServerNotification) => Promise<void>;

export interface ProgressContext {
  /** The client-supplied progress token, if any. */
  token?: string | number;
  /** Sends a notification through the server transport. */
  send: SendNotification;
}

/**
 * Create a progress helper bound to the current request's progress token.
 * Returns a no-op function when `token` is undefined.
 */
export function createProgressEmitter(
  ctx: ProgressContext,
): (progress: number, total?: number, message?: string) => Promise<void> {
  if (ctx.token == null) {
    return async () => {};
  }
  const { token, send } = ctx;
  return async (progress: number, total?: number, message?: string) => {
    const params: Record<string, unknown> = {
      progressToken: token,
      progress,
    };
    if (total != null) params.total = total;
    if (message != null) params.message = message;
    await send({
      method: "notifications/progress",
      params: params as {
        progressToken: string | number;
        progress: number;
        total?: number;
        message?: string;
      },
    });
  };
}

/** Emits one progress update; returns once the notification has been handed to the transport. */
export type ProgressFn = (progress: number, total?: number, message?: string) => Promise<void>;

/** Progress reporting bound to the lifetime of one tool call. */
export interface RequestProgress {
  /** Forwards to the underlying emitter while the call is running; a no-op after `settle`. */
  emit: ProgressFn;
  /**
   * Wait for every notification already started, then drop any later `emit`.
   * The request handler calls this before it returns the tool result.
   */
  settle: () => Promise<void>;
}

/**
 * Scope a progress emitter to a single tool call so that no notification is
 * sent after the call's result (#841).
 *
 * A progress notification belongs to the request that carried its token. Once
 * the result has gone out, some transports have already closed that request's
 * stream (Streamable HTTP ends the SSE response) and drop a later notification
 * without an error, and the client has stopped tracking the token anyway. So
 * an update must be delivered before the result or not at all:
 *
 *  - `emit` tracks each send, so one started but not awaited — a
 *    fire-and-forget call, or a send still in flight when the tool resolves —
 *    is finished before the result is sent rather than racing it;
 *  - once `settle` runs, `emit` stops sending, so a callback that outlives the
 *    tool cannot write to the transport after the result.
 *
 * A failed send still rejects the `emit` promise the tool awaits, exactly as
 * before; `settle` itself never throws.
 */
export function scopeProgressToRequest(
  emit: (progress: number, total?: number, message?: string) => void | Promise<void>,
): RequestProgress {
  const inFlight = new Set<Promise<void>>();
  let settled = false;

  return {
    emit: (progress, total, message) => {
      if (settled) return Promise.resolve();
      let sent: Promise<void>;
      try {
        sent = Promise.resolve(emit(progress, total, message));
      } catch (err) {
        sent = Promise.reject(err);
      }
      inFlight.add(sent);
      const done = () => {
        inFlight.delete(sent);
      };
      sent.then(done, done);
      return sent;
    },
    settle: async () => {
      settled = true;
      await Promise.allSettled([...inFlight]);
    },
  };
}

// ── Replay-safe progress events (#1061) ─────────────────────────────────────

/** Key under which a progress notification's event identity travels in `params._meta`. */
export const PROGRESS_EVENT_META_KEY = "mindvault/progressEvent";

/** Identity stamped on every progress notification for one tool call. */
export interface ProgressEventMeta {
  /** Random per-call id; every notification for the same call shares it. */
  streamId: string;
  /** 1-based, gap-free position of this notification within the call. */
  sequence: number;
  /** `<streamId>:<sequence>` — unique per notification, stable across replays. */
  eventId: string;
}

/**
 * Stamp each progress notification of one tool call with a stable event id
 * and a per-call sequence number, and drop any update that would not advance
 * the call's progress (#1061).
 *
 * A transport that resumes a stream after a reconnect (Streamable HTTP
 * replaying from `Last-Event-ID`, a proxy retrying a write) can deliver the
 * same notification twice. Without an identity on the event a client cannot
 * tell a replay from a new step, so one publish or one payment shows up as
 * several. The replayed copy carries the same `eventId` and `sequence` as the
 * original, which is what lets `createProgressDeduplicator` drop it.
 *
 * The MCP spec requires `progress` to increase with each notification, so an
 * update that repeats or goes back on an earlier value is not sent at all.
 *
 * Only `notifications/progress` is touched; anything else passes through
 * unchanged. The notification's standard fields are unchanged too, so a client
 * that ignores `_meta` sees exactly what it saw before.
 */
export function sequenceProgressNotifications<N extends { method: string; params?: unknown }>(
  send: (notification: N) => Promise<void> | void,
  streamId: string = randomUUID(),
): (notification: N) => Promise<void> {
  let sequence = 0;
  let lastProgress = Number.NEGATIVE_INFINITY;

  return async (notification) => {
    if (notification.method !== "notifications/progress") {
      await send(notification);
      return;
    }
    const params = (notification.params ?? {}) as {
      progress: number;
      _meta?: Record<string, unknown>;
    };
    if (!(params.progress > lastProgress)) return;
    lastProgress = params.progress;
    sequence += 1;
    const event: ProgressEventMeta = { streamId, sequence, eventId: `${streamId}:${sequence}` };
    await send({
      ...notification,
      params: { ...params, _meta: { ...(params._meta ?? {}), [PROGRESS_EVENT_META_KEY]: event } },
    });
  };
}

/** Read the event identity off a progress notification's params, if it has one. */
export function progressEventOf(params: unknown): ProgressEventMeta | undefined {
  const meta = (params as { _meta?: Record<string, unknown> } | undefined)?._meta;
  const event = meta?.[PROGRESS_EVENT_META_KEY] as Partial<ProgressEventMeta> | undefined;
  if (
    !event ||
    typeof event.streamId !== "string" ||
    typeof event.sequence !== "number" ||
    typeof event.eventId !== "string"
  ) {
    return undefined;
  }
  return { streamId: event.streamId, sequence: event.sequence, eventId: event.eventId };
}

/**
 * Client-side filter for progress notifications that may be replayed (#1061).
 *
 * Returns `true` the first time it sees a notification and `false` for a
 * replay of one it has already accepted. Notifications are tracked per
 * progress token and stream:
 *
 *  - with a `mindvault/progressEvent` stamp, a notification is new only when
 *    its `sequence` is above the last one accepted for that stream;
 *  - without one (an older server), it falls back to the MCP rule that
 *    `progress` strictly increases per token.
 */
export function createProgressDeduplicator(): (params: {
  progressToken?: string | number;
  progress: number;
  _meta?: Record<string, unknown>;
}) => boolean {
  const lastSequence = new Map<string, number>();
  const lastProgress = new Map<string, number>();

  return (params) => {
    const token = JSON.stringify(params.progressToken ?? null);
    const event = progressEventOf(params);
    if (event) {
      const key = `${token}|${event.streamId}`;
      if (event.sequence <= (lastSequence.get(key) ?? 0)) return false;
      lastSequence.set(key, event.sequence);
      return true;
    }
    if (params.progress <= (lastProgress.get(token) ?? Number.NEGATIVE_INFINITY)) return false;
    lastProgress.set(token, params.progress);
    return true;
  };
}
