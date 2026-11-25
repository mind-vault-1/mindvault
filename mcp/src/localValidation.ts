/**
 * Local-only validation mode for the MindVault MCP server (#1249).
 *
 * Operators can set MINDVAULT_LOCAL_VALIDATION=1 to check a tool call without
 * contacting the MindVault API, Horizon, Soroban RPC, or the sponsored-wallet
 * service. Every tool call is answered locally with a structured report of the
 * argument and configuration findings; no handler runs and no request leaves
 * the process.
 *
 * This module is pure: it reads only the environment passed to it, performs no
 * I/O, never throws, and never exits. All outbound behaviour is prevented by
 * the dispatcher short-circuit in index.ts, not by this module alone.
 */

import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { JsonSchemaType } from "@modelcontextprotocol/sdk/validation";
import { buildConfig } from "./config.js";
import { collectStartupDiagnostics, type StartupDiagnostic } from "./diagnostics.js";
import type { ToolOutcome } from "./toolResult.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import {
  TOOLS_WITHOUT_ARG_VALIDATION,
  ToolValidationError,
  UnknownToolError,
  validateToolArgs,
  type ValidationIssue,
  type ValidationIssueCode,
} from "./validation.js";

/** Environment variable that enables local-only validation. */
export const LOCAL_VALIDATION_ENV_VAR = "MINDVAULT_LOCAL_VALIDATION";

/** Accepted opt-in spellings, matching MINDVAULT_MOCK and MINDVAULT_READ_ONLY. */
export const LOCAL_VALIDATION_TRUE_VALUES = ["1", "true", "yes", "on"] as const;

const TRUE_VALUES = new Set<string>(LOCAL_VALIDATION_TRUE_VALUES);

/** True when local-only validation is enabled for the given environment. */
export function localValidationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.MINDVAULT_LOCAL_VALIDATION;
  return typeof value === "string" && TRUE_VALUES.has(value.trim().toLowerCase());
}

/** A diagnostic with an explicit `expected` cell, so the payload stays JSON-shaped. */
export interface LocalValidationDiagnostic {
  variable: string;
  severity: "error" | "warning";
  message: string;
  expected: string | null;
}

/**
 * Structured result returned by every tool while local-only validation is on.
 * `schema` is the discriminator clients branch on.
 */
export interface LocalValidationReport {
  schema: "mindvault.local-validation/v1";
  mode: "local-only";
  ok: boolean;
  noOutbound: true;
  tool: string;
  arguments: {
    status: "pass" | "fail";
    issues: ValidationIssue[];
  };
  configuration: {
    status: "pass" | "warn" | "fail";
    diagnostics: LocalValidationDiagnostic[];
    resolved: {
      stellarNetwork: string;
      x402Network: string;
      registryContractIdConfigured: boolean;
    };
  };
  limitations: readonly string[];
}

const LIMITATIONS = [
  "No MindVault API, Horizon, Soroban RPC, x402, sponsored-wallet, or other outbound request was made.",
  "No wallet signature, payment challenge, or on-chain state was verified.",
  "Configuration checks are static; endpoint reachability and credentials are not tested.",
  "Argument checks cover advertised input schemas and the shared argument specs only, not service-side semantics.",
  "No state, receipt, profile, or wallet file was read or written by this call.",
] as const;

/** Output schema advertised for the local validation payload. */
export const LOCAL_VALIDATION_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    schema: { type: "string", const: "mindvault.local-validation/v1" },
    mode: { type: "string", const: "local-only" },
    ok: { type: "boolean" },
    noOutbound: { type: "boolean", const: true },
    tool: { type: "string" },
    arguments: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pass", "fail"] },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["field", "code", "message"],
          },
        },
      },
      required: ["status", "issues"],
    },
    configuration: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pass", "warn", "fail"] },
        diagnostics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              variable: { type: "string" },
              severity: { type: "string", enum: ["error", "warning"] },
              message: { type: "string" },
              expected: { type: ["string", "null"] },
            },
            required: ["variable", "severity", "message", "expected"],
          },
        },
        resolved: {
          type: "object",
          properties: {
            stellarNetwork: { type: "string" },
            x402Network: { type: "string" },
            registryContractIdConfigured: { type: "boolean" },
          },
          required: ["stellarNetwork", "x402Network", "registryContractIdConfigured"],
        },
      },
      required: ["status", "diagnostics", "resolved"],
    },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: [
    "schema",
    "mode",
    "ok",
    "noOutbound",
    "tool",
    "arguments",
    "configuration",
    "limitations",
  ],
} as const;

