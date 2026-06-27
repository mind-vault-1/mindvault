/**
 * Upload guardrails (#87): content-type allowlist and declared-vs-detected
 * content-type validation.
 *
 * `multer` exposes the *declared* MIME type (from the multipart part headers),
 * which a client fully controls. To stop a caller smuggling, say, an executable
 * past an `application/pdf` label we additionally sniff the buffer's magic bytes
 * and require the detected type to match the declaration before anything is
 * written to storage.
 */

/** Normalize common MIME aliases so equivalent types compare equal. */
export function normalizeMimeType(mime: string): string {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "image/jpg") return "image/jpeg";
  if (m === "application/x-zip-compressed") return "application/zip";
  if (m === "audio/mp3") return "audio/mpeg";
  return m;
}

/** Parse a comma-separated allowlist into a normalized Set. */
export function parseAllowedMimeTypes(csv: string): Set<string> {
  return new Set(
    (csv ?? "")
      .split(",")
      .map((t) => normalizeMimeType(t))
      .filter(Boolean),
  );
}

/** MIME types whose contents we can verify from magic bytes. */
const DETECTABLE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/zip",
  "video/mp4",
  "audio/mpeg",
]);

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * Detect a file's MIME type from its magic bytes. Returns `null` for content
 * with no reliable signature (e.g. plain text / markdown / json).
 */
export function detectContentType(buffer: Buffer): string | null {
  if (!buffer || buffer.length === 0) return null;

  // %PDF
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  // PNG
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // JPEG
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // GIF87a / GIF89a
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  // RIFF....WEBP
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  // ZIP (also covers docx/xlsx/etc. zip containers)
  if (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(buffer, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return "application/zip";
  }
  // MP4 / ISO base media: "ftyp" box at offset 4
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4";
  // MP3: ID3 tag or MPEG audio frame sync
  if (startsWith(buffer, [0x49, 0x44, 0x33])) return "audio/mpeg";
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg";

  return null;
}

export type UploadValidationResult =
  | { ok: true; contentType: string }
  | { ok: false; status: 415; error: string };

/**
 * Validate an uploaded file against the allowlist and verify its declared type
 * matches the detected magic bytes. Pure and side-effect free so it can run
 * before any storage write.
 */
export function validateUpload(
  buffer: Buffer,
  declaredMimeType: string,
  allowed: Set<string>,
): UploadValidationResult {
  const declared = normalizeMimeType(declaredMimeType);

  if (!declared) {
    return { ok: false, status: 415, error: "Missing file content type" };
  }
  if (!allowed.has(declared)) {
    return {
      ok: false,
      status: 415,
      error: `Unsupported content type "${declared}". Allowed: ${[...allowed].sort().join(", ")}`,
    };
  }

  const detected = detectContentType(buffer);

  // For binary types we can fingerprint, the bytes must back up the declaration.
  if (DETECTABLE_TYPES.has(declared) && detected !== declared) {
    return {
      ok: false,
      status: 415,
      error: `Declared content type "${declared}" does not match file contents${
        detected ? ` (detected "${detected}")` : ""
      }`,
    };
  }

  // Catch a non-detectable declaration (e.g. text/plain) that is actually a
  // recognizable binary masquerading as text.
  if (detected && detected !== declared) {
    return {
      ok: false,
      status: 415,
      error: `Declared content type "${declared}" does not match detected "${detected}"`,
    };
  }

  return { ok: true, contentType: declared };
}
