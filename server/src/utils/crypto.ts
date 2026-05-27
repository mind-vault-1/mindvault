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
