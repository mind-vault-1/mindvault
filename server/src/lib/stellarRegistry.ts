import { getResource } from "../services/registryClient.js";

// USDC on Stellar uses 7 decimal places. The on-chain registry stores prices
// as i128 stroops (price * 10^7); the DB stores them as plain USDC strings
// (e.g. "0.50"). To compare safely we normalize both sides to the same fixed
// 7-decimal string without going through floating point.
const USDC_DECIMALS = 7;
const STROOPS_PER_USDC = 10n ** BigInt(USDC_DECIMALS);

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class OnChainLookupError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "OnChainLookupError";
    this.cause = cause;
  }
}

interface CacheEntry {
  price: string;
  creator: string;
  fetchedAt: number;
}

export interface PriceCache {
  get(resourceId: string): CacheEntry | undefined;
  set(resourceId: string, entry: CacheEntry): void;
  delete(resourceId: string): void;
  clear(): void;
}

// Factory so tests can hold their own cache instance and reset between cases
// without leaking state across test files.
export function createCache(): PriceCache {
  const store = new Map<string, CacheEntry>();
  return {
    get: (k) => store.get(k),
    set: (k, v) => {
      store.set(k, v);
    },
    delete: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}

const defaultCache = createCache();

export function stroopsToUsdc(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_USDC;
  const frac = abs % STROOPS_PER_USDC;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0");
  return `${negative ? "-" : ""}${whole}.${fracStr}`;
}

export function normalizeUsdcPrice(price: string): string {
  const trimmed = price.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid USDC price string: ${price}`);
  }
  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = body.split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return `${negative ? "-" : ""}${BigInt(whole).toString()}.${fracPadded}`;
}

export interface OnChainPrice {
  price: string;
  creator: string;
  cached: boolean;
}

export interface GetOnChainPriceOptions {
  cache?: PriceCache;
  now?: () => number;
  ttlMs?: number;
  fetcher?: (id: string) => Promise<{ price: bigint; creator: string } | null>;
}

async function defaultFetcher(id: string) {
  const resource = await getResource(id);
  if (!resource) return null;
  return { price: BigInt(resource.price as unknown as bigint), creator: resource.creator };
}

export async function getOnChainPrice(
  resourceId: string,
  options: GetOnChainPriceOptions = {},
): Promise<OnChainPrice> {
  const cache = options.cache ?? defaultCache;
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const fetcher = options.fetcher ?? defaultFetcher;

  const cached = cache.get(resourceId);
  if (cached && now() - cached.fetchedAt < ttl) {
    return { price: cached.price, creator: cached.creator, cached: true };
  }

  let record: { price: bigint; creator: string } | null;
  try {
    record = await fetcher(resourceId);
  } catch (err) {
    throw new OnChainLookupError(`Failed to read on-chain record for resource ${resourceId}`, err);
  }
  if (!record) {
    throw new OnChainLookupError(`Resource ${resourceId} not found on-chain`);
  }

  const price = stroopsToUsdc(record.price);
  cache.set(resourceId, { price, creator: record.creator, fetchedAt: now() });
  return { price, creator: record.creator, cached: false };
}
