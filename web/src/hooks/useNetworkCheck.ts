/**
 * Checks that Freighter's active network matches the passphrase the server
 * returned. Returns a warning string when they differ, or null when they match.
 */
export async function checkNetwork(expectedPassphrase: string): Promise<string | null> {
  const freighter = await import("@stellar/freighter-api");
  const result = await freighter.getNetworkDetails();
  if ("error" in result && result.error) return null; // can't check — let signing handle it
  const actual = (result as any).networkPassphrase ?? (result as any).result?.networkPassphrase;
  if (!actual || actual === expectedPassphrase) return null;
  const label = expectedPassphrase.includes("Test")
    ? "Stellar Testnet"
    : expectedPassphrase.includes("Public")
      ? "Stellar Mainnet"
      : expectedPassphrase;
  return `Network mismatch: your wallet is on a different network. Switch Freighter to ${label} before signing.`;
}
