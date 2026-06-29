import OpenAI from "openai";
import { config } from "../config.js";

const OpenAIClient = (OpenAI as any).default || OpenAI;

const client = new OpenAIClient({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: config.OPENROUTER_API_KEY,
});

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // Estimated spend for this call in USD, derived from the configured per-token
  // pricing for the active OpenRouter model (#283).
  estimatedCostUsd: number;
}

export interface VerificationResult {
  isOriginal: boolean;
  confidence: number;
  flags: string[];
  usage: TokenUsage;
}

const ZERO_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
};

/** Estimate the USD cost of a verification from its prompt/completion tokens. */
export function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const cost =
    (promptTokens / 1_000_000) * config.VERIFICATION_PROMPT_COST_PER_1M +
    (completionTokens / 1_000_000) * config.VERIFICATION_COMPLETION_COST_PER_1M;
  // Avoid noisy floating point tails; sub-cent precision is plenty here.
  return Number(cost.toFixed(8));
}

function toUsage(
  raw: { prompt_tokens?: number; completion_tokens?: number } | undefined,
): TokenUsage {
  const promptTokens = raw?.prompt_tokens ?? 0;
  const completionTokens = raw?.completion_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens),
  };
}

export async function checkOriginality(
  content: string,
  resourceType: string,
): Promise<VerificationResult> {
  const response = await client.chat.completions.create({
    model: config.OPENROUTER_MODEL,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a content verification agent for a digital marketplace called MindVault. Your job is to verify that submitted content metadata (title, description, and resource reference) represents a legitimate digital resource that a creator would sell.

You are NOT judging the full content — you are reviewing the listing metadata to determine if this appears to be a genuine resource listing.

A resource should be APPROVED if:
- The title and description describe a real digital resource (dataset, code, article, API, prompt, etc.)
- The description shows effort and describes what the buyer gets
- It appears to be a legitimate listing, even if brief

A resource should be REJECTED only if:
- It is clearly spam, gibberish, or meaningless
- It is an obvious test/placeholder with no real intent to sell (e.g. "test123", "asdf")
- It appears to be copied verbatim from a well-known source without attribution

Be lenient — real creators often write short descriptions. Brief is fine. Low effort is fine. Only reject clearly bad listings.

Respond with valid JSON: { "is_original": boolean, "confidence": number (0-1), "flags": string[] }
The flags should be human-readable sentences explaining your reasoning.`,
      },
      {
        role: "user",
        content: `Review this ${resourceType} resource listing:
---
${content.slice(0, 10000)}
---

Respond with JSON only.`,
      },
    ],
  });

  const usage = toUsage(response.usage);

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    return {
      isOriginal: false,
      confidence: 0,
      flags: ["No response from verification model"],
      usage,
    };
  }

  try {
    // Handle responses wrapped in markdown code blocks
    const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned);
    return {
      isOriginal: Boolean(parsed.is_original),
      confidence: Number(parsed.confidence) || 0,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      usage,
    };
  } catch {
    return {
      isOriginal: false,
      confidence: 0,
      flags: ["Failed to parse verification response"],
      usage,
    };
  }
}

export { ZERO_USAGE };
