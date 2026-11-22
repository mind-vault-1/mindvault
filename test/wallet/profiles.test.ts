import { describe, it, expect } from 'vitest';
import { ProfileStore, ProfileCollisionError } from '../../src/wallet/profiles';
import { normalizeProfileName } from '../../src/wallet/profileNormalize';

describe('normalizeProfileName', () => {
  it('treats case variants as equal', () => {
    expect(normalizeProfileName('Main')).toBe(normalizeProfileName('main'));
  });

  it('treats NFC and NFD forms as equal', () => {
    const nfc = 'caf\u00e9';
    const nfd = 'cafe\u0301';
    expect(normalizeProfileName(nfc)).toBe(normalizeProfileName(nfd));
  });
});

describe('ProfileStore collision handling', () => {
  it('rejects case collisions on create', () => {
    const store = new ProfileStore();
    store.create('Main', { chain: 1 });
    expect(() => store.create('main', { chain: 2 })).toThrow(ProfileCollisionError);
    expect(store.list()).toHaveLength(1);
    expect(store.get('Main')?.config).toEqual({ chain: 1 });
  });

  it('rejects Unicode normalization collisions on create', () => {
    const store = new ProfileStore();
    store.create('caf\u00e9', { chain: 1 });
    expect(() => store.create('cafe\u0301', { chain: 2 })).toThrow(ProfileCollisionError);
    expect(store.list()).toHaveLength(1);
    expect(store.get('caf\u00e9')?.config).toEqual({ chain: 1 });
  });

  it('leaves state unchanged when an import contains an internal collision', () => {
    const store = new ProfileStore();
    store.create('existing', { chain: 1 });
    expect(() =>
      store.import([
        { name: 'Alpha', config: { chain: 2 } },
        { name: 'ALPHA', config: { chain: 3 } },
      ]),
    ).toThrow(ProfileCollisionError);
    expect(store.list().map((p) => p.name)).toEqual(['existing']);
    expect(store.get('alpha')).toBeUndefined();
  });

  it('leaves state unchanged when an import collides with existing profiles', () => {
    const store = new ProfileStore();
    store.create('Main', { chain: 1 });
    expect(() =>
      store.import([
        { name: 'Other', config: { chain: 2 } },
        { name: 'main', config: { chain: 3 } },
      ]),
    ).toThrow(ProfileCollisionError);
    expect(store.list().map((p) => p.name)).toEqual(['Main']);
    expect(store.get('Other')).toBeUndefined();
  });
});
