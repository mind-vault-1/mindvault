/**
 * Shared response truncation for MindVault MCP tool outputs.
 *
 * Tool handlers build a single text string with no size ceiling, so one long
 * description or a large registry listing can dominate an agent's context window.
 * This module provides a configurable byte budget with safe truncation.
 */

/** Default max bytes for tool responses (32 KiB). */
export const DEFAULT_RESPONSE_BUDGET_BYTES = 32 * 1024;

const TRUNCATION_NOTICE =
  "\n\n[Truncated — response exceeded budget. Use limit/offset pagination or narrow your query to get smaller results.]";

/**
 * Truncate a text response to fit within a byte budget.
 *
 * - Never splits a multi-byte UTF-8 character (uses TextEncoder/TextDecoder).
 * - Appends a clear truncation notice explaining how to fetch the rest.
 * - Returns the original text when it already fits.
 *
 * @param text    The full response text.
 * @param maxBytes  Maximum byte budget (default 32 KiB).
 * @returns The (possibly truncated) response.
 */
export function truncateResponse(
  text: string,
  maxBytes: number = DEFAULT_RESPONSE_BUDGET_BYTES,
): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);

  if (encoded.length <= maxBytes) {
    return text;
  }

  // Reserve space for the truncation notice
  const noticeBytes = encoder.encode(TRUNCATION_NOTICE);
  const targetBytes = maxBytes - noticeBytes.length;

  if (targetBytes <= 0) {
    return TRUNCATION_NOTICE.trim();
  }

  // Find a safe cut point — we need to avoid splitting multi-byte chars.
  // TextEncoder gives us UTF-8 bytes; we decode up to targetBytes.
  // We use a binary-search-like approach: decode an increasingly smaller
  // slice until it succeeds without replacement characters.
  let cutLength = targetBytes;
  const decoder = new TextDecoder("utf-8", { fatal: false });

  // Start from targetBytes and work backwards if we land mid-character.
  // A simpler approach: just slice the Uint8Array and decode — TextDecoder
  // with fatal:false will handle partial chars by replacing them, but we
  // want clean truncation. Use fatal:true to detect the boundary.
  const strictDecoder = new TextDecoder("utf-8", { fatal: true });

  while (cutLength > 0) {
    try {
      strictDecoder.decode(encoded.slice(0, cutLength));
      break; // Valid UTF-8 at this boundary
    } catch {
      cutLength--;
    }
  }

  if (cutLength <= 0) {
    return TRUNCATION_NOTICE.trim();
  }

  const truncated = decoder.decode(encoded.slice(0, cutLength));
  return truncated + TRUNCATION_NOTICE;
}
