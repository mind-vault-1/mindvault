import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export const Errors = {
  1: { message: "AlreadyRegistered" },
  2: { message: "NotFound" },
  3: { message: "InvalidPrice" },
  4: { message: "MetadataTooLong" },
  5: { message: "InvalidTag" },
  6: { message: "Unauthorized" },
  7: { message: "PendingAdminNotSet" },
  8: { message: "PendingAdminAlreadySet" },
  9: { message: "SameAdmin" },
  10: { message: "TermsHashTooLong" },
  11: { message: "InvalidResourceId" },
  12: { message: "InvalidMetadataPointer" },
  13: { message: "EmptyMetadata" },
  14: { message: "AlreadyOwner" },
  15: { message: "NoPendingTransfer" },
  16: { message: "ReservedId" },
  17: { message: "PriceExceedsMax" },
  18: { message: "AdminNotSet" },
  19: { message: "NotVerifier" },
  20: { message: "InvalidVerificationTransition" },
  21: { message: "AlreadyFrozen" },
  22: { message: "MetadataFrozen" },
  23: { message: "DuplicateInRepair" },
  24: { message: "InvalidTxHash" },
  25: { message: "InvalidPaymentAmount" },
  26: { message: "NotModerator" },
  27: { message: "AlreadyFlagged" },
  28: { message: "NotFlagged" },
  29: { message: "InvalidLifecycleTransition" },
  30: { message: "ResourceNotMutable" },
  31: { message: "NetworkAlreadyInitialized" },
  32: { message: "NetworkIdMismatch" },
  33: { message: "NetworkNotInitialized" },
};

export type DataKey =
  | { tag: "Resource"; values: readonly [string] }
  | { tag: "Count"; values: void }
  | { tag: "Index"; values: readonly [u32] }
  | { tag: "Admin"; values: void }
  | { tag: "PendingAdmin"; values: void }
  | { tag: "CreatorTerms"; values: readonly [string] }
  | { tag: "CreatorResources"; values: readonly [string] }
  | { tag: "CreatorCount"; values: readonly [string] }
  | { tag: "PendingTransfer"; values: readonly [string] }
  | { tag: "Verifier"; values: readonly [string] }
  | { tag: "NetworkId"; values: void };

export interface Resource {
  creator: string;
  /**
   * Once true, `update_metadata` permanently rejects further changes.
   */
  frozen: boolean;
  id: string;
  /**
   * Backwards-compatible projection of `state == ResourceState::Listed`.
   */
  listed: boolean;
  metadata: string;
  price: i128;
  /**
   * Explicit resource lifecycle state. See `contract/README.md` for the
   * transition table and the role allowed to make each transition.
   */
  state: ResourceState;
  /**
   * Discovery labels (e.g. "dataset", "research"). Distinct from `metadata`,
   * which remains the off-chain content anchor (IPFS URI, content hash, etc.).
   */
  tags: Array<string>;
  /**
   * Ledger sequence number at which this resource was last written
   * (register or any mutation). Clients can use this to detect staleness
   * or order events without trusting off-chain timestamps.
   */
  updated_at: u32;
  /**
   * On-chain verification status, settable only by a verifier.
   */
  verified: VerificationStatus;
}

/**
 * One page of the on-chain catalog plus a cursor for the next page.
 *
 * `next_cursor` is the catalog index to pass back into `list` / `list_page`
 * as `start`/`cursor`. `None` means end-of-list — clients must not recompute
 * offsets themselves.
 */
export interface CatalogPage {
  items: Array<Resource>;
  next_cursor: Option<u32>;
}

/**
 * Structured payload published with the `setprice` event.
 * Includes the resource id, the price before and after the update, and the
 * address that authorised the change — enabling indexers to reconcile price
 * history without re-reading contract storage.
 */
export interface PriceUpdated {
  id: string;
  new_price: i128;
  old_price: i128;
  updater: string;
}

/**
 * Registry discovery metadata returned by [`VaultRegistry::registry_info`].
 * Lets a client discover the deployed registry's identity and shape with a
 * single read-only call instead of hardcoding assumptions.
 */
export interface RegistryInfo {
  /**
   * Stable, human-readable registry name (`REGISTRY_NAME`).
   */
  name: string;
  /**
   * Network passphrase digest of the ledger this contract is running on
   * (`env.ledger().network_id()`), so clients can confirm they are
   * talking to the network they expect without a hardcoded config value.
   */
  network_id: Buffer;
  /**
   * Version of the on-chain `Resource` schema (`RESOURCE_SCHEMA_VERSION`).
   */
  resource_schema_version: u32;
  /**
   * Contract crate version (`CARGO_PKG_VERSION` at build time).
   */
  version: string;
}

/**
 * The availability and moderation state of a resource.
 *
 * `listed` remains on [`Resource`] as a backwards-compatible projection: it
 * is true exactly when this value is [`ResourceState::Listed`]. Clients that
 * need to distinguish a moderation hold from a creator delist must use this
 * field rather than the boolean projection.
 */
export type ResourceState =
  | { tag: "Listed"; values: void }
  | { tag: "Delisted"; values: void }
  | { tag: "Frozen"; values: void }
  | { tag: "Disputed"; values: void }
  | { tag: "Tombstoned"; values: void };

/**
 * Compact version struct returned by [`VaultRegistry::contract_version`].
 *
 * Deployment scripts and upgrade tooling should call `contract_version`
 * before and after a redeploy to confirm which build is running on-chain.
 * Only `resource_schema_version` is relevant to whether callers must update
 * their `Resource` decoding logic; a `crate_version` bump alone is safe.
 */
export interface ContractVersion {
  /**
   * Cargo semver string baked in at build time (`CARGO_PKG_VERSION`).
   */
  crate_version: string;
  /**
   * On-chain `Resource` schema version (`RESOURCE_SCHEMA_VERSION`).
   * Bump this only when the `Resource` struct changes in a breaking way.
   */
  resource_schema_version: u32;
}

/**
 * On-chain mirror of the server's off-chain verification result. Settable
 * only by an address holding the verifier role (see `add_verifier`).
 */
export type VerificationStatus =
  | { tag: "Pending"; values: void }
  | { tag: "Verified"; values: void }
  | { tag: "Rejected"; values: void };

/**
 * Event data emitted when a resource's metadata pointer is updated.
 * Carries the resource id, the previous metadata pointer, and the new one
 * so that off-chain indexers can build a full audit trail without querying
 * historical ledger state.
 */
export interface MetadataUpdateEvent {
  id: string;
  new_metadata: string;
  old_metadata: string;
}

export interface Client {
  get: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<Resource>>>;

