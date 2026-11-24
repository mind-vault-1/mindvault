import { isTruthyConfirm } from "./mainnetGuardrails.js";
import { TOOL_SIDE_EFFECTS } from "./toolSideEffects.js";

export const DESTRUCTIVE_CONFIRMATION_ENV_VAR = "MINDVAULT_CONFIRM_DESTRUCTIVE_OPERATIONS";

export const DESTRUCTIVE_CONFIRMATION_ARG = "confirmDestructive";

export type DestructiveConfirmationPolicy = "off" | "local" | "chain" | "all";

export const DEFAULT_DESTRUCTIVE_CONFIRMATION_POLICY: DestructiveConfirmationPolicy = "off";

const POLICIES: readonly DestructiveConfirmationPolicy[] = ["off", "local", "chain", "all"];

export type DestructiveOperationClass = "local" | "chain";

export function destructiveOperationClass(toolName: string): DestructiveOperationClass | null {
  const effects = TOOL_SIDE_EFFECTS[toolName];
  if (!effects) return null;
  if (effects.local === "overwrite") return "local";
  if (effects.irreversible === true) return "chain";
  return null;
}

export function destructiveOperationToolNames(): string[] {
  return Object.keys(TOOL_SIDE_EFFECTS)
    .filter((name) => destructiveOperationClass(name) !== null)
    .sort();
}

export function resolveDestructiveConfirmationPolicy(
  env: NodeJS.ProcessEnv = process.env,
): DestructiveConfirmationPolicy {
  const raw = env[DESTRUCTIVE_CONFIRMATION_ENV_VAR];
  if (raw == null || raw.trim() === "") return DEFAULT_DESTRUCTIVE_CONFIRMATION_POLICY;

  const value = raw.trim().toLowerCase();
  if ((POLICIES as readonly string[]).includes(value))
    return value as DestructiveConfirmationPolicy;

  throw new Error(
    `${DESTRUCTIVE_CONFIRMATION_ENV_VAR} must be one of: ${POLICIES.join(", ")}. ` +
      `Received "${raw}". Unset the variable to use the default (${DEFAULT_DESTRUCTIVE_CONFIRMATION_POLICY}).`,
  );
}

export function requiresDestructiveConfirmation(
  toolName: string,
  policy: DestructiveConfirmationPolicy,
): boolean {
  const operation = destructiveOperationClass(toolName);
  if (operation === null || policy === "off") return false;
  if (policy === "all") return true;
  return operation === policy;
}

export function destructiveConfirmationRequiredError(
  toolName: string,
  policy: DestructiveConfirmationPolicy,
): Error {
  const operation = destructiveOperationClass(toolName) ?? "local";
  const effect =
    operation === "local"
      ? "replaces or deletes local wallet, profile, or state data"
      : "submits a permanent on-chain change";
  return new Error(
    [
      `Destructive-operation guardrail: "${toolName}" requires explicit confirmation because this server runs with ${DESTRUCTIVE_CONFIRMATION_ENV_VAR}=${policy}.`,
      `This tool ${effect}.`,
      `To proceed, pass ${DESTRUCTIVE_CONFIRMATION_ARG}: true on this tool call.`,
      `To stop requiring it, restart the server with ${DESTRUCTIVE_CONFIRMATION_ENV_VAR}=off.`,
      "Read-only tools are never gated.",
    ].join(" "),
  );
}

export function assertDestructiveOperationConfirmed(input: {
  toolName: string;
  args: Record<string, unknown> | undefined;
  env?: NodeJS.ProcessEnv;
}): void {
  const policy = resolveDestructiveConfirmationPolicy(input.env ?? process.env);
  if (!requiresDestructiveConfirmation(input.toolName, policy)) return;
  if (isTruthyConfirm(input.args?.[DESTRUCTIVE_CONFIRMATION_ARG])) return;
  throw destructiveConfirmationRequiredError(input.toolName, policy);
}

export function formatDestructiveConfirmationDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
): string {
  let policy: DestructiveConfirmationPolicy;
  try {
    policy = resolveDestructiveConfirmationPolicy(env);
  } catch (err) {
    return `Destructive-operation confirmation: misconfigured — ${(err as Error).message}`;
  }

  switch (policy) {
    case "off":
      return `Destructive-operation confirmation: off — set ${DESTRUCTIVE_CONFIRMATION_ENV_VAR}=all to require ${DESTRUCTIVE_CONFIRMATION_ARG} on destructive tools`;
    case "local":
      return `Destructive-operation confirmation: local data replacement requires ${DESTRUCTIVE_CONFIRMATION_ARG}: true`;
    case "chain":
      return `Destructive-operation confirmation: permanent on-chain changes require ${DESTRUCTIVE_CONFIRMATION_ARG}: true`;
    case "all":
      return `Destructive-operation confirmation: every destructive tool requires ${DESTRUCTIVE_CONFIRMATION_ARG}: true (${destructiveOperationToolNames().join(", ")})`;
  }
}
