import { randomBytes, createHash } from "node:crypto";

export function generateApiKey(): string {
  return `mv_${randomBytes(32).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function hashContentUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export function calculateContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * SHA-256 over file bytes + title for the on-chain metadata integrity anchor.
 * The title is encoded as UTF-8 and prepended before the file bytes so the
 * hash changes if the title changes even when the bytes are identical.
 */
export function hashFileResource(buffer: Buffer, title: string): string {
  return createHash("sha256")
    .update(Buffer.from(title, "utf8"))
    .update(buffer)
    .digest("hex");
}

/**
 * SHA-256 of normalized external URL + title for link resource metadata.
 * Normalization: lowercase scheme+host, strip trailing slash from pathname,
 * sort query parameters alphabetically so equivalent URLs produce the same hash.
 */
export function hashLinkResource(url: string, title: string): string {
  const normalized = normalizeUrl(url);
  return createHash("sha256")
    .update(normalized)
    .update(Buffer.from(title, "utf8"))
    .digest("hex");
}

function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hostname = u.hostname.toLowerCase();
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  const sorted = Array.from(u.searchParams.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  u.search = "";
  sorted.forEach(([k, v]) => u.searchParams.append(k, v));
  return u.toString();
}
