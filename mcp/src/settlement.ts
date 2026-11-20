/**
 * Settlement confirmation for x402 purchases (#888).
 *
 * `mindvault_buy` submits a payment and returns as soon as the payment
 * response comes back. The payment transaction still has to settle on-chain
 * before the receipt is final, and an agent that moves straight on can end up
 * reasoning from a transaction Soroban has not committed yet. These helpers
 * poll `getTransaction` over Soroban RPC until the payment transaction reaches
 * a terminal status (`SUCCESS` or `FAILED`), or the caller's deadline passes,
 * so `mindvault_buy` can confirm settlement before handing the summary back.
 *
 * The module is pure: polling, clamping, and message formatting never touch
 * I/O or server state, so the surprising parts (timeouts, intervals, terminal
 * statuses, and the exact wording agents read) stay unit-testable.
 */

/** Terminal transaction statuses — polling stops when one of these is reached. */
export const SETTLED_TRANSACTION_STATUSES = new Set<string>(["SUCCESS", "FAILED"]);

export const DEFAULT_SETTLEMENT_INTERVAL_MS = 2_000;
export const DEFAULT_SETTLEMENT_TIMEOUT_MS = 60_000;
export const MAX_SETTLEMENT_TIMEOUT_MS = 300_000;
export const MIN_SETTLEMENT_INTERVAL_MS = 200;

/**
 * What Soroban RPC's getTransaction told us about one hash. The payment paths
 * in this server only need `status` and `found`; the rest is surfaced so an
 * agent can verify by hash and ledger without a second RPC round trip.
 */
export interface TransactionLookup {
  hash: string;
  /** False when getTransaction returned NOT_FOUND (unknown / not yet seen). */
  found: boolean;
  status: string;
  ledger?: number | null;
  ledgerCloseTime?: string | null;
}

/** A transaction has settled when it reached a terminal status. */
export function isTransactionSettled(status: string | null | undefined): boolean {
  if (!status) return false;
  return SETTLED_TRANSACTION_STATUSES.has(status);
}

export function normalizeSettlementWaitFlag(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === "") return false;
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  throw new Error(
    `wait must be a boolean. Got: ${JSON.stringify(raw)}. Pass wait: true to poll until the payment settles.`,
  );
}

export function normalizeSettlementTimeoutMs(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_SETTLEMENT_TIMEOUT_MS;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `timeoutMs must be a non-negative number (ms). Got: ${JSON.stringify(raw)}. Default is ${DEFAULT_SETTLEMENT_TIMEOUT_MS}.`,
    );
  }
  return Math.min(Math.floor(n), MAX_SETTLEMENT_TIMEOUT_MS);
}

export function normalizeSettlementIntervalMs(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_SETTLEMENT_INTERVAL_MS;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < MIN_SETTLEMENT_INTERVAL_MS) {
    throw new Error(
      `intervalMs must be a number ≥ ${MIN_SETTLEMENT_INTERVAL_MS} (ms). Got: ${JSON.stringify(raw)}. Default is ${DEFAULT_SETTLEMENT_INTERVAL_MS}.`,
    );
  }
  return Math.floor(n);
}

// ── Transaction wait policy (#1058) ───────────────────────────────────────────

/**
 * How a submitted Soroban operation should behave after the transaction is
 * broadcast. Mirrors the two questions a caller actually has:
 *
 *  - `return-after-submit` — "give me the hash and whatever status you know
 *    now; I'll poll later." Returns as soon as submission succeeds.
 *  - `wait-for-final-result` — "don't return until the transaction reaches a
 *    terminal status or the deadline passes."
 */
export const TRANSACTION_WAIT_POLICIES = ["return-after-submit", "wait-for-final-result"] as const;

export type TransactionWaitPolicy = (typeof TRANSACTION_WAIT_POLICIES)[number];

/** Default behaviour: return as soon as the transaction is submitted. */
export const DEFAULT_TRANSACTION_WAIT_POLICY: TransactionWaitPolicy = "return-after-submit";

