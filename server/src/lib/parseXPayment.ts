/**
 * Parses an X-Payment header value and extracts the payer address.
 *
 * Supports all known x402 payload shapes:
 *  - EVM (exact scheme): payload.authorization.from  (EIP-3009 standard)
 *  - Legacy Stellar:     payload.authorization.address
 *  - Legacy top-level:   clientAddress
 *
 * @returns payer address string, or undefined if none found or header is invalid
 */
export function parsePayerFromXPayment(header: string): {
  payer: string | undefined;
  parseError: string | undefined;
} {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch (err) {
    return {
      payer: undefined,
      parseError: `Failed to decode X-Payment header: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { payer: undefined, parseError: "X-Payment decoded value is not an object" };
  }

  const d = decoded as Record<string, unknown>;

  // EVM exact scheme: payload.authorization.from (EIP-3009)
  const authFrom = (d.payload as Record<string, unknown> | undefined)?.authorization;
  if (authFrom && typeof authFrom === "object") {
    const auth = authFrom as Record<string, unknown>;
    if (typeof auth.from === "string" && auth.from) {
      return { payer: auth.from, parseError: undefined };
    }
    // Legacy Stellar: payload.authorization.address
    if (typeof auth.address === "string" && auth.address) {
      return { payer: auth.address, parseError: undefined };
    }
  }

  // Legacy top-level clientAddress
  if (typeof d.clientAddress === "string" && d.clientAddress) {
    return { payer: d.clientAddress, parseError: undefined };
  }

  return { payer: undefined, parseError: undefined };
}
