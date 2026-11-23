import { normalizeProfileName } from './profileNormalize';

export interface WalletProfile {
  name: string;
  config: Record<string, unknown>;
}

export class ProfileCollisionError extends Error {
  constructor(existing: string, attempted: string) {
    super(
      `Profile name "${attempted}" collides with existing profile "${existing}" after normalization`,
    );
    this.name = 'ProfileCollisionError';
  }
}

export class ProfileStore {
  private readonly profiles = new Map<string, WalletProfile>();

  /** Map from normalized identifier to the original profile name. */
  private readonly index = new Map<string, string>();

  create(name: string, config: Record<string, unknown>): WalletProfile {
    const key = normalizeProfileName(name);
    const existing = this.index.get(key);
    if (existing !== undefined) {
      throw new ProfileCollisionError(existing, name);
    }
    const profile: WalletProfile = { name, config: { ...config } };
    this.profiles.set(name, profile);
    this.index.set(key, name);
    return profile;
  }

  import(profiles: WalletProfile[]): WalletProfile[] {
    // Validate the whole batch against existing state and itself before mutating.
    const seen = new Map<string, string>();
    for (const p of profiles) {
      const key = normalizeProfileName(p.name);
      const existing = this.index.get(key) ?? seen.get(key);
      if (existing !== undefined) {
        throw new ProfileCollisionError(existing, p.name);
      }
      seen.set(key, p.name);
    }
    return profiles.map((p) => this.create(p.name, p.config));
  }

  get(name: string): WalletProfile | undefined {
    const original = this.index.get(normalizeProfileName(name));
    return original === undefined ? undefined : this.profiles.get(original);
  }

  list(): WalletProfile[] {
    return [...this.profiles.values()];
  }
}