/**
 * Hard ceiling on any wait, no matter what a caller asks for. Matches the
 * settlement timeout ceiling, so `wait-for-final-result` can never outlive the
 * configured maximum.
 */
export const MAX_TRANSACTION_WAIT_MS = MAX_SETTLEMENT_TIMEOUT_MS;

/** Short aliases accepted on the wire, mapped to the canonical policy. */
const TRANSACTION_WAIT_ALIASES: Record<string, TransactionWaitPolicy> = {
  "return-after-submit": "return-after-submit",
  return_after_submit: "return-after-submit",
  submit: "return-after-submit",
  none: "return-after-submit",
  "wait-for-final-result": "wait-for-final-result",
  wait_for_final_result: "wait-for-final-result",
  final: "wait-for-final-result",
  wait: "wait-for-final-result",
};

/**
 * Normalize a caller-supplied wait policy. Accepts the canonical names plus a
 * few short aliases (`"submit"`, `"final"`). An empty value means "use the
 * default". An unrecognized value is rejected rather than silently ignored, so
 * a typo never changes confirmation behaviour without the caller noticing.
 */
export function normalizeTransactionWaitPolicy(raw: unknown): TransactionWaitPolicy {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_TRANSACTION_WAIT_POLICY;
  if (typeof raw === "string") {
    const key = raw.trim().toLowerCase();
    const policy = TRANSACTION_WAIT_ALIASES[key];
    if (policy) return policy;
  }
  throw new Error(
    `waitPolicy must be one of ${TRANSACTION_WAIT_POLICIES.join(", ")}. Got: ${JSON.stringify(raw)}.`,
  );
}

/** Map the boolean `wait` flag (the pre-#1058 interface) onto a policy. */
export function waitPolicyFromFlag(wait: unknown): TransactionWaitPolicy {
  return normalizeSettlementWaitFlag(wait) ? "wait-for-final-result" : "return-after-submit";
}

export interface ResolvedTransactionWait {
  policy: TransactionWaitPolicy;
  /** True only for `wait-for-final-result`. */
  wait: boolean;
  timeoutMs: number;
  intervalMs: number;
}

/**
 * Resolve the effective wait behaviour for one call.
 *
 * `waitPolicy` wins when supplied; otherwise the legacy boolean `wait` flag is
 * mapped onto a policy, so existing clients that pass `wait: true` keep working
 * unchanged. The timeout is always clamped to `MAX_TRANSACTION_WAIT_MS`.
 */
export function resolveTransactionWait(input: {
  waitPolicy?: unknown;
  wait?: unknown;
  timeoutMs?: unknown;
  intervalMs?: unknown;
}): ResolvedTransactionWait {
  const policy =
    input.waitPolicy === undefined || input.waitPolicy === null || input.waitPolicy === ""
      ? waitPolicyFromFlag(input.wait)
      : normalizeTransactionWaitPolicy(input.waitPolicy);
  return {
    policy,
    wait: policy === "wait-for-final-result",
    timeoutMs: normalizeSettlementTimeoutMs(input.timeoutMs),
    intervalMs: normalizeSettlementIntervalMs(input.intervalMs),
  };
}

/**
 * The `settlement` block a submitted operation's summary carries. `polled` is
 * true whenever the call actually waited on the transaction; `skipped` is true
 * only when the caller asked to wait but no transaction hash was available to
 * poll; `cancelled` is true when the caller aborted the wait before it settled.
 *
 * `txHash` and `status` are always present — `status` is `null` only when no
 * status could be read (return-after-submit with no hash, or a failed lookup),
 * never omitted.
 */
export interface SettlementSnapshot {
  polled: boolean;
  /** The policy the call ran under, so the shape of the block is self-describing. */
  waitPolicy: TransactionWaitPolicy;
  txHash: string | null;
  status: string | null;
  settled: boolean;
  success: boolean;
  timedOut: boolean;
  cancelled: boolean;
  attempts: number;
  skipped: boolean;
  message: string;
}

