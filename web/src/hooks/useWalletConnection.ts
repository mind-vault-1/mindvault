import { useCallback, useEffect, useState } from "react";

export type WalletStatus = "restoring" | "disconnected" | "connected" | "error";

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const STORAGE_KEY = "mindvault-wallet-address";

/**
 * Manages Freighter wallet connection with localStorage persistence.
 *
 * On mount it reads any previously stored address and re-validates it with
 * Freighter (isConnected + getPublicKey). If Freighter confirms the same
 * address the session is silently restored; if not the stored value is
 * cleared and the user sees the "Connect wallet" button.
 *
 * The address is written to localStorage on connect and removed on disconnect,
 * so it survives page reloads without requiring the user to re-approve.
 */
export function useWalletConnection(): WalletState {
  const [status, setStatus] = useState<WalletStatus>("restoring");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Restore on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      setStatus("disconnected");
      return;
    }

    // Validate the stored address is still live in Freighter
    async function restore() {
      try {
        const api = window.freighterApi;
        if (!api) {
          // Extension not installed — clear stale storage and stay disconnected
          localStorage.removeItem(STORAGE_KEY);
          setStatus("disconnected");
          return;
        }

        const connected = await api.isConnected();
        if (!connected) {
          localStorage.removeItem(STORAGE_KEY);
          setStatus("disconnected");
          return;
        }

        const liveAddress = await api.getPublicKey();
        if (liveAddress && liveAddress === stored) {
          // Same account — restore silently
          setAddress(liveAddress);
          setStatus("connected");
        } else {
          // Different account or empty — clear and let user reconnect
          localStorage.removeItem(STORAGE_KEY);
          setStatus("disconnected");
        }
      } catch {
        // Any Freighter error → fall back to disconnected, don't crash
        localStorage.removeItem(STORAGE_KEY);
        setStatus("disconnected");
      }
    }

    restore();
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setError(null);

    const api = window.freighterApi;
    if (!api) {
      setError("Freighter wallet not found. Please install the Freighter browser extension.");
      setStatus("error");
      return;
    }

    try {
      const connected = await api.isConnected();
      if (!connected) {
        setError("Freighter is not connected. Open the extension and unlock your wallet.");
        setStatus("error");
        return;
      }

      const publicKey = await api.getPublicKey();
      if (!publicKey) {
        setError("Could not retrieve public key from Freighter.");
        setStatus("error");
        return;
      }

      localStorage.setItem(STORAGE_KEY, publicKey);
      setAddress(publicKey);
      setStatus("connected");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect wallet.";
      setError(message);
      setStatus("error");
    }
  }, []);

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAddress(null);
    setStatus("disconnected");
    setError(null);
  }, []);

  return { status, address, error, connect, disconnect };
}
