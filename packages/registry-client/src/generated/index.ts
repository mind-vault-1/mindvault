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


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4",
  }
} as const


export interface Resource {
  creator: string;
  id: string;
  metadata: string;
  price: i128;
}

export type DataKey = {tag: "Resource", values: readonly [string]} | {tag: "Count", values: void};

export const Errors = {
  1: {message:"AlreadyRegistered"},
  2: {message:"NotFound"},
  3: {message:"InvalidPrice"}
}

export interface Client {
  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register a new resource. Errors if `id` already exists or `price <= 0`.
   * Requires the creator's authorization.
   */
  register: ({creator, id, price, metadata}: {creator: string, id: string, price: i128, metadata: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update a resource's price. Only the creator may call this.
   */
  set_price: ({id, new_price}: {id: string, new_price: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a update_metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update a resource's metadata pointer. Only the creator may call this.
   */
  update_metadata: ({id, metadata}: {id: string, metadata: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a transfer_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Hand ownership to a new creator. Only the current creator may call this.
   */
  transfer_ownership: ({id, new_creator}: {id: string, new_creator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a resource. Errors with `NotFound` if it does not exist.
   */
  get: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Resource>>>

  /**
   * Construct and simulate a exists transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether a resource with `id` is registered.
   */
  exists: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Total number of resources ever registered.
   */
  count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

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
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAACFJlc291cmNlAAAABAAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAAIbWV0YWRhdGEAAAAQAAAAAAAAAAVwcmljZQAAAAAAAAs=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAEAAAAAAAAACFJlc291cmNlAAAAAQAAABAAAAAAAAAAAAAAAAVDb3VudAAAAA==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAAwAAAAAAAAARQWxyZWFkeVJlZ2lzdGVyZWQAAAAAAAABAAAAAAAAAAhOb3RGb3VuZAAAAAIAAAAAAAAADEludmFsaWRQcmljZQAAAAM=",
        "AAAAAAAAAG1SZWdpc3RlciBhIG5ldyByZXNvdXJjZS4gRXJyb3JzIGlmIGBpZGAgYWxyZWFkeSBleGlzdHMgb3IgYHByaWNlIDw9IDBgLgpSZXF1aXJlcyB0aGUgY3JlYXRvcidzIGF1dGhvcml6YXRpb24uAAAAAAAACHJlZ2lzdGVyAAAABAAAAAAAAAAHY3JlYXRvcgAAAAATAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAhtZXRhZGF0YQAAABAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAADpVcGRhdGUgYSByZXNvdXJjZSdzIHByaWNlLiBPbmx5IHRoZSBjcmVhdG9yIG1heSBjYWxsIHRoaXMuAAAAAAAJc2V0X3ByaWNlAAAAAAAAAgAAAAAAAAACaWQAAAAAABAAAAAAAAAACW5ld19wcmljZQAAAAAAAAsAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAEVVcGRhdGUgYSByZXNvdXJjZSdzIG1ldGFkYXRhIHBvaW50ZXIuIE9ubHkgdGhlIGNyZWF0b3IgbWF5IGNhbGwgdGhpcy4AAAAAAAAPdXBkYXRlX21ldGFkYXRhAAAAAAIAAAAAAAAAAmlkAAAAAAAQAAAAAAAAAAhtZXRhZGF0YQAAABAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAEhIYW5kIG93bmVyc2hpcCB0byBhIG5ldyBjcmVhdG9yLiBPbmx5IHRoZSBjdXJyZW50IGNyZWF0b3IgbWF5IGNhbGwgdGhpcy4AAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAJpZAAAAAAAEAAAAAAAAAALbmV3X2NyZWF0b3IAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAD5GZXRjaCBhIHJlc291cmNlLiBFcnJvcnMgd2l0aCBgTm90Rm91bmRgIGlmIGl0IGRvZXMgbm90IGV4aXN0LgAAAAAAA2dldAAAAAABAAAAAAAAAAJpZAAAAAAAEAAAAAEAAAPpAAAH0AAAAAhSZXNvdXJjZQAAAAM=",
        "AAAAAAAAACtXaGV0aGVyIGEgcmVzb3VyY2Ugd2l0aCBgaWRgIGlzIHJlZ2lzdGVyZWQuAAAAAAZleGlzdHMAAAAAAAEAAAAAAAAAAmlkAAAAAAAQAAAAAQAAAAE=",
        "AAAAAAAAACpUb3RhbCBudW1iZXIgb2YgcmVzb3VyY2VzIGV2ZXIgcmVnaXN0ZXJlZC4AAAAAAAVjb3VudAAAAAAAAAAAAAABAAAABA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    register: this.txFromJSON<Result<void>>,
        set_price: this.txFromJSON<Result<void>>,
        update_metadata: this.txFromJSON<Result<void>>,
        transfer_ownership: this.txFromJSON<Result<void>>,
        get: this.txFromJSON<Result<Resource>>,
        exists: this.txFromJSON<boolean>,
        count: this.txFromJSON<u32>
  }
}