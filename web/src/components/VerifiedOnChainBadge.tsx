import React from "react";

interface Props {
  onchainStatus: "none" | "pending" | "registered" | "failed";
  className?: string;
}

const STATUS_CONFIG = {
  none: {
    label: "Not on-chain",
    className: "bg-gray-100 text-gray-600 border-gray-200",
    icon: "○",
  },
  pending: {
    label: "Registration pending",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: "⏳",
  },
  registered: {
    label: "Verified on-chain",
    className: "bg-green-100 text-green-700 border-green-200",
    icon: "✓",
  },
  failed: {
    label: "Registration failed",
    className: "bg-red-100 text-red-700 border-red-200",
    icon: "✗",
  },
} as const;

export function VerifiedOnChainBadge({ onchainStatus, className = "" }: Props) {
  const config = STATUS_CONFIG[onchainStatus];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${config.className} ${className}`}
      title={config.label}
    >
      <span className="text-sm">{config.icon}</span>
      {config.label}
    </span>
  );
}
