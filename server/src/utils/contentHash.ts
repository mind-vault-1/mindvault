import { createHash } from "node:crypto";

type FileContentHashInput = {
  title: string;
  bytes: Buffer | Uint8Array;
};

type LinkContentHashInput = {
  title: string;
  externalUrl: string;
};

const HASH_VERSION = "mindvault-content-hash-v1";

function sha256Hex(value: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function normalizeExternalUrl(externalUrl: string): string {
  const url = new URL(externalUrl);

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  const sortedParams = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = leftKey.localeCompare(rightKey);
    return keyOrder === 0 ? leftValue.localeCompare(rightValue) : keyOrder;
  });

  url.search = "";
  for (const [key, value] of sortedParams) {
    url.searchParams.append(key, value);
  }

  return url.toString();
}

function canonicalPayload(data: Record<string, string>): string {
  return JSON.stringify(data);
}

export function createFileContentHash({ title, bytes }: FileContentHashInput): string {
  return sha256Hex(
    canonicalPayload({
      version: HASH_VERSION,
      resourceType: "file",
      title: normalizeTitle(title),
      bytesSha256: sha256Hex(bytes),
    })
  );
}

export function createLinkContentHash({ title, externalUrl }: LinkContentHashInput): string {
  return sha256Hex(
    canonicalPayload({
      version: HASH_VERSION,
      resourceType: "link",
      title: normalizeTitle(title),
      externalUrl: normalizeExternalUrl(externalUrl),
    })
  );
}
