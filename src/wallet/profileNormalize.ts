/**
 * Normalizes a wallet profile name into a canonical identifier.
 *
 * Normalization applies Unicode NFC, trims surrounding whitespace, and
 * lowercases the result so that visually or canonically equivalent names
 * map to the same identifier.
 */
export function normalizeProfileName(name: string): string {
  return name.normalize('NFC').trim().toLowerCase();
}
