import { useState } from "react";
import { prepareSetPrice, submitSetPrice } from "../api/resources.js";

type Status = "idle" | "preparing" | "signing" | "submitting" | "confirmed" | "error";

export function useEditPrice(resourceId: string, apiKey: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [newPrice, setNewPrice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function editPrice(price: string) {
    setError(null);
    try {
      // Step 1 — fetch unsigned XDR from the server
      setStatus("preparing");
      const { unsignedXdr, networkPassphrase } = await prepareSetPrice(
        resourceId,
        price,
        apiKey
      );

      // Step 2 — ask Freighter (or any SEP-43 wallet) to sign
      setStatus("signing");
      const freighter = await import("@stellar/freighter-api");
      const result = await freighter.signTransaction(unsignedXdr, {
        networkPassphrase,
      });

      if ("error" in result && result.error) {
        throw new Error(
          typeof result.error === "string" ? result.error : "Wallet rejected signing"
        );
      }

      const signedXdr =
        "signedTxXdr" in result ? result.signedTxXdr : (result as any).result?.signedTxXdr;
      if (!signedXdr) throw new Error("No signed transaction returned by wallet");

      // Step 3 — submit signed XDR and sync DB price
      setStatus("submitting");
      const updated = await submitSetPrice(resourceId, signedXdr, price, apiKey);
      setNewPrice(updated.price);
      setStatus("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  return { status, newPrice, error, editPrice };
}
