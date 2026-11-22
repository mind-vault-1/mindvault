/**
 * Opaque pagination cursor for receipt exports.
 *
 * A cursor pins the export to a snapshot boundary so that rows inserted after
 * the export started are neither duplicated nor skipped.
 *
 * Snapshot guarantees:
 * - `snapshotAt` is the highest receipt sequence number visible when the export
 *   began. Only receipts with `seq <= snapshotAt` are ever returned, so receipts
 *   inserted mid-export (which get higher sequence numbers) are excluded.
 * - `lastSeq` is the sequence number of the last row returned on the previous
 *   page. The next page resumes strictly after it (`seq > lastSeq`), which makes
 *   the ordering stable across page boundaries.
 */

export interface ExportCursor {
  snapshotAt: number;
  lastSeq: number;
}

export function encodeCursor(cursor: ExportCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(token: string): ExportCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid export cursor: malformed token');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Number.isInteger((parsed as ExportCursor).snapshotAt) ||
    !Number.isInteger((parsed as ExportCursor).lastSeq) ||
    (parsed as ExportCursor).lastSeq > (parsed as ExportCursor).snapshotAt
  ) {
    throw new Error('Invalid export cursor: bad fields');
  }
  return parsed as ExportCursor;
}