/** Message explaining a settlement that could not be confirmed the way asked. */
export function skippedSettlementMessage(reason: "no-tx-hash" | "no-wait"): string {
  if (reason === "no-tx-hash") {
    return "The payment response included no transaction hash, so on-chain settlement could not be polled. Re-check with mindvault_tx_status once a hash is available.";
  }
  return "Settlement not checked. Pass wait: true to poll until the payment transaction settles.";
}

export function buildSettlementSnapshot(input: {
  txHash: string | null;
  wait: boolean;
  skipped: boolean;
  /** The policy the call ran under; defaults to the boolean `wait` flag. */
  waitPolicy?: TransactionWaitPolicy;
  result: {
    tx: TransactionLookup;
    attempts: number;
    timedOut: boolean;
    cancelled?: boolean;
  } | null;
}): SettlementSnapshot {
  const { txHash, wait, skipped } = input;
  const waitPolicy = input.waitPolicy ?? waitPolicyFromFlag(wait);
  const polled = wait && !skipped && input.result !== null;

  if (!polled) {
    return {
      polled,
      waitPolicy,
      txHash: txHash ?? null,
      status: null,
      settled: false,
      success: false,
      timedOut: false,
      cancelled: false,
      attempts: 0,
      skipped: wait && skipped,
      message:
        wait && skipped
          ? skippedSettlementMessage("no-tx-hash")
          : skippedSettlementMessage("no-wait"),
    };
  }

  const { tx, attempts, timedOut } = input.result!;
  const cancelled = input.result!.cancelled === true;
  const settled = isTransactionSettled(tx.status);
  const success = tx.status === "SUCCESS";

  let message: string;
  if (cancelled) {
    message = `Settlement wait cancelled after ${attempts} check${
      attempts === 1 ? "" : "s"
    } (last status: ${tx.status}). Re-check with mindvault_tx_status on ${tx.hash}.`;
  } else if (timedOut && !settled) {
    message = `Reached the settlement deadline without a terminal status (last status: ${tx.status}). Re-check with mindvault_tx_status on ${tx.hash}.`;
  } else if (success) {
    message = `Payment settled on-chain (status: SUCCESS) after ${attempts} check${
      attempts === 1 ? "" : "s"
    }.`;
  } else if (settled) {
    message = `Payment transaction finished with status ${tx.status} after ${attempts} check${
      attempts === 1 ? "" : "s"
    }.`;
  } else {
    message = `Transaction status ${tx.status} after ${attempts} check${
      attempts === 1 ? "" : "s"
    }.`;
  }

  return {
    polled,
    waitPolicy,
    txHash: tx.hash ?? txHash ?? null,
    status: tx.status,
    settled,
    success,
    timedOut,
    cancelled,
    attempts,
    skipped,
    message,
  };
}

// ── Streaming progress while waiting for settlement ─────────────────────────

/** Emits an MCP `notifications/progress` update; a no-op without a progress token. */
export type SettlementProgressReporter = (
  progress: number,
  total?: number,
  message?: string,
) => Promise<void>;

/**
 * Best-effort estimate of how many polls a wait window allows, used as the
 * `total` of the emitted progress notifications so clients can render a bar.
 */
export function estimateSettlementSteps(
  wait: boolean,
  timeoutMs: number,
  intervalMs: number,
): number {
  if (!wait) return 1;
  const interval = Math.max(intervalMs, MIN_SETTLEMENT_INTERVAL_MS);
  return Math.max(1, Math.ceil(timeoutMs / interval) + 1);
}

