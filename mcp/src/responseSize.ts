export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MIN_MAX_RESPONSE_BYTES = 1024;
export const MAX_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export class ResponseSizeLimitError extends Error {
  readonly code = "RESPONSE_SIZE_LIMIT_EXCEEDED";

  constructor(
    readonly actualBytes: number,
    readonly maxBytes: number,
  ) {
    super(`Upstream response is ${actualBytes} bytes; maximum is ${maxBytes} bytes.`);
    this.name = "ResponseSizeLimitError";
  }
}

export function resolveMaxResponseBytes(value = process.env.MINDVAULT_MAX_RESPONSE_BYTES): number {
  if (value === undefined || value.trim() === "") return DEFAULT_MAX_RESPONSE_BYTES;
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_MAX_RESPONSE_BYTES ||
    parsed > MAX_MAX_RESPONSE_BYTES
  ) {
    throw new Error(
      `MINDVAULT_MAX_RESPONSE_BYTES must be an integer between ${MIN_MAX_RESPONSE_BYTES} and ${MAX_MAX_RESPONSE_BYTES}.`,
    );
  }
  return parsed;
}

export async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const bytes = Number(declared);
    if (Number.isFinite(bytes) && bytes > maxBytes)
      throw new ResponseSizeLimitError(bytes, maxBytes);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new ResponseSizeLimitError(bytes.byteLength, maxBytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