const inputSchemaProvider = new AjvJsonSchemaValidator();

function localIssue(field: string, code: ValidationIssueCode, message: string): ValidationIssue {
  return { field, code, message };
}

/**
 * Validate arguments without running a tool. Tools with a shared spec go
 * through the same validator used by live calls; the self-validating tools
 * are checked against their advertised JSON input schema instead.
 */
export function validateLocalArguments(tool: string, args: unknown): ValidationIssue[] {
  try {
    if (TOOLS_WITHOUT_ARG_VALIDATION.includes(tool)) {
      const definition = TOOL_DEFINITIONS.find((entry) => entry.name === tool);
      if (!definition) throw new UnknownToolError(tool);
      const validate = inputSchemaProvider.getValidator(definition.inputSchema as JsonSchemaType);
      const result = validate(args ?? {});
      return result.valid
        ? []
        : [localIssue("arguments", "wrong_type", result.errorMessage ?? "invalid")];
    }
    validateToolArgs(tool, args);
    return [];
  } catch (error) {
    if (error instanceof ToolValidationError) return error.issues;
    if (error instanceof UnknownToolError) {
      return [localIssue("tool", "unknown_argument", error.message)];
    }
    return [localIssue("arguments", "wrong_type", "Arguments could not be validated.")];
  }
}

function toLocalDiagnostic(diagnostic: StartupDiagnostic): LocalValidationDiagnostic {
  return {
    variable: diagnostic.variable,
    severity: diagnostic.severity,
    message: diagnostic.message,
    expected: diagnostic.expected ?? null,
  };
}

/**
 * Build the local-only report for one tool call. Pure and total: it never
 * performs I/O, throws, exits, or touches process.env.
 */
export function runLocalValidation(options: {
  env: NodeJS.ProcessEnv;
  tool: string;
  args: unknown;
}): LocalValidationReport {
  const { env, tool, args } = options;
  const argumentIssues = validateLocalArguments(tool, args);

  // A missing global fetch is only a startup error for live mode; local-only
  // mode deliberately makes no requests, so pass the check as satisfied.
  const diagnostics = collectStartupDiagnostics(env, true).map(toLocalDiagnostic);
  const configurationStatus: LocalValidationReport["configuration"]["status"] = diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  )
    ? "fail"
    : diagnostics.length > 0
      ? "warn"
      : "pass";

  const config = buildConfig(env);

  return {
    schema: "mindvault.local-validation/v1",
    mode: "local-only",
    ok: argumentIssues.length === 0 && configurationStatus !== "fail",
    noOutbound: true,
    tool,
    arguments: {
      status: argumentIssues.length === 0 ? "pass" : "fail",
      issues: argumentIssues,
    },
    configuration: {
      status: configurationStatus,
      diagnostics,
      resolved: {
        stellarNetwork: config.stellarNetwork,
        x402Network: config.x402Network,
        registryContractIdConfigured: config.registryContractId.length > 0,
      },
    },
    limitations: LIMITATIONS,
  };
}

/** Tool outcome carrying the report as both readable text and structured data. */
export function localValidationOutcome(
  tool: string,
  args: unknown,
  env: NodeJS.ProcessEnv,
): ToolOutcome {
  const report = runLocalValidation({ env, tool, args });
  return {
    text: JSON.stringify(report, null, 2),
    structured: report as unknown as Record<string, unknown>,
  };
}
