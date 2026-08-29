/**
 * Structured audit logging for MindVault MCP server.
 *
 * Logs tool calls, network requests, duration, status, and tx hashes with
 * automatic secret redaction for API keys, secret keys, payment headers, and
 * authorization payloads. Respects MINDVAULT_AUDIT_LOG env var.
 */

import { redactSecrets, redactObject } from "./redaction.js";

export interface AuditLogEntry {
  timestamp: string;
  toolName: string;
  status: "start" | "success" | "error";
  duration?: number;
  resourceId?: string;
  network?: string;
  txHash?: string;
  httpStatus?: number;
  errorCategory?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface NetworkAuditLog {
  timestamp: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  status: number;
  duration: number;
  source: "api" | "x402" | "horizon" | "soroban" | "registry" | "sponsored";
  txHash?: string;
  errorSummary?: string;
  requestPayload?: unknown;
}

/** Global audit log configuration. */
let auditLogEnabled = false;

/**
 * Initialize audit logging from environment.
 * MINDVAULT_AUDIT_LOG=1 enables it.
 * Logs are sent to stderr as JSON for easy parsing.
 */
export function initAuditLogging(env: NodeJS.ProcessEnv): void {
  auditLogEnabled = env.MINDVAULT_AUDIT_LOG === "1";
}

/**
 * Check if audit logging is enabled.
 */
export function isAuditLogEnabled(): boolean {
  return auditLogEnabled;
}

/**
 * Enable/disable audit logging (for testing).
 */
export function setAuditLogEnabled(enabled: boolean): void {
  auditLogEnabled = enabled;
}

/**
 * Format a timestamp in ISO-8601 format with milliseconds.
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Log a tool call start.
 */
export function logToolStart(toolName: string, args?: Record<string, unknown>): void {
  if (!auditLogEnabled) return;

  const entry: AuditLogEntry = {
    timestamp: formatTimestamp(),
    toolName,
    status: "start",
  };

  if (args) {
    entry.details = redactObject(args);
  }

  console.error(JSON.stringify(entry, null, 2));
}

/**
 * Log a successful tool execution.
 */
export function logToolSuccess(
  toolName: string,
  durationMs: number,
  data?: {
    resourceId?: string;
    txHash?: string;
    network?: string;
    message?: string;
  },
): void {
  if (!auditLogEnabled) return;

  const entry: AuditLogEntry = {
    timestamp: formatTimestamp(),
    toolName,
    status: "success",
    duration: durationMs,
  };

  if (data) {
    if (data.resourceId) entry.resourceId = data.resourceId;
    if (data.txHash) entry.txHash = data.txHash;
    if (data.network) entry.network = data.network;
    if (data.message) entry.message = data.message;
  }

  console.error(JSON.stringify(entry, null, 2));
}

/**
 * Log a failed tool execution.
 */
export function logToolError(
  toolName: string,
  durationMs: number,
  error: unknown,
  context?: {
    resourceId?: string;
    errorCategory?: string;
    httpStatus?: number;
  },
): void {
  if (!auditLogEnabled) return;

  const message =
    error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error));

  const entry: AuditLogEntry = {
    timestamp: formatTimestamp(),
    toolName,
    status: "error",
    duration: durationMs,
    message,
  };

  if (context) {
    if (context.resourceId) entry.resourceId = context.resourceId;
    if (context.errorCategory) entry.errorCategory = context.errorCategory;
    if (context.httpStatus) entry.httpStatus = context.httpStatus;
  }

  console.error(JSON.stringify(entry, null, 2));
}

/**
 * Log a network request (HTTP, x402, Horizon, Soroban RPC, registry).
 */
export function logNetworkRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  source: "api" | "x402" | "horizon" | "soroban" | "registry" | "sponsored",
  status: number,
  durationMs: number,
  context?: {
    txHash?: string;
    errorSummary?: string;
    requestPayload?: unknown;
  },
): void {
  if (!auditLogEnabled) return;

  const entry: NetworkAuditLog = {
    timestamp: formatTimestamp(),
    method,
    endpoint: redactSecrets(endpoint),
    status,
    duration: durationMs,
    source,
  };

  if (context) {
    if (context.txHash) entry.txHash = context.txHash;
    if (context.errorSummary) entry.errorSummary = redactSecrets(context.errorSummary);
    if (context.requestPayload !== undefined) {
      entry.requestPayload = redactObject(context.requestPayload);
    }
  }

  console.error(JSON.stringify(entry, null, 2));
}

/**
 * Log payment initiation (x402).
 */
export function logPaymentInitiation(
  resourceId: string,
  estimatedAmount: string,
  network: string,
): void {
  if (!auditLogEnabled) return;

  const entry: AuditLogEntry = {
    timestamp: formatTimestamp(),
    toolName: "x402-payment",
    status: "start",
    resourceId,
    network,
    message: `Initiating payment: ${estimatedAmount} USDC`,
  };

  console.error(JSON.stringify(entry, null, 2));
}

/**
 * Log payment completion.
 */
export function logPaymentSuccess(
  resourceId: string,
  actualAmount: string,
  txHash: string | null,
  durationMs: number,
): void {
  if (!auditLogEnabled) return;

  const entry: AuditLogEntry = {
    timestamp: formatTimestamp(),
    toolName: "x402-payment",
    status: "success",
    resourceId,
    duration: durationMs,
    message: `Payment completed: ${actualAmount} USDC`,
  };

  if (txHash) {
    entry.txHash = txHash;
  }

  console.error(JSON.stringify(entry, null, 2));
}

/**
 * Log payment failure.
 */
export function logPaymentError(
  resourceId: string,
  error: unknown,
  status: number,
  durationMs: number,
): void {
  if (!auditLogEnabled) return;

  const message =
    error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error));

  const entry: AuditLogEntry = {
    timestamp: formatTimestamp(),
    toolName: "x402-payment",
    status: "error",
    resourceId,
    duration: durationMs,
    httpStatus: status,
    message,
  };

  console.error(JSON.stringify(entry, null, 2));
}

/**
 * Log on-chain transaction submission.
 */
export function logOnchainTransaction(
  operation: string,
  resourceId: string,
  txHash: string | null,
  durationMs: number,
  success: boolean,
): void {
  if (!auditLogEnabled) return;

  const entry: AuditLogEntry = {
    timestamp: formatTimestamp(),
    toolName: `onchain-${operation}`,
    status: success ? "success" : "error",
    resourceId,
    duration: durationMs,
  };

  if (txHash) {
    entry.txHash = txHash;
  }

  console.error(JSON.stringify(entry, null, 2));
}

/**
 * Log wallet operations.
 */
export function logWalletOperation(
  operation: "setup" | "info" | "reset",
  success: boolean,
  durationMs: number,
  message?: string,
): void {
  if (!auditLogEnabled) return;

  const entry: AuditLogEntry = {
    timestamp: formatTimestamp(),
    toolName: `wallet-${operation}`,
    status: success ? "success" : "error",
    duration: durationMs,
  };

  if (message) {
    entry.message = redactSecrets(message);
  }

  console.error(JSON.stringify(entry, null, 2));
}
