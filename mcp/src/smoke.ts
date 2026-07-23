/**
 * MindVault MCP smoke-test orchestration.
 *
 * Transport-agnostic core: given a client that can call MCP tools, run an
 * ordered publish → preview → buy scenario and decide pass/fail. This module is
 * deliberately free of process, network, and subprocess imports so it stays
 * deterministic and unit-testable. The CLI runner in `scripts/smoke.ts` wires it
 * to a real MCP server over stdio (and, in mock mode, a local HTTP stub).
 */

/** A single content block from an MCP tool result. */
export interface ToolResultContent {
  type: string;
  text?: string;
}

/** The subset of an MCP `callTool` result the smoke test relies on. */
export interface ToolCallResult {
  content?: ToolResultContent[];
  isError?: boolean;
}

/** Minimal client contract — implemented by the real MCP SDK client and by test fakes. */
export interface SmokeToolClient {
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<ToolCallResult>;
}

/** Mutable state threaded through the scenario (e.g. the published resource id). */
export interface SmokeContext {
  resourceId?: string;
  [key: string]: unknown;
}

export interface SmokeStep {
  /** Human-readable label used in logs and the failure summary. */
  label: string;
  /** MCP tool to invoke. */
  tool: string;
  /** Static arguments, or a builder that reads state captured by earlier steps. */
  args?: Record<string, unknown> | ((ctx: SmokeContext) => Record<string, unknown>);
  /** Optional extractor to pull state (e.g. a resource id) out of the result text. */
  capture?: (text: string, ctx: SmokeContext) => void;
  /** Optional assertion on the (error-free) result text; a false return fails the step. */
  expect?: (text: string) => boolean;
  /** Message surfaced when `expect` returns false. */
  expectMessage?: string;
}

export type SmokeLogger = (line: string) => void;

export interface SmokeStepOutcome {
  label: string;
  tool: string;
  ok: boolean;
  text: string;
}

export interface SmokeReport {
  ok: boolean;
  steps: SmokeStepOutcome[];
  /** Label of the first failed step, present only when `ok` is false. */
  failedStep?: string;
}

/** Flatten an MCP tool result's text content into a single trimmed string. */
export function resultText(res: ToolCallResult): string {
  return (res.content ?? [])
    .map((c) => (typeof c.text === "string" ? c.text : ""))
    .join("\n")
    .trim();
}

/**
 * A tool call failed if the server flagged `isError`, or if the result text
 * carries the server's "Error:" marker. The MindVault MCP server sets both on a
 * handler throw, but checking the text too keeps this robust if a transport
 * drops the flag.
 */
export function isToolError(res: ToolCallResult): boolean {
  if (res.isError) return true;
  return /^Error:/m.test(resultText(res));
}

/** Extract the resource id printed by `mindvault_publish` ("ID: <id>"). */
export function parseResourceId(text: string): string | null {
  const match = text.match(/^ID:\s*(\S+)/m);
  return match ? match[1] : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function requireResourceId(ctx: SmokeContext): string {
  if (!ctx.resourceId) {
    throw new Error("no resource id was captured from mindvault_publish");
  }
  return ctx.resourceId;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

/**
 * Run the smoke scenario. Stops at the first failing step and returns a report
 * whose `ok` flag the CLI maps to the process exit code. All failures produce a
 * deterministic, secret-free message safe for agent-facing output.
 */
export async function runSmoke(
  client: SmokeToolClient,
  steps: SmokeStep[],
  log: SmokeLogger = () => {},
): Promise<SmokeReport> {
  const ctx: SmokeContext = {};
  const outcomes: SmokeStepOutcome[] = [];

  const fail = (label: string, tool: string, text: string): SmokeReport => {
    outcomes.push({ label, tool, ok: false, text });
    log(indent(text));
    log(`✗ ${label}`);
    return { ok: false, steps: outcomes, failedStep: label };
  };

  for (const step of steps) {
    log(`▶ ${step.label} (${step.tool})`);

    let res: ToolCallResult;
    try {
      const args = typeof step.args === "function" ? step.args(ctx) : (step.args ?? {});
      res = await client.callTool({ name: step.tool, arguments: args });
    } catch (err) {
      return fail(
        step.label,
        step.tool,
        `Error: could not call ${step.tool}: ${errorMessage(err)}`,
      );
    }

    const text = resultText(res);

    if (isToolError(res)) {
      return fail(step.label, step.tool, text || `Error: ${step.tool} returned an error`);
    }
    if (step.expect && !step.expect(text)) {
      const msg = step.expectMessage ?? `Unexpected result from ${step.tool}`;
      return fail(step.label, step.tool, `${msg}\n${text}`);
    }

    try {
      step.capture?.(text, ctx);
    } catch (err) {
      return fail(step.label, step.tool, `Error: ${errorMessage(err)}`);
    }

    outcomes.push({ label: step.label, tool: step.tool, ok: true, text });
    log(indent(text));
    log(`✓ ${step.label}`);
  }

  return { ok: true, steps: outcomes };
}

/** Inputs for the published test resource. Overridable for testnet runs. */
export interface SmokeScenario {
  publisherName: string;
  publisherEmail: string;
  title: string;
  description: string;
  price: string;
  externalUrl: string;
}

export const DEFAULT_SCENARIO: SmokeScenario = {
  publisherName: "MindVault Smoke Test",
  publisherEmail: "smoke@mindvault.test",
  title: "Smoke Test Resource",
  description: "Ephemeral resource created by the MCP smoke test.",
  price: "0.10",
  externalUrl: "https://example.com/mindvault-smoke",
};

/**
 * Build the ordered scenario: create a wallet, register as a publisher, publish
 * a resource, preview it, then buy it. Preview and buy consume the resource id
 * captured from the publish step.
 */
export function buildSmokeSteps(scenario: SmokeScenario = DEFAULT_SCENARIO): SmokeStep[] {
  return [
    { label: "Set up wallet", tool: "mindvault_setup_wallet" },
    {
      label: "Register publisher",
      tool: "mindvault_register",
      args: { name: scenario.publisherName, email: scenario.publisherEmail },
    },
    {
      label: "Publish resource",
      tool: "mindvault_publish",
      args: {
        title: scenario.title,
        description: scenario.description,
        price: scenario.price,
        externalUrl: scenario.externalUrl,
      },
      expect: (text) => /Resource published\./.test(text),
      expectMessage:
        "Publish did not complete (resource was not verified/registered). Ensure the wallet is funded when targeting testnet.",
      capture: (text, ctx) => {
        ctx.resourceId = parseResourceId(text) ?? undefined;
      },
    },
    {
      label: "Preview resource",
      tool: "mindvault_preview",
      args: (ctx) => ({ resourceId: requireResourceId(ctx) }),
    },
    {
      label: "Buy resource",
      tool: "mindvault_buy",
      args: (ctx) => ({ resourceId: requireResourceId(ctx) }),
    },
  ];
}
