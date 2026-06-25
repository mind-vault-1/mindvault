/**
 * Generate a Stellar testnet wallet and fund it via Friendbot.
 *
 * Usage: npx tsx scripts/generate-wallet.ts
 */

import { Keypair } from "@stellar/stellar-sdk";

async function main() {
  const pair = Keypair.random();
  const publicKey = pair.publicKey();
  const secret = pair.secret();

  console.log("=== Stellar Testnet Wallet ===\n");
  console.log(`Public Key:  ${publicKey}`);
  console.log(`Secret Key:  ${secret}`);
  console.log("\nFunding via Friendbot...");

  const res = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);

  if (res.ok) {
    console.log("Funded with 10,000 XLM on testnet.\n");
  } else {
    console.error(`Friendbot funding failed: ${res.status} ${res.statusText}`);
    console.log("You can manually fund at: https://lab.stellar.org\n");
  }

  console.log("Add to your .env:");
  console.log(`  PAY_TO=${publicKey}`);
  console.log(`  AGENT_SECRET_KEY=${secret}`);
  console.log("\nNote: For separate platform + agent wallets, run this script twice.");
}

main().catch(console.error);
