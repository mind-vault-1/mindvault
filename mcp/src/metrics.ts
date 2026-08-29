/**
 * Optional tool-level metrics for the MindVault MCP server.
 *
 * Opt-in via the MINDVAULT_METRICS env var. When disabled a no-op recorder is
 * used, so there is no bookkeeping and no output. Metrics only ever contain tool
 * names, counts, and durations — never arguments, wallets, or API keys — so a
 * snapshot is always safe to surface to an agent. This module is pure and
 * side-effect free (no I/O, no globals beyond `performance.now`) for
 * deterministic testing.
 */

/** Per-tool counters. Durations are milliseconds. */
export interface ToolMetric {
  calls: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
  budgetExceeded: number;
}

export interface MetricsSnapshot {
  enabled: boolean;
  /** ISO timestamp of when collection (re)started, or null when disabled. */
  since: string | null;
  toolDurationBudgetMs: number | null;
  totals: { calls: number; errors: number; budgetExceeded: number };
  payments: { attempts: number; failures: number };
  tools: Record<string, ToolMetric>;
}

export interface MetricsRecorder {
  readonly enabled: boolean;
  readonly toolDurationBudgetMs: number;
  recordToolCall(tool: string, durationMs: number, ok: boolean): void;
  recordPayment(ok: boolean): void;
  snapshot(): MetricsSnapshot;
  reset(): void;
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/** Metrics are opt-in: enabled only when MINDVAULT_METRICS is a truthy string. */
export function metricsEnabledFromEnv(env: NodeJS.ProcessEnv): boolean {
  const raw = env.MINDVAULT_METRICS;
  return typeof raw === "string" && TRUTHY.has(raw.trim().toLowerCase());
}

export const TOOL_DURATION_BUDGET_ENV_VAR = "MINDVAULT_TOOL_DURATION_BUDGET_MS";
export const DEFAULT_TOOL_DURATION_BUDGET_MS = 30000;

export function resolveToolDurationBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[TOOL_DURATION_BUDGET_ENV_VAR];
  if (!raw || raw.trim() === "") return DEFAULT_TOOL_DURATION_BUDGET_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TOOL_DURATION_BUDGET_MS;
  return Math.floor(parsed);
}

function emptyToolMetric(): ToolMetric {
  return { calls: 0, errors: 0, totalDurationMs: 0, maxDurationMs: 0, budgetExceeded: 0 };
}

/** Disabled recorder — zero overhead, always reports an empty, disabled snapshot. */
class NoopMetricsRecorder implements MetricsRecorder {
  readonly enabled = false;
  readonly toolDurationBudgetMs = 0;
  recordToolCall(): void {}
  recordPayment(): void {}
  reset(): void {}
  snapshot(): MetricsSnapshot {
    return {
      enabled: false,
      since: null,
      toolDurationBudgetMs: null,
      totals: { calls: 0, errors: 0, budgetExceeded: 0 },
      payments: { attempts: 0, failures: 0 },
      tools: {},
    };
  }
}

class ActiveMetricsRecorder implements MetricsRecorder {
  readonly enabled = true;
  readonly toolDurationBudgetMs: number;
  private since = new Date();
  private tools = new Map<string, ToolMetric>();
  private payments = { attempts: 0, failures: 0 };

  constructor(budgetMs: number) {
    this.toolDurationBudgetMs = budgetMs;
  }

  recordToolCall(tool: string, durationMs: number, ok: boolean): void {
    const metric = this.tools.get(tool) ?? emptyToolMetric();
    metric.calls += 1;
    if (!ok) metric.errors += 1;
    const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
    metric.totalDurationMs += duration;
    metric.maxDurationMs = Math.max(metric.maxDurationMs, duration);
    if (duration > this.toolDurationBudgetMs) metric.budgetExceeded += 1;
    this.tools.set(tool, metric);
  }

  recordPayment(ok: boolean): void {
    this.payments.attempts += 1;
    if (!ok) this.payments.failures += 1;
  }

  reset(): void {
    this.since = new Date();
    this.tools.clear();
    this.payments = { attempts: 0, failures: 0 };
  }

  snapshot(): MetricsSnapshot {
    const tools: Record<string, ToolMetric> = {};
    let calls = 0;
    let errors = 0;
    let budgetExceeded = 0;
    for (const [name, metric] of this.tools) {
      tools[name] = { ...metric };
      calls += metric.calls;
      errors += metric.errors;
      budgetExceeded += metric.budgetExceeded;
    }
    return {
      enabled: true,
      since: this.since.toISOString(),
      toolDurationBudgetMs: this.toolDurationBudgetMs,
      totals: { calls, errors, budgetExceeded },
      payments: { ...this.payments },
      tools,
    };
  }
}

export function createMetricsRecorder(enabled: boolean, budgetMs: number): MetricsRecorder {
  return enabled ? new ActiveMetricsRecorder(budgetMs) : new NoopMetricsRecorder();
}

/**
 * Run a tool handler while recording its call count, error count, and duration.
 * Errors are re-thrown unchanged so the caller's existing error handling (and
 * the deterministic `Error: …` response shape) is preserved.
 */
export async function measureTool<T>(
  recorder: MetricsRecorder,
  tool: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    recorder.recordToolCall(tool, performance.now() - start, true);
    return result;
  } catch (err) {
    recorder.recordToolCall(tool, performance.now() - start, false);
    throw err;
  }
}
