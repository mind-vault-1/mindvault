import { Keypair, TransactionBuilder, Networks, xdr, Contract, Address, rpc } from "@stellar/stellar-sdk";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { resources } from "../db/schema.js";
import { eq } from "drizzle-orm";

const RPC_URL = config.NETWORK.includes("testnet") 
  ? "https://soroban-testnet.stellar.org" 
  : "https://mainnet.stellar.org:443";
const server = new rpc.Server(RPC_URL);

export async function registerResourceOnchain(resourceId: string) {
  const [resource] = await db
    .select()
    .from(resources)
    .where(eq(resources.id, resourceId));

  if (!resource) {
    throw new Error(`Resource ${resourceId} not found`);
  }

  if (!config.REGISTRY_CONTRACT_ID) {
    console.warn("REGISTRY_CONTRACT_ID not configured, skipping onchain registration");
    return;
  }

  // Update status to pending if not already
  await db
    .update(resources)
    .set({ onchainStatus: "pending" })
    .where(eq(resources.id, resourceId));

  try {
    const agentKeypair = Keypair.fromSecret(config.AGENT_SECRET_KEY);
    const agentAddress = agentKeypair.publicKey();
    
    const account = await server.getAccount(agentAddress);
    const contract = new Contract(config.REGISTRY_CONTRACT_ID);

    // Prepare the register call
    // register(creator: Address, id: String, price: i128, metadata: String)
    // We use the platform agent as the creator for now since we have their keys.
    const tx = new TransactionBuilder(account, {
      fee: "10000",
      networkPassphrase: config.NETWORK.includes("testnet") 
        ? Networks.TESTNET 
        : Networks.PUBLIC,
    })
      .addOperation(
        contract.call(
          "register",
          new Address(agentAddress).toScVal(),
          xdr.ScVal.scvString(resource.id),
          xdr.ScVal.scvI128(xdr.Int128Parts.fromBigInt(BigInt(Math.round(parseFloat(resource.price) * 1e7)))),
          xdr.ScVal.scvString(`mindvault:resource:${resource.id}`)
        )
      )
      .setTimeout(30)
      .build();

    tx.sign(agentKeypair);

    const result = await server.sendTransaction(tx);
    
    if (result.status === "ERROR") {
      throw new Error(`Transaction failed: ${JSON.stringify(result.errorResultXdr)}`);
    }

    // Wait for transaction to be mined
    let txResponse = await server.getTransaction(result.hash);
    while (txResponse.status === "NOT_FOUND" || txResponse.status === "PENDING") {
      await new Promise(r => setTimeout(r, 1000));
      txResponse = await server.getTransaction(result.hash);
    }

    if (txResponse.status === "SUCCESS") {
      await db
        .update(resources)
        .set({
          onchainStatus: "registered",
          onchainTxHash: result.hash,
        })
        .where(eq(resources.id, resourceId));
    } else {
      throw new Error(`Onchain registration failed: ${txResponse.status}`);
    }
  } catch (error) {
    console.error(`Failed to register resource ${resourceId} onchain:`, error);
    await db
      .update(resources)
      .set({ onchainStatus: "failed" })
      .where(eq(resources.id, resourceId));
  }
}
