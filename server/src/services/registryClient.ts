import { Keypair, Networks, contract } from "@stellar/stellar-sdk";
import { config } from "../config.js";

const NETWORK_PASSPHRASE =
  config.NETWORK === "stellar:testnet"
    ? Networks.TESTNET
    : Networks.PUBLIC;

const keypair = Keypair.fromSecret(config.REGISTRY_SECRET_KEY);

const clientOptions: contract.ClientOptions = {
  contractId: config.REGISTRY_CONTRACT_ID,
  networkPassphrase: NETWORK_PASSPHRASE,
  rpcUrl: config.SOROBAN_RPC_URL,
  publicKey: keypair.publicKey(),
  ...contract.basicNodeSigner(keypair, NETWORK_PASSPHRASE),
};

export const registryClient = await contract.Client.from(clientOptions);

export { NETWORK_PASSPHRASE, keypair as registryKeypair };
