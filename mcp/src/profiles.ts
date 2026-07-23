/**
 * Multi-wallet profile state for the MindVault MCP server.
 *
 * Agents can keep several named wallet profiles (e.g. `testnet`, `mainnet`,
 * `publisher`, `buyer`) and switch the active one. This module holds the pure,
 * filesystem-free state model plus the migration from the original single-wallet
 * format, so the shape and migration are deterministic and unit-testable. The
 * mutable in-memory store and disk persistence live in `index.ts`.
 */

export interface AgentWallet {
  publicKey: string;
  secretKey: string;
}

/** One named identity: its wallet and (optionally) its publisher API key. */
export interface WalletProfile {
  wallet?: AgentWallet;
  apiKey?: string;
}

/** On-disk / in-memory shape for the current (v1) state format. */
export interface ProfileState {
  version: number;
  activeProfile: string;
  profiles: Record<string, WalletProfile>;
}

export interface MigrationResult {
  state: ProfileState;
  /** True when the input used the legacy format and the caller should re-persist. */
  migrated: boolean;
}

export const DEFAULT_PROFILE = "default";
export const STATE_VERSION = 1;

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/** Narrow an unknown value to a well-formed wallet (both keys present, non-empty). */
export function isValidWallet(value: unknown): value is AgentWallet {
  if (!value || typeof value !== "object") return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.publicKey === "string" &&
    w.publicKey.length > 0 &&
    typeof w.secretKey === "string" &&
    w.secretKey.length > 0
  );
}

/**
 * Validate a user-supplied profile name. Names are restricted to letters,
 * digits, dot, dash, and underscore (1–64 chars) so they are safe to echo in
 * agent-facing output and never collide with other state fields.
 */
export function isValidProfileName(name: unknown): name is string {
  return typeof name === "string" && PROFILE_NAME_PATTERN.test(name);
}

/** Keep only recognizable wallet/apiKey fields from an untrusted profiles map. */
export function normalizeProfiles(raw: unknown): Record<string, WalletProfile> {
  const out: Record<string, WalletProfile> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidProfileName(name) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const profile: WalletProfile = {};
    if (isValidWallet(v.wallet)) profile.wallet = v.wallet;
    if (typeof v.apiKey === "string" && v.apiKey.length > 0) profile.apiKey = v.apiKey;
    out[name] = profile;
  }
  return out;
}

/**
 * Coerce any persisted state — current or legacy — into a valid {@link ProfileState}.
 *
 * - Current format (`{ profiles, activeProfile }`) is normalized; an unknown or
 *   missing `activeProfile` falls back to the first profile, then `default`.
 * - Legacy format (`{ wallet?, apiKey? }`) is folded into the `default` profile
 *   and flagged `migrated` so the caller re-persists in the new shape.
 * - Anything unrecognized yields an empty state.
 */
export function migrateState(raw: unknown): MigrationResult {
  const empty: ProfileState = {
    version: STATE_VERSION,
    activeProfile: DEFAULT_PROFILE,
    profiles: {},
  };

  if (!raw || typeof raw !== "object") return { state: empty, migrated: false };
  const obj = raw as Record<string, unknown>;

  // Current (v1) format.
  if (obj.profiles && typeof obj.profiles === "object") {
    const profiles = normalizeProfiles(obj.profiles);
    const requested = typeof obj.activeProfile === "string" ? obj.activeProfile : DEFAULT_PROFILE;
    const activeProfile =
      requested in profiles ? requested : (Object.keys(profiles)[0] ?? DEFAULT_PROFILE);
    return { state: { version: STATE_VERSION, activeProfile, profiles }, migrated: false };
  }

  // Legacy (single-wallet) format → fold into the default profile.
  const legacy: WalletProfile = {};
  if (isValidWallet(obj.wallet)) legacy.wallet = obj.wallet;
  if (typeof obj.apiKey === "string" && obj.apiKey.length > 0) legacy.apiKey = obj.apiKey;
  if (legacy.wallet || legacy.apiKey) {
    return {
      state: {
        version: STATE_VERSION,
        activeProfile: DEFAULT_PROFILE,
        profiles: { [DEFAULT_PROFILE]: legacy },
      },
      migrated: true,
    };
  }

  return { state: empty, migrated: false };
}
