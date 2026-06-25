import { useState } from "react";
import { prepareTransferOwnership, submitTransferOwnership } from "../api/resources.js";
import { checkNetwork } from "./useNetworkCheck.js";

type Status = "idle" | "preparing" | "signing" | "submitting" | "confirmed" | "error";

export function useTransferOwnership(resourceId: string, apiKey: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  async function transferOwnership(newCreator: string) {
    setError(null);
    setNetworkWarning(null);
    try {
      // Step 1 — fetch unsigned XDR from the server
      setStatus("preparing");
      const { unsignedXdr, networkPassphrase } = await prepareTransferOwnership(
        resourceId,
        newCreator,
        apiKey,
      );

      // Step 1b — warn if wallet is on the wrong network (non-blocking)
      const warning = await checkNetwork(networkPassphrase);
      if (warning) {
        setNetworkWarning(warning);
        setStatus("idle");
        return;
      }

      // Step 2 — ask Freighter (or any SEP-43 wallet) to sign
      setStatus("signing");
      const freighter = await import("@stellar/freighter-api");
      const result = await freighter.signTransaction(unsignedXdr, {
        networkPassphrase,
      });

      if ("error" in result && result.error) {
        throw new Error(
          typeof result.error === "string" ? result.error : "Wallet rejected signing",
        );
      }

      const signedXdr =
        "signedTxXdr" in result ? result.signedTxXdr : (result as any).result?.signedTxXdr;
      if (!signedXdr) throw new Error("No signed transaction returned by wallet");

      // Step 3 — submit signed XDR and sync DB owner
      setStatus("submitting");
      const updated = await submitTransferOwnership(resourceId, signedXdr, newCreator, apiKey);
      setNewOwner(updated.newCreator);
      setStatus("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  return { status, newOwner, error, networkWarning, transferOwnership };
}
