import { ExportCursor, decodeCursor, encodeCursor } from './cursor';

export interface Receipt {
  seq: number;
  id: string;
  amountCents: number;
  createdAt: string;
}

/**
 * Storage abstraction. Implementations must return rows ordered by `seq`
 * ascending, containing only rows with `seq > afterSeq AND seq <= maxSeq`.
 */
export interface ReceiptStore {
  /** Highest assigned receipt sequence number, or 0 if none. */
  currentMaxSeq(): Promise<number>;
  /** Fetch up to `limit` receipts within the (afterSeq, maxSeq] window. */
  fetchPage(afterSeq: number, maxSeq: number, limit: number): Promise<Receipt[]>;
}

export interface ExportPage {
  receipts: Receipt[];
  /** Present when more pages exist. Pass back unchanged to continue. */
  nextCursor?: string;
  /** Snapshot boundary this export is pinned to. */
  snapshotAt: number;
}

export const DEFAULT_PAGE_SIZE = 100;

/**
 * Returns one page of a receipt export.
 *
 * The first call (no cursor) captures a snapshot boundary via
 * `currentMaxSeq()`. Every subsequent page reuses that boundary, so receipts
 * created after the export started are not included and cannot shift rows
 * between pages. Because receipts are append-only with monotonic sequence
 * numbers, paging by `seq > lastSeq` yields no duplicates and no skips within
 * the snapshot.
 */
export async function exportReceiptsPage(
  store: ReceiptStore,
  opts: { cursor?: string; pageSize?: number } = {},
): Promise<ExportPage> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('pageSize must be a positive integer');
  }

  const state: ExportCursor = opts.cursor
    ? decodeCursor(opts.cursor)
    : { snapshotAt: await store.currentMaxSeq(), lastSeq: 0 };

  const rows = await store.fetchPage(state.lastSeq, state.snapshotAt, pageSize + 1);
  const hasMore = rows.length > pageSize;
  const receipts = hasMore ? rows.slice(0, pageSize) : rows;

  const result: ExportPage = { receipts, snapshotAt: state.snapshotAt };
  if (hasMore && receipts.length > 0) {
    result.nextCursor = encodeCursor({
      snapshotAt: state.snapshotAt,
      lastSeq: receipts[receipts.length - 1].seq,
    });
  }
  return result;
}

/** Convenience: drain all pages of an export into an array. */
export async function exportAllReceipts(
  store: ReceiptStore,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<Receipt[]> {
  const all: Receipt[] = [];
  let cursor: string | undefined;
  do {
    const page = await exportReceiptsPage(store, { cursor, pageSize });
    all.push(...page.receipts);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}
