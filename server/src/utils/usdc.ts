const USDC_DECIMALS = 7;
const USDC_SCALE = BigInt(10 ** USDC_DECIMALS);

/**
 * Converts a USDC decimal string (e.g. "0.50") to an i128 integer with 7 decimal places.
 * Throws if the input has more than 7 decimal places or is not a valid number.
 */
export function usdcToStroops(amount: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`Invalid USDC amount: "${amount}"`);
  }

  const [whole = "0", fraction = ""] = amount.split(".");

  if (fraction.length > USDC_DECIMALS) {
    throw new Error(
      `Too many decimal places in "${amount}": max ${USDC_DECIMALS}`
    );
  }

  const paddedFraction = fraction.padEnd(USDC_DECIMALS, "0");
  return BigInt(whole) * USDC_SCALE + BigInt(paddedFraction);
}

/**
 * Converts an i128 stroops integer back to a USDC decimal string (e.g. "0.5000000").
 * Trailing zeros in the fractional part are preserved to 7 places then trimmed.
 */
export function stroopsToUsdc(stroops: bigint): string {
  if (stroops < 0n) {
    throw new Error("stroops must be non-negative");
  }

  const whole = stroops / USDC_SCALE;
  const fraction = stroops % USDC_SCALE;

  const fractionStr = fraction.toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");

  return fractionStr.length > 0
    ? `${whole}.${fractionStr}`
    : `${whole}`;
}
