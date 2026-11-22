import { createRegistryClient, type RegistryClientOptions } from "@mindvault/registry-client";
import { rpc } from "@stellar/stellar-sdk";
import { limitRpcServer } from "./upstreamConcurrency.js";

export function createLimitedRegistryClient(options: RegistryClientOptions) {
  const server = options.server ?? limitRpcServer(new rpc.Server(options.rpcUrl));
  return createRegistryClient({ ...options, server });
}
