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
};

export type DataKey =
  | { tag: "Resource"; values: readonly [string] }
  | { tag: "Count"; values: void };

export interface Resource {
  creator: string;
  id: string;
  listed: boolean;
  metadata: string;
  price: i128;
  /**
   * Discovery labels (e.g. "dataset", "research"). Distinct from `metadata`,
   * which remains the off-chain content anchor (IPFS URI, content hash, etc.).
   */
  tags: Array<string>;
}

export interface Client {
  /**
   * Construct and simulate a get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a resource. Errors with `NotFound` if it does not exist.
   */
  get: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<Resource>>>;

  /**
   * Construct and simulate a count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Total number of resources ever registered.
   */
  count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a delist transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Delist a resource (convenience method for set_listed(false)). Only the creator may call this.
   */
  delist: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a exists transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether a resource with `id` is registered.
   */
  exists: (
    { id }: { id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<boolean>>;

  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a new resource. Errors if `id` already exists or `price <= 0`.
   * Requires the creator's authorization.
   */
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

  /**
   * Construct and simulate a set_tags transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace a resource's discovery tags. Only the creator may call this.
   * Does not modify `metadata` (the off-chain content pointer).
   */
  set_tags: (
    { id, tags }: { id: string; tags: Array<string> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update a resource's price. Only the creator may call this.
   */
  set_price: (
    { id, new_price }: { id: string; new_price: i128 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a set_listed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set the listing state of a resource. Only the creator may call this.
   */
  set_listed: (
    { id, listed }: { id: string; listed: boolean },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a update_metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update a resource's metadata pointer. Only the creator may call this.
   */
  update_metadata: (
    { id, metadata }: { id: string; metadata: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;

  /**
   * Construct and simulate a transfer_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Hand ownership to a new creator. Only the current creator may call this.
   */
  transfer_ownership: (
    { id, new_creator }: { id: string; new_creator: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Result<void>>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        "AAAAAAAAAD5GZXRjaCBhIHJlc291cmNlLiBFcnJvcnMgd2l0aCBgTm90Rm91bmRgIGlmIGl0IGRvZXMgbm90IGV4aXN0LgAAAAAAA2dldAAAAAABAAAAAAAAAAJpZAAAAAAAEAAAAAEAAAPpAAAH0AAAAAhSZXNvdXJjZQAAAAM=",
        "AAAAAAAAACpUb3RhbCBudW1iZXIgb2YgcmVzb3VyY2VzIGV2ZXIgcmVnaXN0ZXJlZC4AAAAAAAVjb3VudAAAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAF1EZWxpc3QgYSByZXNvdXJjZSAoY29udmVuaWVuY2UgbWV0aG9kIGZvciBzZXRfbGlzdGVkKGZhbHNlKSkuIE9ubHkgdGhlIGNyZWF0b3IgbWF5IGNhbGwgdGhpcy4AAAAAAAAGZGVsaXN0AAAAAAABAAAAAAAAAAJpZAAAAAAAEAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAACtXaGV0aGVyIGEgcmVzb3VyY2Ugd2l0aCBgaWRgIGlzIHJlZ2lzdGVyZWQuAAAAAAZleGlzdHMAAAAAAAEAAAAAAAAAAmlkAAAAAAAQAAAAAQAAAAE=",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAARQWxyZWFkeVJlZ2lzdGVyZWQAAAAAAAABAAAAAAAAAAhOb3RGb3VuZAAAAAIAAAAAAAAADEludmFsaWRQcmljZQAAAAMAAAAAAAAACkludmFsaWRUYWcAAAAAAAQ=",
        "AAAAAAAAAG1SZWdpc3RlciBhIG5ldyByZXNvdXJjZS4gRXJyb3JzIGlmIGBpZGAgYWxyZWFkeSBleGlzdHMgb3IgYHByaWNlIDw9IDBgLgpSZXF1aXJlcyB0aGUgY3JlYXRvcidzIGF1dGhvcml6YXRpb24uAAAAAAAACHJlZ2lzdGVyAAAABQAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAhtZXRhZGF0YQAAABAAAAAAAAAABHRhZ3MAAAPqAAAAEAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAIBSZXBsYWNlIGEgcmVzb3VyY2UncyBkaXNjb3ZlcnkgdGFncy4gT25seSB0aGUgY3JlYXRvciBtYXkgY2FsbCB0aGlzLgpEb2VzIG5vdCBtb2RpZnkgYG1ldGFkYXRhYCAodGhlIG9mZi1jaGFpbiBjb250ZW50IHBvaW50ZXIpLgAAAAhzZXRfdGFncwAAAAIAAAAAAAAAAmlkAAAAAAAQAAAAAAAAAAR0YWdzAAAD6gAAABAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAADpVcGRhdGUgYSByZXNvdXJjZSdzIHByaWNlLiBPbmx5IHRoZSBjcmVhdG9yIG1heSBjYWxsIHRoaXMuAAAAAAAJc2V0X3ByaWNlAAAAAAAAAgAAAAAAAAACaWQAAAAAABAAAAAAAAAACW5ld19wcmljZQAAAAAAAAsAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAEAAAAAAAAACFJlc291cmNlAAAAAQAAABAAAAAAAAAAAAAAAAVDb3VudAAAAA==",
        "AAAAAAAAAERTZXQgdGhlIGxpc3Rpbmcgc3RhdGUgb2YgYSByZXNvdXJjZS4gT25seSB0aGUgY3JlYXRvciBtYXkgY2FsbCB0aGlzLgAAAApzZXRfbGlzdGVkAAAAAAACAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAAGbGlzdGVkAAAAAAABAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAQAAAAAAAAAAAAAACFJlc291cmNlAAAABgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAAGbGlzdGVkAAAAAAABAAAAAAAAAAhtZXRhZGF0YQAAABAAAAAAAAAABXByaWNlAAAAAAAACwAAAJNEaXNjb3ZlcnkgbGFiZWxzIChlLmcuICJkYXRhc2V0IiwgInJlc2VhcmNoIikuIERpc3RpbmN0IGZyb20gYG1ldGFkYXRhYCwKd2hpY2ggcmVtYWlucyB0aGUgb2ZmLWNoYWluIGNvbnRlbnQgYW5jaG9yIChJUEZTIFVSSSwgY29udGVudCBoYXNoLCBldGMuKS4AAAAABHRhZ3MAAAPqAAAAEA==",
        "AAAAAAAAAEVVcGRhdGUgYSByZXNvdXJjZSdzIG1ldGFkYXRhIHBvaW50ZXIuIE9ubHkgdGhlIGNyZWF0b3IgbWF5IGNhbGwgdGhpcy4AAAAAAAAPdXBkYXRlX21ldGFkYXRhAAAAAAIAAAAAAAAAAmlkAAAAAAAQAAAAAAAAAAhtZXRhZGF0YQAAABAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAEhIYW5kIG93bmVyc2hpcCB0byBhIG5ldyBjcmVhdG9yLiBPbmx5IHRoZSBjdXJyZW50IGNyZWF0b3IgbWF5IGNhbGwgdGhpcy4AAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAALbmV3X2NyZWF0b3IAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    get: this.txFromJSON<Result<Resource>>,
    count: this.txFromJSON<u32>,
    delist: this.txFromJSON<Result<void>>,
    exists: this.txFromJSON<boolean>,
    register: this.txFromJSON<Result<void>>,
    set_tags: this.txFromJSON<Result<void>>,
    set_price: this.txFromJSON<Result<void>>,
    set_listed: this.txFromJSON<Result<void>>,
    update_metadata: this.txFromJSON<Result<void>>,
    transfer_ownership: this.txFromJSON<Result<void>>,
  };
}
