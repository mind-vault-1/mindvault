/**
 * Set up USDC trustline and acquire testnet USDC for the platform agent wallet.
 *
 * Usage: npx tsx scripts/setup-usdc.ts
 */

import "dotenv/config";
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Horizon,
} from "@stellar/stellar-sdk";
import { getNetworkPreset, resolveStellarNetwork } from "@mindvault/registry-client";

async function main() {
  const secretKey = process.env.AGENT_SECRET_KEY;
  if (!secretKey) {
    console.error("AGENT_SECRET_KEY not set in .env");
    process.exit(1);
  }

  const stellarNetwork = resolveStellarNetwork(process.env.STELLAR_NETWORK);
  const preset = getNetworkPreset(stellarNetwork);
  const usdcIssuer = preset.usdcClassicIssuer;
  const horizonUrl = preset.horizonUrl;
  const keypair = Keypair.fromSecret(secretKey);
  const publicKey = keypair.publicKey();
  const server = new Horizon.Server(horizonUrl);

  console.log(`Network: ${stellarNetwork}`);
  console.log(`Wallet: ${publicKey}\n`);

  // Check current balances
  const account = await server.loadAccount(publicKey);
  const usdcBalance = account.balances.find(
    (b: any) => b.asset_code === "USDC" && b.asset_issuer === usdcIssuer,
  );

  if (usdcBalance) {
    console.log(`USDC trustline already exists. Balance: ${(usdcBalance as any).balance} USDC`);
  } else {
    console.log("Adding USDC trustline...");

    const usdc = new Asset("USDC", usdcIssuer);
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: preset.networkPassphrase,
    })
      .addOperation(Operation.changeTrust({ asset: usdc }))
      .setTimeout(30)
      .build();

    tx.sign(keypair);
    await server.submitTransaction(tx);
    console.log("Trustline added.");
  }

  // Get testnet USDC from friendbot-style faucet (testnet only)
  if (stellarNetwork === "testnet") {
    console.log("\nRequesting testnet USDC...");

    try {
      const resp = await fetch(`https://horizon-testnet.stellar.org/friendbot?addr=${publicKey}`);
      if (resp.ok) {
        console.log("Friendbot: topped up XLM.");
      }
    } catch {
      console.log("Friendbot XLM top-up skipped (may already have XLM).");
    }
  } else {
    console.log("\nMainnet: fund USDC manually from an exchange or Circle Mint.");
  }

  console.log(`
Note: x402 on Stellar uses the Soroban USDC token contract, not classic USDC.

${stellarNetwork} USDC SAC contract: ${preset.usdcSacContractId}

To get ${stellarNetwork} USDC for x402:
  1. Go to https://lab.stellar.org
  2. Switch to Testnet
  3. Go to "Fund account" or use the SAC (Stellar Asset Contract) mint

Alternatively, visit https://xlm402.com to test x402 flows with small amounts.

Your wallet ${publicKey} now has a USDC trustline and is ready.
Once you acquire testnet USDC, the verification flow will work end-to-end.
  `);

  // Show final balances
  const updated = await server.loadAccount(publicKey);
  console.log("Current balances:");
  for (const bal of updated.balances) {
    if ((bal as any).asset_code) {
      console.log(`  ${(bal as any).asset_code}: ${(bal as any).balance}`);
    } else {
      console.log(`  XLM: ${(bal as any).balance}`);
    }
  }
}

main().catch(console.error);
