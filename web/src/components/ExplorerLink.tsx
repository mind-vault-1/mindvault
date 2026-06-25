import React from "react";
import { explorerTxUrl, explorerAccountUrl, explorerContractUrl } from "../lib/stellarExplorer.js";

interface Props {
  type: "tx" | "account" | "contract";
  value: string;
  children?: React.ReactNode;
  className?: string;
}

const URL_BUILDERS = {
  tx: explorerTxUrl,
  account: explorerAccountUrl,
  contract: explorerContractUrl,
} as const;

/** Opens the given tx/account/contract on Stellar Explorer in a new tab. */
export function ExplorerLink({ type, value, children, className = "" }: Props) {
  const href = URL_BUILDERS[type](value);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-indigo-600 hover:underline ${className}`}
      title="View on Stellar Explorer"
    >
      {children ?? "View on Stellar Explorer"}
    </a>
  );
}