/** Human-readable text attached to a settlement progress notification. */
export function settlementProgressMessage(input: {
  attempt: number;
  status: string;
  settled: boolean;
  timedOut: boolean;
  wait: boolean;
}): string {
  const polls = `${input.attempt} poll${input.attempt === 1 ? "" : "s"}`;
  if (input.timedOut) {
    return `Timed out after ${polls} — transaction still ${input.status}.`;
  }
  if (input.settled) {
    return `Transaction ${input.status} (settled) after ${polls}.`;
  }
  if (!input.wait) {
    return `Transaction ${input.status} — single check, pass wait: true to poll.`;
  }
  return `Transaction ${input.status} — poll ${input.attempt}, still settling.`;
}

export type PollSettlementOptions = {
  txHash: string;
  wait: boolean;
  timeoutMs: number;
  intervalMs: number;
  /** One getTransaction round trip; throws for RPC/transport failures. */
  fetchTransaction: (txHash: string) => Promise<TransactionLookup>;
  onProgress?: SettlementProgressReporter;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  /** Abort the wait; `pollSettlement` returns a `cancelled` result promptly. */
  signal?: AbortSignal;
};

export type PollSettlementResult = {
  tx: TransactionLookup;
  attempts: number;
  timedOut: boolean;
  /** True when the caller aborted the wait before it settled or timed out. */
  cancelled: boolean;
};

/**
 * Fetch a transaction's status once, or poll until it settles when `wait` is
 * set, streaming a progress notification after every poll.
 *
 * The emitted `progress` value increments once per notification — never
 * repeating or decreasing, as MCP requires — and `total` grows if the poll
 * outlasts the initial estimate.
 */
export async function pollSettlement(opts: PollSettlementOptions): Promise<PollSettlementResult> {
  const now = opts.now ?? Date.now;
  const signal = opts.signal;
  const deadline = now() + (opts.wait ? opts.timeoutMs : 0);
  const isAborted = (): boolean => signal?.aborted === true;

  let total = estimateSettlementSteps(opts.wait, opts.timeoutMs, opts.intervalMs);
  let step = 0;
  let attempts = 0;
  let timedOut = false;

  const report = async (status: string, settled: boolean): Promise<void> => {
    step += 1;
    if (step > total) total = step;
    await opts.onProgress?.(
      step,
      total,
      settlementProgressMessage({ attempt: attempts, status, settled, timedOut, wait: opts.wait }),
    );
  };

  // A wait cancelled before the first lookup still reports the hash and an
  // honest "we have not seen it" status, rather than omitting both.
  if (opts.wait && isAborted()) {
    return {
      tx: { hash: opts.txHash, found: false, status: "UNKNOWN" },
      attempts: 0,
      timedOut: false,
      cancelled: true,
    };
  }

  // Always fetch at least once, even when not waiting.
  let tx = await opts.fetchTransaction(opts.txHash);
  attempts += 1;
  await report(tx.status, isTransactionSettled(tx.status));

  while (opts.wait) {
    if (isAborted()) return { tx, attempts, timedOut: false, cancelled: true };
    if (isTransactionSettled(tx.status)) break;
    if (now() >= deadline) {
      timedOut = true;
      await report(tx.status, false);
      break;
    }
    await sleepUntilNextPoll(opts.sleep, opts.intervalMs, deadline - now(), signal);
    if (isAborted()) return { tx, attempts, timedOut: false, cancelled: true };
    tx = await opts.fetchTransaction(opts.txHash);
    attempts += 1;
    const settled = isTransactionSettled(tx.status);
    if (!settled && now() >= deadline) timedOut = true;
    await report(tx.status, settled);
    if (settled || timedOut) break;
  }

  return { tx, attempts, timedOut, cancelled: false };
}

/**
 * Sleep until the next poll, but resolve early (without throwing) when the
 * caller aborts, so the caller can stop promptly during a long interval.
 */
function sleepUntilNextPoll(
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
  intervalMs: number,
  remainingMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const delay = Math.min(intervalMs, Math.max(0, remainingMs));
  if (!signal) return sleep(delay);
  if (signal.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => finish();
    signal.addEventListener("abort", onAbort, { once: true });
    void sleep(delay, signal).then(finish, finish);
  });
}
