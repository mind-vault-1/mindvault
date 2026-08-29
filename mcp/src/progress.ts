/**
 * Progress notification helpers for long-running MCP tools.
 *
 * When a client supplies a progress token via `_meta.progressToken`, the server
 * emits `notifications/progress` at each phase boundary so the client can show
 * a progress indicator. When no token is supplied the helpers are no-ops.
 */
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
