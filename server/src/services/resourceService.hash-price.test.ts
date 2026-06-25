import { describe, it, expect, beforeEach, vi } from "vitest";

// Set up mocks for the db client before importing the service
let insertedValues: any = null;
let updatedValues: any = null;

vi.mock("../db/client.js", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((values: any) => {
        insertedValues = values;
        const id = "mocked-resource-id";
        return {
          returning: () => Promise.resolve([{ id, ...values }]),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: any) => {
        updatedValues = values;
        return {
          where: vi.fn(() => ({
            returning: () =>
              Promise.resolve([{ id: "mocked-resource-id", ...insertedValues, ...values }]),
          })),
        };
      }),
    })),
  },
}));

// Mock Supabase storage
vi.mock("../storage/supabaseStorage.js", () => ({
  uploadFile: vi.fn().mockResolvedValue("mocked/storage/path"),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock config
vi.mock("../config.js", () => ({
  config: {
    CATALOG_CACHE_TTL_MS: 60_000,
  },
}));

import { createFileResource, createLinkResource } from "./resourceService.js";
import { hashFileResource, hashLinkResource } from "../utils/crypto.js";

describe("resourceService Hashing and Price logic", () => {
  beforeEach(() => {
    insertedValues = null;
    updatedValues = null;
    vi.clearAllMocks();
  });

  describe("createFileResource", () => {
    it("correctly computes content hash, saves the price, and uploads file", async () => {
      const fileBuffer = Buffer.from("lorem ipsum file content");
      const title = "My Premium Dataset";
      const price = "15.50";
      const data = {
        publisherId: "pub_123",
        title,
        description: "A description",
        price,
        walletAddress: "GBX402...",
        fileBuffer,
        filename: "dataset.csv",
        mimeType: "text/csv",
      };

      const result = await createFileResource(data);

      // Verify db.insert was called with correct values, including the computed content hash and string price
      const expectedHash = hashFileResource(fileBuffer, title);
      expect(insertedValues).toEqual({
        publisherId: "pub_123",
        title,
        description: "A description",
        price,
        walletAddress: "GBX402...",
        resourceType: "file",
        mimeType: "text/csv",
        contentHash: expectedHash,
      });

      // Verify update was called with the uploaded storage path
      expect(updatedValues).toEqual({
        storagePath: "mocked/storage/path",
      });

      // Verify returned resource contains correct properties
      expect(result.contentHash).toBe(expectedHash);
      expect(result.price).toBe(price);
    });

    it("produces different hashes when titles differ even if file content is identical", () => {
      const fileBuffer = Buffer.from("identical file content");
      const hashA = hashFileResource(fileBuffer, "Title A");
      const hashB = hashFileResource(fileBuffer, "Title B");

      expect(hashA).not.toBe(hashB);
    });
  });

  describe("createLinkResource", () => {
    it("correctly computes content hash and saves the price", async () => {
      const externalUrl = "https://example.com/data-stream";
      const title = "Real-time Feed";
      const price = "0.99";
      const data = {
        publisherId: "pub_456",
        title,
        description: "Feed description",
        price,
        walletAddress: "GBX402...",
        externalUrl,
      };

      const result = await createLinkResource(data);

      const expectedHash = hashLinkResource(externalUrl, title);
      expect(insertedValues).toEqual({
        publisherId: "pub_456",
        title,
        description: "Feed description",
        price,
        walletAddress: "GBX402...",
        resourceType: "link",
        externalUrl,
        contentHash: expectedHash,
      });

      expect(result.contentHash).toBe(expectedHash);
      expect(result.price).toBe(price);
    });

    it("produces different hashes when titles differ even if URLs are identical", () => {
      const url = "https://example.com/same-url";
      const hashA = hashLinkResource(url, "Title A");
      const hashB = hashLinkResource(url, "Title B");

      expect(hashA).not.toBe(hashB);
    });

    it("normalizes query parameters and host casing to produce the same hash", () => {
      const title = "Normalized Feed";

      // Different casings and query param order
      const url1 = "https://EXAMPLE.com/foo/?b=2&a=1";
      const url2 = "https://example.com/foo?a=1&b=2";

      const hash1 = hashLinkResource(url1, title);
      const hash2 = hashLinkResource(url2, title);

      expect(hash1).toBe(hash2);
    });

    it("normalizes trailing slashes on URL path to produce the same hash", () => {
      const title = "Trailing Slash Feed";

      const url1 = "https://example.com/foo/";
      const url2 = "https://example.com/foo";

      const hash1 = hashLinkResource(url1, title);
      const hash2 = hashLinkResource(url2, title);

      expect(hash1).toBe(hash2);
    });
  });
});
