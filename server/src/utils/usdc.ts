const USDC_DECIMALS = 7n;
const USDC_STROOP_SCALE = 10n ** USDC_DECIMALS;

export const USDC_STROOP_DECIMALS = Number(USDC_DECIMALS);

export function usdcToStroops(amount: string): bigint {
  const trimmed = amount.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(trimmed);

  if (!match) {
    throw new Error("USDC amount must be a non-negative decimal string");
  }

  const [, whole, fraction = ""] = match;

  if (fraction.length > USDC_STROOP_DECIMALS) {
    throw new Error(`USDC amount cannot have more than ${USDC_STROOP_DECIMALS} decimal places`);
  }

  const paddedFraction = fraction.padEnd(USDC_STROOP_DECIMALS, "0");

  return BigInt(whole) * USDC_STROOP_SCALE + BigInt(paddedFraction);
}

export function stroopsToUsdc(stroops: bigint | number | string): string {
  const value = BigInt(stroops);

  if (value < 0n) {
    throw new Error("stroops amount must be non-negative");
  }

  const whole = value / USDC_STROOP_SCALE;
  const fraction = (value % USDC_STROOP_SCALE).toString().padStart(USDC_STROOP_DECIMALS, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");

  if (!trimmedFraction) {
    return `${whole}.00`;
  }

  return `${whole}.${trimmedFraction.padEnd(2, "0")}`;
}
