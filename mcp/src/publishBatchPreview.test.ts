import { describe, expect, it } from "vitest";
import {
  PUBLISH_BATCH_PREVIEW_MAX_ITEMS,
  PUBLISH_BATCH_PREVIEW_SCHEMA,
  PublishBatchPreviewError,
  previewPublishBatch,
} from "./publishBatchPreview.js";

const VALID_ITEM = {
  title: "Data set",
  description: "A public data set",
  price: "5.00",
  externalUrl: "https://example.com/data.json",
};

describe("previewPublishBatch", () => {
  it("returns a structured, ready preview for valid items", () => {
    const result = JSON.parse(
      previewPublishBatch({ items: [VALID_ITEM, { ...VALID_ITEM, title: "Paper" }] }, {}),
    );
    expect(result.schema).toBe(PUBLISH_BATCH_PREVIEW_SCHEMA);
    expect(result.itemCount).toBe(2);
    expect(result.valid).toBe(true);
    expect(result.summary).toEqual({
      validCount: 2,
      invalidCount: 0,
      totalValidUsdc: "10",
      estimatedVerificationFeeCount: 2,
    });
    expect(result.items[0].normalized).toEqual({
      title: "Data set",
      description: "A public data set",
      price: "5.00",
      externalUrl: "https://example.com/data.json",
    });
    expect(result.items[0].issues).toEqual([]);
  });

  it("reports field-level issues without echoing rejected values", () => {
    const result = JSON.parse(
      previewPublishBatch(
        {
          items: [
            VALID_ITEM,
            {
              title: "",
              price: "1e-7",
              externalUrl: "http://169.254.169.254/latest/meta-data/",
            },
          ],
        },
        {},
      ),
    );
    expect(result.valid).toBe(false);
    expect(result.summary).toEqual({
      validCount: 1,
      invalidCount: 1,
      totalValidUsdc: "5",
      estimatedVerificationFeeCount: 2,
    });
    expect(result.items[1].valid).toBe(false);
    expect(result.items[1].normalized).toBeNull();
    const fields = result.items[1].issues.map((issue: { field: string }) => issue.field);
    expect(fields).toContain("items[1].title");
    expect(fields).toContain("items[1].price");
    expect(fields).toContain("items[1].externalUrl");
    expect(JSON.stringify(result)).not.toContain("1e-7");
    expect(JSON.stringify(result)).not.toContain("169.254.169.254");
  });

  it("accepts a private host only when the operator allowlists it", () => {
    const item = { ...VALID_ITEM, externalUrl: "http://internal.local/data.json" };
    const blocked = JSON.parse(previewPublishBatch({ items: [item] }, {}));
    expect(blocked.valid).toBe(false);
    const allowed = JSON.parse(
      previewPublishBatch({ items: [item] }, { MINDVAULT_URL_ALLOWLIST: "internal.local" }),
    );
    expect(allowed.valid).toBe(true);
  });

  it("rejects empty and oversized batches with actionable errors", () => {
    expect(() => previewPublishBatch({}, {})).toThrow(PublishBatchPreviewError);
    expect(() => previewPublishBatch({ items: [] }, {})).toThrow(/1–10 resources/);
    expect(() =>
      previewPublishBatch(
        {
          items: Array.from({ length: PUBLISH_BATCH_PREVIEW_MAX_ITEMS + 1 }, () => VALID_ITEM),
        },
        {},
      ),
    ).toThrow(/1–10 resources/);
  });

  it("is deterministic for the same input", () => {
    const first = previewPublishBatch({ items: [VALID_ITEM] }, {});
    const second = previewPublishBatch({ items: [VALID_ITEM] }, {});
    expect(first).toBe(second);
  });
});
