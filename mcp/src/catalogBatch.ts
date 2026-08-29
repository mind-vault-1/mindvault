/**
 * Bounds for mindvault_batch_catalog_lookup.
 *
 * Each id in the batch is a separate HTTP round trip to the MindVault API
 * (there is no batch endpoint server-side), fanned out in parallel. The cap
 * keeps a single tool call from fanning out to an unbounded number of
 * concurrent requests — kept in line with the on-chain registry list page
 * size (see registryPagination.ts) rather than picked arbitrarily.
 */

export const BATCH_CATALOG_LOOKUP_MAX_IDS = 20;
