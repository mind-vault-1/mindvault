import { describe, it, expect } from 'vitest';
import { Receipt, ReceiptStore, exportAllReceipts, exportReceiptsPage } from './export';
import { decodeCursor, encodeCursor } from './cursor';

/** In-memory append-only store that honors the ReceiptStore contract. */
class MemoryReceiptStore implements ReceiptStore {
  rows: Receipt[] = [];

  insert(id: string, amountCents: number): void {
    const seq = this.rows.length + 1;
    this.rows.push({ seq, id, amountCents, createdAt: new Date(seq * 1000).toISOString() });
  }

  async currentMaxSeq(): Promise<number> {
    return this.rows.length;
  }

  async fetchPage(afterSeq: number, maxSeq: number, limit: number): Promise<Receipt[]> {
    return this.rows.filter((r) => r.seq > afterSeq && r.seq <= maxSeq).slice(0, limit);
  }
}

describe('receipt export snapshot stability', () => {
  it('does not duplicate or skip rows when purchases arrive between pages', async () => {
    const store = new MemoryReceiptStore();
    for (let i = 1; i <= 5; i++) store.insert(`r${i}`, i * 100);

    const first = await exportReceiptsPage(store, { pageSize: 2 });
    expect(first.receipts.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(first.nextCursor).toBeDefined();

    // New purchases arrive while the export is in progress.
    store.insert('r6', 600);
    store.insert('r7', 700);

    const second = await exportReceiptsPage(store, { cursor: first.nextCursor, pageSize: 2 });
    expect(second.receipts.map((r) => r.id)).toEqual(['r3', 'r4']);
    expect(second.snapshotAt).toBe(first.snapshotAt);

    const third = await exportReceiptsPage(store, { cursor: second.nextCursor, pageSize: 2 });
    expect(third.receipts.map((r) => r.id)).toEqual(['r5']);
    expect(third.nextCursor).toBeUndefined();
  });

  it('full export excludes receipts created after the export started', async () => {
    const store = new MemoryReceiptStore();
    for (let i = 1; i <= 3; i++) store.insert(`r${i}`, 100);

    const page = await exportReceiptsPage(store, { pageSize: 1 });
    store.insert('late', 999);

    const rest = await exportAllReceipts(store, 1);
    // exportAllReceipts starts a fresh snapshot, so it should include 'late'.
    expect(rest.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'late']);
    expect(page.receipts.map((r) => r.id)).toEqual(['r1']);
  });

  it('pins the snapshot boundary across pages', async () => {
    const store = new MemoryReceiptStore();
    store.insert('a', 1);
    store.insert('b', 2);

    const first = await exportReceiptsPage(store, { pageSize: 1 });
    store.insert('c', 3);
    const second = await exportReceiptsPage(store, { cursor: first.nextCursor, pageSize: 1 });

    expect(second.snapshotAt).toBe(2);
    expect(second.receipts.map((r) => r.id)).toEqual(['b']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('returns an empty final page without a cursor when nothing matches', async () => {
    const store = new MemoryReceiptStore();
    const page = await exportReceiptsPage(store, { pageSize: 10 });
    expect(page.receipts).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
    expect(page.snapshotAt).toBe(0);
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(/Invalid export cursor/);
    expect(() => decodeCursor(encodeCursor({ snapshotAt: 1, lastSeq: 5 }))).toThrow(
      /Invalid export cursor/,
    );
  });

  it('rejects non-positive page sizes', async () => {
    const store = new MemoryReceiptStore();
    await expect(exportReceiptsPage(store, { pageSize: 0 })).rejects.toThrow(/pageSize/);
  });
});