  list: (
    { start, limit }: { start: u32; limit: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<Resource>>>;

  admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;

  count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;

  delist: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  exists: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<boolean>>;

  register: (
    {
      creator,
      id,
      price,
      metadata,
      tags,
    }: { creator: string; id: string; price: i128; metadata: string; tags: Array<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  set_tags: (
    { id, tags }: { id: string; tags: Array<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  get_owner: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<string>>>;

  list_page: (
    { cursor, limit }: { cursor: u32; limit: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<CatalogPage>>;

  set_price: (
    { id, new_price }: { id: string; new_price: i128 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  network_id: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>;

  set_listed: (
    { id, listed }: { id: string; listed: boolean },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  is_verifier: (
    { address }: { address: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<boolean>>;

  list_listed: (
    { start, limit }: { start: u32; limit: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<Resource>>>;

  accept_admin: (
    { new_admin }: { new_admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  add_verifier: (
    { verifier }: { verifier: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  open_dispute: (
    { id, admin }: { id: string; admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  repair_index: (
    { ids }: { ids: Array<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;

  registry_info: (options?: MethodOptions) => Promise<AssembledTransaction<RegistryInfo>>;

  get_terms_hash: (
    { creator }: { creator: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<string>>>;

  set_terms_hash: (
    { creator, terms_hash }: { creator: string; terms_hash: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  accept_transfer: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  cancel_transfer: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  freeze_metadata: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  freeze_resource: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  list_by_creator: (
    { creator, start, limit }: { creator: string; start: u32; limit: u32 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Array<Resource>>>;

  remove_verifier: (
    { verifier }: { verifier: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  resolve_dispute: (
    { id, admin, state }: { id: string; admin: string; state: ResourceState },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  update_metadata: (
    { id, metadata }: { id: string; metadata: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  contract_version: (options?: MethodOptions) => Promise<AssembledTransaction<ContractVersion>>;

  propose_transfer: (
    { id, new_creator }: { id: string; new_creator: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  initialize_network: (
    { network_id }: { network_id: Buffer },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  nominate_new_admin: (
    { new_admin }: { new_admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  tombstone_resource: (
    { id, admin }: { id: string; admin: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  transfer_ownership: (
    { id, new_creator }: { id: string; new_creator: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  creator_resource_count: (
    { creator }: { creator: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<u32>>;

  set_verification_status: (
    { id, verifier, status }: { id: string; verifier: string; status: VerificationStatus },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        wasmHash: Buffer | string;
        salt?: Buffer | Uint8Array;
        format?: "hex" | "base64";
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        "AAAAAAAAAD5GZXRjaCBhIHJlc291cmNlLiBFcnJvcnMgd2l0aCBgTm90Rm91bmRgIGlmIGl0IGRvZXMgbm90IGV4aXN0LgAAAAAAA2dldAAAAAABAAAAAAAAAAJpZAAAAAAAEAAAAAEAAAPpAAAH0AAAAAhSZXNvdXJjZQAAAAM=",
        "AAAAAAAAANxQYWdpbmF0ZWQgcmVzb3VyY2UgbGlzdCBpbiBpbnNlcnRpb24gb3JkZXIuIGBsaW1pdGAgaXMgY2FwcGVkIGF0IDIwLgoKS2VwdCBmb3IgY2FsbGVycyB0aGF0IG9ubHkgbmVlZCB0aGUgcGFnZSBib2R5LiBQcmVmZXIgYGxpc3RfcGFnZWAgd2hlbgp0aGUgY2xpZW50IG11c3Qga25vdyB0aGUgbmV4dCBjdXJzb3IgLyBlbmQtb2YtbGlzdCB3aXRob3V0IHJlY29tcHV0aW5nCm9mZnNldHMuAAAABGxpc3QAAAACAAAAAAAAAAVzdGFydAAAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPqAAAH0AAAAAhSZXNvdXJjZQ==",
        "AAAAAAAAABdDdXJyZW50IGNvbnRyYWN0IGFkbWluLgAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAAFtUb3RhbCBudW1iZXIgb2YgcmVzb3VyY2VzIHN1Y2Nlc3NmdWxseSByZWdpc3RlcmVkIChtb25vdG9uaWM7IG5vdCBkZWNyZW1lbnRlZCBvbiB0cmFuc2ZlcikuAAAAAAVjb3VudAAAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAF1EZWxpc3QgYSByZXNvdXJjZSAoY29udmVuaWVuY2UgbWV0aG9kIGZvciBzZXRfbGlzdGVkKGZhbHNlKSkuIE9ubHkgdGhlIGNyZWF0b3IgbWF5IGNhbGwgdGhpcy4AAAAAAAAGZGVsaXN0AAAAAAABAAAAAAAAAAJpZAAAAAAAEAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAGpXaGV0aGVyIGEgcmVzb3VyY2Ugd2l0aCBgaWRgIGlzIHJlZ2lzdGVyZWQuCkJ1bXBzIHRoZSBlbnRyeSdzIFRUTCB3aGVuIGZvdW5kLCBrZWVwaW5nIGhvdCByZXNvdXJjZXMgYWxpdmUuAAAAAAAGZXhpc3RzAAAAAAABAAAAAAAAAAJpZAAAAAAAEAAAAAEAAAAB",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAGgAAAAAAAAARQWxyZWFkeVJlZ2lzdGVyZWQAAAAAAAABAAAAAAAAAAhOb3RGb3VuZAAAAAIAAAAAAAAADEludmFsaWRQcmljZQAAAAMAAAAAAAAAD01ldGFkYXRhVG9vTG9uZwAAAAAEAAAAAAAAAApJbnZhbGlkVGFnAAAAAAAFAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAAGAAAAAAAAABJQZW5kaW5nQWRtaW5Ob3RTZXQAAAAAAAcAAAAAAAAAFlBlbmRpbmdBZG1pbkFscmVhZHlTZXQAAAAAAAgAAAAAAAAACVNhbWVBZG1pbgAAAAAAAAkAAAAAAAAAEFRlcm1zSGFzaFRvb0xvbmcAAAAKAAAAAAAAABFJbnZhbGlkUmVzb3VyY2VJZAAAAAAAAAsAAAAAAAAAFkludmFsaWRNZXRhZGF0YVBvaW50ZXIAAAAAAAwAAAAAAAAADUVtcHR5TWV0YWRhdGEAAAAAAAANAAAAAAAAAAxBbHJlYWR5T3duZXIAAAAOAAAAAAAAABFOb1BlbmRpbmdUcmFuc2ZlcgAAAAAAAA8AAAAAAAAAClJlc2VydmVkSWQAAAAAABAAAAAAAAAAD1ByaWNlRXhjZWVkc01heAAAAAARAAAAAAAAAAtBZG1pbk5vdFNldAAAAAASAAAAAAAAAAtOb3RWZXJpZmllcgAAAAATAAAAAAAAAB1JbnZhbGlkVmVyaWZpY2F0aW9uVHJhbnNpdGlvbgAAAAAAABQAAAAAAAAADUFscmVhZHlGcm96ZW4AAAAAAAAVAAAAAAAAAA5NZXRhZGF0YUZyb3plbgAAAAAAFgAAAAAAAAARRHVwbGljYXRlSW5SZXBhaXIAAAAAAAAXAAAAAAAAABlOZXR3b3JrQWxyZWFkeUluaXRpYWxpemVkAAAAAAAAGAAAAAAAAAARTmV0d29ya0lkTWlzbWF0Y2gAAAAAAAAZAAAAAAAAABVOZXR3b3JrTm90SW5pdGlhbGl6ZWQAAAAAAAAa",
        "AAAAAAAAALdSZWdpc3RlciBhIG5ldyByZXNvdXJjZS4gUHJpY2UgaXMgaW4gVVNEQyBzdHJvb3BzICg2IGRlY2ltYWxzKS4KUmVqZWN0cyBgcHJpY2UgPD0gMGAgKGBJbnZhbGlkUHJpY2VgKSBvciBgcHJpY2UgPiBNQVhfUFJJQ0VgIChgUHJpY2VFeGNlZWRzTWF4YCkuClJlcXVpcmVzIHRoZSBjcmVhdG9yJ3MgYXV0aG9yaXphdGlvbi4AAAAACHJlZ2lzdGVyAAAABQAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAhtZXRhZGF0YQAAABAAAAAAAAAABHRhZ3MAAAPqAAAAEAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAIBSZXBsYWNlIGEgcmVzb3VyY2UncyBkaXNjb3ZlcnkgdGFncy4gT25seSB0aGUgY3JlYXRvciBtYXkgY2FsbCB0aGlzLgpEb2VzIG5vdCBtb2RpZnkgYG1ldGFkYXRhYCAodGhlIG9mZi1jaGFpbiBjb250ZW50IHBvaW50ZXIpLgAAAAhzZXRfdGFncwAAAAIAAAAAAAAAAmlkAAAAAAAQAAAAAAAAAAR0YWdzAAAD6gAAABAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAFFHZXQgdGhlIG93bmVyIGFkZHJlc3Mgb2YgYSByZXNvdXJjZS4gRXJyb3JzIHdpdGggYE5vdEZvdW5kYCBpZiBpdCBkb2VzIG5vdCBleGlzdC4AAAAAAAAJZ2V0X293bmVyAAAAAAAAAQAAAAAAAAACaWQAAAAAABAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAAbVQYWdpbmF0ZWQgY2F0YWxvZyBwYWdlIHdpdGggbmV4dC1jdXJzb3IgbWV0YWRhdGEuCgotIGBjdXJzb3JgIGlzIGEgMC1iYXNlZCBjYXRhbG9nIGluZGV4IChzYW1lIGRvbWFpbiBhcyBgbGlzdGAncyBgc3RhcnRgKS4KLSBgbGltaXRgIGlzIGNhcHBlZCBhdCAyMC4KLSBgbmV4dF9jdXJzb3JgIGlzIGBTb21lKG5leHRfaW5kZXgpYCB3aGVuIG1vcmUgZW50cmllcyBtYXkgZXhpc3QgYWZ0ZXIKdGhpcyBwYWdlLCBvciBgTm9uZWAgYXQgZW5kLW9mLWxpc3QgKGluY2x1ZGluZyBlbXB0eSBjYXRhbG9nIC8gY3Vyc29yCnBhc3QgdGhlIGVuZCkuCi0gRWFjaCBwZXJzaXN0ZW50IGVudHJ5IChJbmRleCBzbG90IGFuZCBSZXNvdXJjZSkgdGhhdCBpcyBzdWNjZXNzZnVsbHkKcmVhZCBoYXMgaXRzIFRUTCBidW1wZWQgdG8ga2VlcCBob3QgY2F0YWxvZyBlbnRyaWVzIGFsaXZlLgAAAAAAAAlsaXN0X3BhZ2UAAAAAAAACAAAAAAAAAAZjdXJzb3IAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAfQAAAAC0NhdGFsb2dQYWdlAA==",
        "AAAAAAAAAOpVcGRhdGUgYSByZXNvdXJjZSdzIHByaWNlLiBSZWplY3RzIGBuZXdfcHJpY2UgPD0gMGAgb3IgYG5ld19wcmljZSA+IE1BWF9QUklDRWAuCk9ubHkgdGhlIGNyZWF0b3IgbWF5IGNhbGwgdGhpcy4KCkVtaXRzIGEgYHNldHByaWNlYCBldmVudCB3aG9zZSBkYXRhIGlzIGEgW2BQcmljZVVwZGF0ZWRgXSB2YWx1ZQpjb250YWluaW5nIGBpZGAsIGBvbGRfcHJpY2VgLCBgbmV3X3ByaWNlYCwgYW5kIGB1cGRhdGVyYC4AAAAAAAlzZXRfcHJpY2UAAAAAAAACAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAAJbmV3X3ByaWNlAAAAAAAACwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACgAAAAEAAAAAAAAACFJlc291cmNlAAAAAQAAABAAAAAAAAAAAAAAAAVDb3VudAAAAAAAAAEAAAAAAAAABUluZGV4AAAAAAAAAQAAAAQAAAAAAAAAAAAAAAVBZG1pbgAAAAAAAAAAAAAAAAAADFBlbmRpbmdBZG1pbgAAAAEAAAAAAAAADENyZWF0b3JUZXJtcwAAAAEAAAATAAAAAQAAAAAAAAAQQ3JlYXRvclJlc291cmNlcwAAAAEAAAATAAAAAQAAAAAAAAAMQ3JlYXRvckNvdW50AAAAAQAAABMAAAABAAAAAAAAAA9QZW5kaW5nVHJhbnNmZXIAAAAAAQAAABAAAAABAAAAAAAAAAhWZXJpZmllcgAAAAEAAAAT",
        "AAAAAAAAALhTZXQgYSByZXNvdXJjZSdzIGNyZWF0b3ItY29udHJvbGxlZCBsaXN0aW5nIHN0YXRlLiBPbmx5CmBMaXN0ZWQgPC0+IERlbGlzdGVkYCB0cmFuc2l0aW9ucyBhcmUgYWNjZXB0ZWQ7IGFsbCBvdGhlciBsaWZlY3ljbGUKc3RhdGVzIHJlamVjdCB0aGlzIG1ldGhvZCB3aXRoIGBJbnZhbGlkTGlmZWN5Y2xlVHJhbnNpdGlvbmAuAAAACnNldF9saXN0ZWQAAAAAAAIAAAAAAAAAAmlkAAAAAAAQAAAAAAAAAAZsaXN0ZWQAAAAAAAEAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAQAAAAAAAAAAAAAACFJlc291cmNlAAAACgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAQU9uY2UgdHJ1ZSwgYHVwZGF0ZV9tZXRhZGF0YWAgcGVybWFuZW50bHkgcmVqZWN0cyBmdXJ0aGVyIGNoYW5nZXMuAAAAAAAABmZyb3plbgAAAAAAAQAAAAAAAAACaWQAAAAAABAAAABEQmFja3dhcmRzLWNvbXBhdGlibGUgcHJvamVjdGlvbiBvZiBgc3RhdGUgPT0gUmVzb3VyY2VTdGF0ZTo6TGlzdGVkYC4AAAAGbGlzdGVkAAAAAAABAAAAAAAAAAhtZXRhZGF0YQAAABAAAAAAAAAABXByaWNlAAAAAAAACwAAAIJFeHBsaWNpdCByZXNvdXJjZSBsaWZlY3ljbGUgc3RhdGUuIFNlZSBgY29udHJhY3QvUkVBRE1FLm1kYCBmb3IgdGhlCnRyYW5zaXRpb24gdGFibGUgYW5kIHRoZSByb2xlIGFsbG93ZWQgdG8gbWFrZSBlYWNoIHRyYW5zaXRpb24uAAAAAAAFc3RhdGUAAAAAAAfQAAAADVJlc291cmNlU3RhdGUAAAAAAACTRGlzY292ZXJ5IGxhYmVscyAoZS5nLiAiZGF0YXNldCIsICJyZXNlYXJjaCIpLiBEaXN0aW5jdCBmcm9tIGBtZXRhZGF0YWAsCndoaWNoIHJlbWFpbnMgdGhlIG9mZi1jaGFpbiBjb250ZW50IGFuY2hvciAoSVBGUyBVUkksIGNvbnRlbnQgaGFzaCwgZXRjLikuAAAAAAR0YWdzAAAD6gAAABAAAAC6TGVkZ2VyIHNlcXVlbmNlIG51bWJlciBhdCB3aGljaCB0aGlzIHJlc291cmNlIHdhcyBsYXN0IHdyaXR0ZW4KKHJlZ2lzdGVyIG9yIGFueSBtdXRhdGlvbikuIENsaWVudHMgY2FuIHVzZSB0aGlzIHRvIGRldGVjdCBzdGFsZW5lc3MKb3Igb3JkZXIgZXZlbnRzIHdpdGhvdXQgdHJ1c3Rpbmcgb2ZmLWNoYWluIHRpbWVzdGFtcHMuAAAAAAAKdXBkYXRlZF9hdAAAAAAABAAAADpPbi1jaGFpbiB2ZXJpZmljYXRpb24gc3RhdHVzLCBzZXR0YWJsZSBvbmx5IGJ5IGEgdmVyaWZpZXIuAAAAAAAIdmVyaWZpZWQAAAfQAAAAElZlcmlmaWNhdGlvblN0YXR1cwAA",
        "AAAAAAAAADRXaGV0aGVyIGBhZGRyZXNzYCBjdXJyZW50bHkgaG9sZHMgdGhlIHZlcmlmaWVyIHJvbGUuAAAAC2lzX3ZlcmlmaWVyAAAAAAEAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAEAAAAB",
        "AAAAAAAAAaFQYWdpbmF0ZWQgbGlzdCBvZiByZXNvdXJjZXMgd2hvc2UgYGxpc3RlZGAgZmxhZyBpcyB0cnVlLCBpbiBpbnNlcnRpb24gb3JkZXIuCgotIFJlc291cmNlcyBhcmUgb3JkZXJlZCBieSByZWdpc3RyYXRpb24gc2VxdWVuY2UuCi0gYGxpbWl0YCBpcyBjYXBwZWQgYXQgYDIwYC4KLSBEZWxpc3RlZCByZXNvdXJjZXMgYXJlIHNraXBwZWQ7IHJlbGlzdGVkIHJlc291cmNlcyB3aWxsIHJlYXBwZWFyLgotIFJldHVybnMgYW4gZW1wdHkgYFZlY2AgaWYgbm8gbGlzdGVkIHJlc291cmNlcyBmYWxsIGluIHJhbmdlLgotIEVhY2ggcGVyc2lzdGVudCBlbnRyeSAoSW5kZXggc2xvdCBhbmQgUmVzb3VyY2UpIHRoYXQgaXMgc3VjY2Vzc2Z1bGx5CnJlYWQgaGFzIGl0cyBUVEwgYnVtcGVkIHRvIGtlZXAgaG90IGNhdGFsb2cgZW50cmllcyBhbGl2ZS4AAAAAAAALbGlzdF9saXN0ZWQAAAAAAgAAAAAAAAAFc3RhcnQAAAAAAAAEAAAAAAAAAAVsaW1pdAAAAAAAAAQAAAABAAAD6gAAB9AAAAAIUmVzb3VyY2U=",
        "AAAAAAAAAGhBY2NlcHQgdGhlIHBlbmRpbmcgYWRtaW4gbm9taW5hdGlvbiBhbmQgYmVjb21lIHRoZSBjb250cmFjdCBhZG1pbi4KT25seSB0aGUgcGVuZGluZyBhZG1pbiBtYXkgY2FsbCB0aGlzLgAAAAxhY2NlcHRfYWRtaW4AAAABAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAALlHcmFudCB0aGUgdmVyaWZpZXIgcm9sZSB0byBgdmVyaWZpZXJgLCBhdXRob3JpemluZyBgc2V0X3ZlcmlmaWNhdGlvbl9zdGF0dXNgLgpPbmx5IHRoZSBhZG1pbiBtYXkgY2FsbCB0aGlzLiBFcnJvcnMgYEFkbWluTm90U2V0YCBpZiBubyBhZG1pbiBoYXMKYmVlbiBzZXQgeWV0IChzZWUgYG5vbWluYXRlX25ld19hZG1pbmApLgAAAAAAAAxhZGRfdmVyaWZpZXIAAAABAAAAAAAAAAh2ZXJpZmllcgAAABMAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAEBQbGFjZSBhbiBhY3RpdmUgcmVzb3VyY2UgdW5kZXIgYW4gYWRtaW4tY29udHJvbGxlZCBkaXNwdXRlIGhvbGQuAAAADG9wZW5fZGlzcHV0ZQAAAAIAAAAAAAAAAmlkAAAAAAAQAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAgZSZWJ1aWxkIHRoZSBwYWdpbmF0aW9uIGluZGV4IChgbGlzdGAvYGxpc3RfcGFnZWAvYGNvdW50YCkgZnJvbSBhbgphdXRob3JpdGF0aXZlLCBhZG1pbi1zdXBwbGllZCBvcmRlcmVkIGxpc3Qgb2YgcmVzb3VyY2UgaWRzLiBPbmx5IHRoZQphZG1pbiBtYXkgY2FsbCB0aGlzLiBFdmVyeSBpZCBtdXN0IGFscmVhZHkgZXhpc3QgYXMgYSByZWdpc3RlcmVkCmBSZXNvdXJjZWAgKGVsc2UgYE5vdEZvdW5kYCkgYW5kIHRoZSBsaXN0IG11c3Qgbm90IGNvbnRhaW4gZHVwbGljYXRlcwooZWxzZSBgRHVwbGljYXRlSW5SZXBhaXJgKS4gTmV2ZXIgdG91Y2hlcyBgUmVzb3VyY2VgIHN0b3JhZ2UgaXRzZWxmIOKAlApvbmx5IHJld3JpdGVzIHRoZSBkZXJpdmVkIGBJbmRleGAvYENvdW50YCBwb2ludGVycywgc28gaXQncyBzYWZlIHRvCnJlLXJ1biB3aXRoIHRoZSBjdXJyZW50IGNvcnJlY3QgaWQgbGlzdCBhcyBhIG5vLW9wLiBTZWUKYGRvY3MvaW5kZXgtcmVwYWlyLm1kYCBmb3IgdGhlIGZ1bGwgcmVwYWlyIHN0cmF0ZWd5LgAAAAAADHJlcGFpcl9pbmRleAAAAAEAAAAAAAAAA2lkcwAAAAPqAAAAEAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAACFQZW5kaW5nIG5vbWluYXRlZCBjb250cmFjdCBhZG1pbi4AAAAAAAANcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAPVEaXNjb3ZlciB0aGlzIHJlZ2lzdHJ5J3Mgc3RhYmxlIGlkZW50aXR5IGFuZCBjYXBhYmlsaXRpZXMgaW4gb25lCnJlYWQtb25seSBjYWxsOiBuYW1lLCBjcmF0ZSB2ZXJzaW9uLCBgUmVzb3VyY2VgIHNjaGVtYSB2ZXJzaW9uLCBhbmQKdGhlIG5ldHdvcmsgdGhpcyBjb250cmFjdCBpcyBkZXBsb3llZCBvbi4gQWx3YXlzIHN1Y2NlZWRzIOKAlCB0aGVyZSBpcwpubyBmYWlsdXJlIG1vZGUgYSBjYWxsZXIgbmVlZHMgdG8gaGFuZGxlLgAAAAAAAA1yZWdpc3RyeV9pbmZvAAAAAAAAAAAAAAEAAAfQAAAADFJlZ2lzdHJ5SW5mbw==",
        "AAAAAQAAAO1PbmUgcGFnZSBvZiB0aGUgb24tY2hhaW4gY2F0YWxvZyBwbHVzIGEgY3Vyc29yIGZvciB0aGUgbmV4dCBwYWdlLgoKYG5leHRfY3Vyc29yYCBpcyB0aGUgY2F0YWxvZyBpbmRleCB0byBwYXNzIGJhY2sgaW50byBgbGlzdGAgLyBgbGlzdF9wYWdlYAphcyBgc3RhcnRgL2BjdXJzb3JgLiBgTm9uZWAgbWVhbnMgZW5kLW9mLWxpc3Qg4oCUIGNsaWVudHMgbXVzdCBub3QgcmVjb21wdXRlCm9mZnNldHMgdGhlbXNlbHZlcy4AAAAAAAAAAAAAC0NhdGFsb2dQYWdlAAAAAAIAAAAAAAAABWl0ZW1zAAAAAAAD6gAAB9AAAAAIUmVzb3VyY2UAAAAAAAAAC25leHRfY3Vyc29yAAAAA+gAAAAE",
        "AAAAAAAAAIJGZXRjaCBhIGNyZWF0b3IncyBtYXJrZXRwbGFjZSB0ZXJtcyBoYXNoLiBFcnJvcnMgd2l0aCBgTm90Rm91bmRgIGlmIGl0IGRvZXMgbm90IGV4aXN0LgpCdW1wcyB0aGUgZW50cnkncyBUVEwgb24gYSBzdWNjZXNzZnVsIHJlYWQuAAAAAAAOZ2V0X3Rlcm1zX2hhc2gAAAAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAEAAAPpAAAAEAAAAAM=",
        "AAAAAAAAACpTdG9yZSBhIGhhc2ggb2YgY3JlYXRvciBtYXJrZXRwbGFjZSB0ZXJtcy4AAAAAAA5zZXRfdGVybXNfaGFzaAAAAAAAAgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAp0ZXJtc19oYXNoAAAAAAAQAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAQAAAPlTdHJ1Y3R1cmVkIHBheWxvYWQgcHVibGlzaGVkIHdpdGggdGhlIGBzZXRwcmljZWAgZXZlbnQuCkluY2x1ZGVzIHRoZSByZXNvdXJjZSBpZCwgdGhlIHByaWNlIGJlZm9yZSBhbmQgYWZ0ZXIgdGhlIHVwZGF0ZSwgYW5kIHRoZQphZGRyZXNzIHRoYXQgYXV0aG9yaXNlZCB0aGUgY2hhbmdlIOKAlCBlbmFibGluZyBpbmRleGVycyB0byByZWNvbmNpbGUgcHJpY2UKaGlzdG9yeSB3aXRob3V0IHJlLXJlYWRpbmcgY29udHJhY3Qgc3RvcmFnZS4AAAAAAAAAAAAADFByaWNlVXBkYXRlZAAAAAQAAAAAAAAAAmlkAAAAAAAQAAAAAAAAAAluZXdfcHJpY2UAAAAAAAALAAAAAAAAAAlvbGRfcHJpY2UAAAAAAAALAAAAAAAAAAd1cGRhdGVyAAAAABM=",
        "AAAAAQAAAMtSZWdpc3RyeSBkaXNjb3ZlcnkgbWV0YWRhdGEgcmV0dXJuZWQgYnkgW2BWYXVsdFJlZ2lzdHJ5OjpyZWdpc3RyeV9pbmZvYF0uCkxldHMgYSBjbGllbnQgZGlzY292ZXIgdGhlIGRlcGxveWVkIHJlZ2lzdHJ5J3MgaWRlbnRpdHkgYW5kIHNoYXBlIHdpdGggYQpzaW5nbGUgcmVhZC1vbmx5IGNhbGwgaW5zdGVhZCBvZiBoYXJkY29kaW5nIGFzc3VtcHRpb25zLgAAAAAAAAAADFJlZ2lzdHJ5SW5mbwAAAAQAAAA3U3RhYmxlLCBodW1hbi1yZWFkYWJsZSByZWdpc3RyeSBuYW1lIChgUkVHSVNUUllfTkFNRWApLgAAAAAEbmFtZQAAABAAAADHTmV0d29yayBwYXNzcGhyYXNlIGRpZ2VzdCBvZiB0aGUgbGVkZ2VyIHRoaXMgY29udHJhY3QgaXMgcnVubmluZyBvbgooYGVudi5sZWRnZXIoKS5uZXR3b3JrX2lkKClgKSwgc28gY2xpZW50cyBjYW4gY29uZmlybSB0aGV5IGFyZQp0YWxraW5nIHRvIHRoZSBuZXR3b3JrIHRoZXkgZXhwZWN0IHdpdGhvdXQgYSBoYXJkY29kZWQgY29uZmlnIHZhbHVlLgAAAAAKbmV0d29ya19pZAAAAAAD7gAAACAAAABGVmVyc2lvbiBvZiB0aGUgb24tY2hhaW4gYFJlc291cmNlYCBzY2hlbWEgKGBSRVNPVVJDRV9TQ0hFTUFfVkVSU0lPTmApLgAAAAAAF3Jlc291cmNlX3NjaGVtYV92ZXJzaW9uAAAAAAQAAAA7Q29udHJhY3QgY3JhdGUgdmVyc2lvbiAoYENBUkdPX1BLR19WRVJTSU9OYCBhdCBidWlsZCB0aW1lKS4AAAAAB3ZlcnNpb24AAAAAEA==",
        "AAAAAAAAAEFBY2NlcHQgYSBwcm9wb3NlZCB0cmFuc2Zlci4gT25seSB0aGUgcGVuZGluZyBvd25lciBjYW4gY2FsbCB0aGlzLgAAAAAAAA9hY2NlcHRfdHJhbnNmZXIAAAAAAQAAAAAAAAACaWQAAAAAABAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAEFDYW5jZWwgYSBwcm9wb3NlZCB0cmFuc2Zlci4gT25seSB0aGUgY3VycmVudCBvd25lciBjYW4gY2FsbCB0aGlzLgAAAAAAAA9jYW5jZWxfdHJhbnNmZXIAAAAAAQAAAAAAAAACaWQAAAAAABAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAM1QZXJtYW5lbnRseSBmcmVlemUgYSByZXNvdXJjZSdzIG1ldGFkYXRhIHBvaW50ZXIuIE9ubHkgdGhlIGNyZWF0b3IgbWF5CmNhbGwgdGhpcy4gSXJyZXZlcnNpYmxlIOKAlCBlcnJvcnMgYEFscmVhZHlGcm96ZW5gIGlmIGNhbGxlZCB0d2ljZS4KUHJpY2UsIGxpc3RpbmcsIHRhZ3MsIGFuZCBvd25lcnNoaXAgcmVtYWluIG11dGFibGUgYWZ0ZXIgZnJlZXppbmcuAAAAAAAAD2ZyZWV6ZV9tZXRhZGF0YQAAAAABAAAAAAAAAAJpZAAAAAAAEAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAANFGcmVlemUgYW4gb3RoZXJ3aXNlIGFjdGl2ZSByZXNvdXJjZS4gVGhlIGNyZWF0b3IgbWF5IGZyZWV6ZSBhIGxpc3RlZCBvcgpkZWxpc3RlZCByZXNvdXJjZSwgYnV0IG9ubHkgYW4gYWRtaW4gY2FuIHJlc3RvcmUgaXQgdGhyb3VnaCBkaXNwdXRlCnJlc29sdXRpb24uIFRoaXMgbGlmZWN5Y2xlIGZyZWV6ZSBpcyBzZXBhcmF0ZSBmcm9tIGBmcmVlemVfbWV0YWRhdGFgLgAAAAAAAA9mcmVlemVfcmVzb3VyY2UAAAAAAQAAAAAAAAACaWQAAAAAABAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAV5QYWdpbmF0ZWQgbGlzdGluZyBvZiByZXNvdXJjZXMgb3duZWQgYnkgYGNyZWF0b3JgIGluIGluc2VydGlvbiBvcmRlci4KCi0gUmVzdWx0cyBhcmUgb3JkZXJlZCBieSBnbG9iYWwgcmVnaXN0cmF0aW9uIHNlcXVlbmNlIGZvciB0aGF0IGNyZWF0b3IuCi0gYGxpbWl0YCBpcyBjYXBwZWQgYXQgYDIwYC4KLSBSZXR1cm5zIGVtcHR5IGBWZWNgIHdoZW4gYHN0YXJ0YCBpcyBiZXlvbmQgdGhlIGNyZWF0b3IncyBrbm93biBpdGVtcy4KLSBFYWNoIHBlcnNpc3RlbnQgUmVzb3VyY2UgZW50cnkgdGhhdCBpcyBzdWNjZXNzZnVsbHkgcmVhZCBoYXMgaXRzIFRUTApidW1wZWQgdG8ga2VlcCBob3QgcmVzb3VyY2VzIGFsaXZlLgAAAAAAD2xpc3RfYnlfY3JlYXRvcgAAAAADAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAABXN0YXJ0AAAAAAAABAAAAAAAAAAFbGltaXQAAAAAAAAEAAAAAQAAA+oAAAfQAAAACFJlc291cmNl",
        "AAAAAAAAAEdSZXZva2UgdGhlIHZlcmlmaWVyIHJvbGUgZnJvbSBgdmVyaWZpZXJgLiBPbmx5IHRoZSBhZG1pbiBtYXkgY2FsbCB0aGlzLgAAAAAPcmVtb3ZlX3ZlcmlmaWVyAAAAAAEAAAAAAAAACHZlcmlmaWVyAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAEFSZXNvbHZlIGEgZGlzcHV0ZWQgcmVzb3VyY2UgdG8gYExpc3RlZGAsIGBEZWxpc3RlZGAsIG9yIGBGcm96ZW5gLgAAAAAAAA9yZXNvbHZlX2Rpc3B1dGUAAAAAAwAAAAAAAAACaWQAAAAAABAAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFc3RhdGUAAAAAAAfQAAAADVJlc291cmNlU3RhdGUAAAAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAT5VcGRhdGUgYSByZXNvdXJjZSdzIG1ldGFkYXRhIHBvaW50ZXIuIE9ubHkgdGhlIGNyZWF0b3IgbWF5IGNhbGwgdGhpcy4KCkVtaXRzIGEgW2BNZXRhZGF0YVVwZGF0ZUV2ZW50YF0gY29udGFpbmluZyB0aGUgcmVzb3VyY2UgaWQsIHRoZSBwcmV2aW91cwptZXRhZGF0YSBwb2ludGVyIChgb2xkX21ldGFkYXRhYCksIGFuZCB0aGUgbmV3IG9uZSAoYG5ld19tZXRhZGF0YWApLgpPZmYtY2hhaW4gaW5kZXhlcnMgY2FuIHVzZSB0aGVzZSBmaWVsZHMgdG8gYnVpbGQgYW4gYXVkaXQgdHJhaWwgd2l0aG91dApxdWVyeWluZyBoaXN0b3JpY2FsIGxlZGdlciBzdGF0ZS4AAAAAAA91cGRhdGVfbWV0YWRhdGEAAAAAAgAAAAAAAAACaWQAAAAAABAAAAAAAAAACG1ldGFkYXRhAAAAEAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAgAAAT5UaGUgYXZhaWxhYmlsaXR5IGFuZCBtb2RlcmF0aW9uIHN0YXRlIG9mIGEgcmVzb3VyY2UuCgpgbGlzdGVkYCByZW1haW5zIG9uIFtgUmVzb3VyY2VgXSBhcyBhIGJhY2t3YXJkcy1jb21wYXRpYmxlIHByb2plY3Rpb246IGl0CmlzIHRydWUgZXhhY3RseSB3aGVuIHRoaXMgdmFsdWUgaXMgW2BSZXNvdXJjZVN0YXRlOjpMaXN0ZWRgXS4gQ2xpZW50cyB0aGF0Cm5lZWQgdG8gZGlzdGluZ3Vpc2ggYSBtb2RlcmF0aW9uIGhvbGQgZnJvbSBhIGNyZWF0b3IgZGVsaXN0IG11c3QgdXNlIHRoaXMKZmllbGQgcmF0aGVyIHRoYW4gdGhlIGJvb2xlYW4gcHJvamVjdGlvbi4AAAAAAAAAAAANUmVzb3VyY2VTdGF0ZQAAAAAAAAUAAAAAAAAAAAAAAAZMaXN0ZWQAAAAAAAAAAAAAAAAACERlbGlzdGVkAAAAAAAAAAAAAAAGRnJvemVuAAAAAAAAAAAAAAAAAAhEaXNwdXRlZAAAAAAAAAAAAAAAClRvbWJzdG9uZWQAAA==",
        "AAAAAAAAAnxSZXR1cm4gdGhlIGNvbnRyYWN0IGNyYXRlIHZlcnNpb24gYW5kIHRoZSBgUmVzb3VyY2VgIHNjaGVtYSB2ZXJzaW9uIGFzIGEKc3RhYmxlLCBjb21wYWN0IHN0cnVjdC4gRGVwbG95bWVudCBzY3JpcHRzIGFuZCB1cGdyYWRlIHRvb2xzIHNob3VsZCBjYWxsCnRoaXMgdG8gY29uZmlybSB3aGljaCB2ZXJzaW9uIG9mIHRoZSBjb250cmFjdCBpcyBydW5uaW5nIG9uLWNoYWluIGJlZm9yZQphbmQgYWZ0ZXIgYSByZWRlcGxveSwgd2l0aG91dCBuZWVkaW5nIHRvIHBhcnNlIHRoZSBmdWxsIGByZWdpc3RyeV9pbmZvYApyZXNwb25zZS4KClVwZ3JhZGUgY29tcGF0aWJpbGl0eTogYGNyYXRlX3ZlcnNpb25gIGlzIHRoZSBDYXJnbyBzZW12ZXIgc3RyaW5nIGJha2VkCmluIGF0IGJ1aWxkIHRpbWUgKGBDQVJHT19QS0dfVkVSU0lPTmApLiBgcmVzb3VyY2Vfc2NoZW1hX3ZlcnNpb25gIGlzIGFuCmludGVnZXIgYnVtcGVkIG9ubHkgd2hlbiB0aGUgb24tY2hhaW4gYFJlc291cmNlYCBzdHJ1Y3QgY2hhbmdlcyBpbiBhIHdheQp0aGF0IHJlcXVpcmVzIGNhbGxlcnMgdG8gdXBkYXRlIGhvdyB0aGV5IGRlY29kZSBpdC4gQSBjaGFuZ2UgdG8KYGNyYXRlX3ZlcnNpb25gIGFsb25lIGRvZXMgbm90IGltcGx5IGEgc2NoZW1hIGNoYW5nZS4AAAAQY29udHJhY3RfdmVyc2lvbgAAAAAAAAABAAAH0AAAAA9Db250cmFjdFZlcnNpb24A",
        "AAAAAAAAAEBQcm9wb3NlIGEgdHJhbnNmZXIgdG8gYSBuZXcgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBhY2NlcHQgaXQuAAAAEHByb3Bvc2VfdHJhbnNmZXIAAAACAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAALbmV3X2NyZWF0b3IAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAQAAAWdDb21wYWN0IHZlcnNpb24gc3RydWN0IHJldHVybmVkIGJ5IFtgVmF1bHRSZWdpc3RyeTo6Y29udHJhY3RfdmVyc2lvbmBdLgoKRGVwbG95bWVudCBzY3JpcHRzIGFuZCB1cGdyYWRlIHRvb2xpbmcgc2hvdWxkIGNhbGwgYGNvbnRyYWN0X3ZlcnNpb25gCmJlZm9yZSBhbmQgYWZ0ZXIgYSByZWRlcGxveSB0byBjb25maXJtIHdoaWNoIGJ1aWxkIGlzIHJ1bm5pbmcgb24tY2hhaW4uCk9ubHkgYHJlc291cmNlX3NjaGVtYV92ZXJzaW9uYCBpcyByZWxldmFudCB0byB3aGV0aGVyIGNhbGxlcnMgbXVzdCB1cGRhdGUKdGhlaXIgYFJlc291cmNlYCBkZWNvZGluZyBsb2dpYzsgYSBgY3JhdGVfdmVyc2lvbmAgYnVtcCBhbG9uZSBpcyBzYWZlLgAAAAAAAAAAD0NvbnRyYWN0VmVyc2lvbgAAAAACAAAAQUNhcmdvIHNlbXZlciBzdHJpbmcgYmFrZWQgaW4gYXQgYnVpbGQgdGltZSAoYENBUkdPX1BLR19WRVJTSU9OYCkuAAAAAAAADWNyYXRlX3ZlcnNpb24AAAAAAAAQAAAAhE9uLWNoYWluIGBSZXNvdXJjZWAgc2NoZW1hIHZlcnNpb24gKGBSRVNPVVJDRV9TQ0hFTUFfVkVSU0lPTmApLgpCdW1wIHRoaXMgb25seSB3aGVuIHRoZSBgUmVzb3VyY2VgIHN0cnVjdCBjaGFuZ2VzIGluIGEgYnJlYWtpbmcgd2F5LgAAABdyZXNvdXJjZV9zY2hlbWFfdmVyc2lvbgAAAAAE",
        "AAAAAAAAAItSZXR1cm4gdGhlIGluaXRpYWxpemVkIG5ldHdvcmsgaWRlbnRpZmllci4gQ2FsbGVycyBjYW4gdXNlIHRoaXMgdmFsdWUKYXMgYSBkZXBsb3ltZW50IGd1YXJkIGJlZm9yZSBzdWJtaXR0aW5nIG5ldHdvcmstc2Vuc2l0aXZlIG9wZXJhdGlvbnMuAAAAAApuZXR3b3JrX2lkAAAAAAAAAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAAMhTdG9yZSB0aGUgaW50ZW5kZWQgbmV0d29yayBpZGVudGlmaWVyIG9uY2UuIFRoZSBzdXBwbGllZCBJRCBtdXN0IG1hdGNoCnRoZSBsZWRnZXIgdGhpcyBjb250cmFjdCBpcyBleGVjdXRpbmcgb24sIHByZXZlbnRpbmcgYSBkZXBsb3ltZW50CnNjcmlwdCBmcm9tIGFjY2lkZW50YWxseSByZWNvcmRpbmcgYSBkaWZmZXJlbnQgU3RlbGxhciBuZXR3b3JrLgAAABJpbml0aWFsaXplX25ldHdvcmsAAAAAAAEAAAAAAAAACm5ldHdvcmtfaWQAAAAAA+4AAAAgAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAKxOb21pbmF0ZSBhIG5ldyBjb250cmFjdCBhZG1pbi4gT25seSB0aGUgY3VycmVudCBhZG1pbiBtYXkgY2FsbCB0aGlzLgpTZXRzIGBwZW5kaW5nX2FkbWluYC4gVGhlIG5vbWluYXRpb24gZG9lcyBub3QgdGFrZSBlZmZlY3QgdW50aWwKdGhlIHBlbmRpbmcgYWRtaW4gY2FsbHMgYGFjY2VwdF9hZG1pbmAuAAAAEm5vbWluYXRlX25ld19hZG1pbgAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAHBQZXJtYW5lbnRseSByZXRpcmUgYSByZXNvdXJjZS4gT25seSBhbiBhZG1pbiBtYXkgdG9tYnN0b25lIGl0OyB0aGUKdG9tYnN0b25lZCBzdGF0ZSBoYXMgbm8gb3V0Z29pbmcgdHJhbnNpdGlvbnMuAAAAEnRvbWJzdG9uZV9yZXNvdXJjZQAAAAAAAgAAAAAAAAACaWQAAAAAABAAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAALbmV3X2NyZWF0b3IAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAgAAAIpPbi1jaGFpbiBtaXJyb3Igb2YgdGhlIHNlcnZlcidzIG9mZi1jaGFpbiB2ZXJpZmljYXRpb24gcmVzdWx0LiBTZXR0YWJsZQpvbmx5IGJ5IGFuIGFkZHJlc3MgaG9sZGluZyB0aGUgdmVyaWZpZXIgcm9sZSAoc2VlIGBhZGRfdmVyaWZpZXJgKS4AAAAAAAAAAAASVmVyaWZpY2F0aW9uU3RhdHVzAAAAAAADAAAAAAAAAAAAAAAHUGVuZGluZwAAAAAAAAAAAAAAAAhWZXJpZmllZAAAAAAAAAAAAAAACFJlamVjdGVk",
        "AAAAAQAAAOtFdmVudCBkYXRhIGVtaXR0ZWQgd2hlbiBhIHJlc291cmNlJ3MgbWV0YWRhdGEgcG9pbnRlciBpcyB1cGRhdGVkLgpDYXJyaWVzIHRoZSByZXNvdXJjZSBpZCwgdGhlIHByZXZpb3VzIG1ldGFkYXRhIHBvaW50ZXIsIGFuZCB0aGUgbmV3IG9uZQpzbyB0aGF0IG9mZi1jaGFpbiBpbmRleGVycyBjYW4gYnVpbGQgYSBmdWxsIGF1ZGl0IHRyYWlsIHdpdGhvdXQgcXVlcnlpbmcKaGlzdG9yaWNhbCBsZWRnZXIgc3RhdGUuAAAAAAAAAAATTWV0YWRhdGFVcGRhdGVFdmVudAAAAAADAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAAMbmV3X21ldGFkYXRhAAAAEAAAAAAAAAAMb2xkX21ldGFkYXRhAAAAEA==",
        "AAAAAAAAAJ5OdW1iZXIgb2YgcmVzb3VyY2VzIGN1cnJlbnRseSBvd25lZCBieSBgY3JlYXRvcmAgKG1vdmVzIHdpdGgKYHRyYW5zZmVyX293bmVyc2hpcGAvYGFjY2VwdF90cmFuc2ZlcmA7IHVucmVsYXRlZCB0byB0aGUgbW9ub3RvbmljLApuZXZlci1kZWNyZW1lbnRlZCBgY291bnQoKWApLgAAAAAAFmNyZWF0b3JfcmVzb3VyY2VfY291bnQAAAAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAEAAAAE",
        "AAAAAAAAAVRVcGRhdGUgYSByZXNvdXJjZSdzIG9uLWNoYWluIHZlcmlmaWNhdGlvbiBzdGF0dXMuIE9ubHkgYW4gYWRkcmVzcwpjdXJyZW50bHkgaG9sZGluZyB0aGUgdmVyaWZpZXIgcm9sZSAoc2VlIGBhZGRfdmVyaWZpZXJgKSBtYXkgY2FsbAp0aGlzLiBPbmx5IGBQZW5kaW5nIC0+IFZlcmlmaWVkYCwgYFBlbmRpbmcgLT4gUmVqZWN0ZWRgLApgVmVyaWZpZWQgLT4gUmVqZWN0ZWRgLCBhbmQgYFJlamVjdGVkIC0+IFZlcmlmaWVkYCBhcmUgYWxsb3dlZDsKc2VsZi10cmFuc2l0aW9ucyBhbmQgcmV2ZXJ0aW5nIHRvIGBQZW5kaW5nYCBlcnJvciB3aXRoCmBJbnZhbGlkVmVyaWZpY2F0aW9uVHJhbnNpdGlvbmAuAAAAF3NldF92ZXJpZmljYXRpb25fc3RhdHVzAAAAAAMAAAAAAAAAAmlkAAAAAAAQAAAAAAAAAAh2ZXJpZmllcgAAABMAAAAAAAAABnN0YXR1cwAAAAAH0AAAABJWZXJpZmljYXRpb25TdGF0dXMAAAAAAAEAAAPpAAAD7QAAAAAAAAAD",
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    get: this.txFromJSON<Result<Resource>>,
    list: this.txFromJSON<Array<Resource>>,
    admin: this.txFromJSON<Option<string>>,
    count: this.txFromJSON<u32>,
    delist: this.txFromJSON<Result<void>>,
    exists: this.txFromJSON<boolean>,
    register: this.txFromJSON<Result<void>>,
    set_tags: this.txFromJSON<Result<void>>,
    get_owner: this.txFromJSON<Result<string>>,
    list_page: this.txFromJSON<CatalogPage>,
    set_price: this.txFromJSON<Result<void>>,
    network_id: this.txFromJSON<Result<Buffer>>,
    set_listed: this.txFromJSON<Result<void>>,
    is_verifier: this.txFromJSON<boolean>,
    list_listed: this.txFromJSON<Array<Resource>>,
    accept_admin: this.txFromJSON<Result<void>>,
    add_verifier: this.txFromJSON<Result<void>>,
    open_dispute: this.txFromJSON<Result<void>>,
    repair_index: this.txFromJSON<Result<void>>,
    pending_admin: this.txFromJSON<Option<string>>,
    registry_info: this.txFromJSON<RegistryInfo>,
    get_terms_hash: this.txFromJSON<Result<string>>,
    set_terms_hash: this.txFromJSON<Result<void>>,
    accept_transfer: this.txFromJSON<Result<void>>,
    cancel_transfer: this.txFromJSON<Result<void>>,
    freeze_metadata: this.txFromJSON<Result<void>>,
    freeze_resource: this.txFromJSON<Result<void>>,
    list_by_creator: this.txFromJSON<Array<Resource>>,
    remove_verifier: this.txFromJSON<Result<void>>,
    resolve_dispute: this.txFromJSON<Result<void>>,
    update_metadata: this.txFromJSON<Result<void>>,
    contract_version: this.txFromJSON<ContractVersion>,
    propose_transfer: this.txFromJSON<Result<void>>,
    initialize_network: this.txFromJSON<Result<void>>,
    nominate_new_admin: this.txFromJSON<Result<void>>,
    tombstone_resource: this.txFromJSON<Result<void>>,
    transfer_ownership: this.txFromJSON<Result<void>>,
    creator_resource_count: this.txFromJSON<u32>,
    set_verification_status: this.txFromJSON<Result<void>>,
  };
}
