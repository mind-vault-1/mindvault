/**
 * MCP tool definitions for the MindVault server.
 *
 * This array is the single source of truth for the tool surface advertised to
 * agent clients (ListTools). It lives outside index.ts so tests and the
 * argument-validation layer can import it without booting the server or its
 * stdio transport. Every tool listed here must have a matching entry in
 * TOOL_ARGUMENT_SPECS (see validation.ts) — enforced by validation.test.ts.
 */

import { catalogFilterInputProperties } from "./catalogFilters.js";
import { RECEIPT_EXPORT_MAX_LIMIT, RECEIPT_EXPORT_OUTPUT_SCHEMA } from "./receipts.js";

/** JSON Schema (draft subset) advertised for a tool's arguments. */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
}

/**
 * MCP tool annotations (2025-06-18). These are advisory **hints** only — clients
 * never gate tool use on them, but they let agents know which calls are safe to
 * repeat and which can destroy local state.
 */
export interface ToolAnnotations {
  /** Human-readable title shown next to the tool in client UIs. */
  title: string;
  /** The tool performs no state changes or side effects. */
  readOnlyHint: boolean;
  /** The tool can irreversibly destroy local state. */
  destructiveHint: boolean;
  /** Repeating the tool with identical arguments is safe and yields the same result. */
  idempotentHint: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  /**
   * Optional JSON Schema for the tool's structured result. Tools that declare
   * one return their result as `structuredContent` as well as text, and MUST
   * conform to it (MCP 2025-06-18, "Structured Content").
   */
  outputSchema?: Record<string, unknown>;
  /** MCP tool annotations advertised in ListTools (title + read/destructive/idempotent hints). */
  annotations: ToolAnnotations;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "mindvault_setup_wallet",
    description:
      "Create a Stellar wallet using the sponsored account protocol. Optionally pass a profile name to create the wallet under a named profile (e.g. testnet, mainnet, publisher, buyer) and make it active; defaults to the active profile. The wallet (public key + secret key) is persisted to ~/.mindvault/state.json (mode 0600) and reloaded automatically on restart.",
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "string",
          description:
            "Optional profile name to create/switch to. Use letters, digits, dot, dash, or underscore (1–64 chars). Examples: 'testnet', 'mainnet-publisher', 'buyer.alice'",
          examples: ["testnet", "mainnet-publisher", "buyer.alice"],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: [],
    },
    annotations: {
      title: "Set Up Wallet",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_wallet_info",
    description:
      "Check the active profile name, its agent wallet address, USDC balance, and whether it is registered as a publisher.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "Wallet Info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_use_profile",
    description:
      "Switch the active wallet profile, creating it if it does not exist. Profiles let one agent keep separate identities (e.g. testnet vs mainnet, publisher vs buyer); each has its own wallet and publisher API key. Subsequent tools operate on the active profile.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Profile name to make active. Use letters, digits, dot, dash, or underscore (1–64 chars). Examples: 'mainnet', 'testnet-buyer', 'publisher.bob'",
          examples: ["mainnet", "testnet-buyer", "publisher.bob"],
        },
      },
      required: ["name"],
    },
    annotations: {
      title: "Use Profile",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_list_profiles",
    description:
      "List all named wallet profiles, marking the active one and showing each profile's wallet address and whether it is registered as a publisher. Secret keys are never shown.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "List Profiles",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_browse",
    description:
      "List resources in the MindVault catalog with the same optional filters as mindvault_search and GET /resources: keyword, price range, verification status, resource type, owner, sort, pagination, tags, and listed state. Sort accepts newest, price_asc, price_desc, or title; results are ordered client-side too, so the order holds even when the backend ignores the parameter.",
    inputSchema: {
      type: "object",
      properties: { ...catalogFilterInputProperties },
      required: [],
    },
    annotations: {
      title: "Browse Catalog",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_search",
    description:
      "Search the MindVault catalog by keyword and optional filters for price, resource type, verification status, owner, sort, pagination, tags, and listed state. Uses server-side filtering where supported and returns compact resource summaries.",
    inputSchema: {
      type: "object",
      properties: { ...catalogFilterInputProperties },
      required: [],
    },
    annotations: {
      title: "Search Catalog",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_preview",
    description:
      "Get details and price for a specific resource before purchasing. Returns title, description, price, type, verification status, and access URL.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description:
            "The unique resource identifier from mindvault_browse or mindvault_search. Example: 'cm7x8y9z'",
          examples: ["cm7x8y9z", "res-001", "ckx9j2h3f"],
        },
      },
      required: ["resourceId"],
    },
    annotations: {
      title: "Preview Resource",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_register",
    description:
      "Register as a publisher using the agent wallet. The API key is persisted to ~/.mindvault/state.json (mode 0600, key not shown in output) and reloaded on restart so mindvault_publish works across sessions.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Publisher display name shown in the catalog (1–128 characters).",
          examples: ["Agent A", "Research Bot"],
        },
        email: {
          type: "string",
          description:
            "Contact email for the publisher record. Must be a valid address (max 254 chars).",
          examples: ["agent-a@example.com"],
        },
        walletAddress: {
          type: "string",
          description:
            "Optional Stellar public key to receive payouts (G… , 56 chars). Defaults to the active profile's agent wallet.",
          examples: ["GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH"],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: ["name", "email"],
    },
    annotations: {
      title: "Register Publisher",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_publish",
    description:
      "Publish a link resource to the MindVault catalog. The resource undergoes AI verification (agent wallet pays ~$0.10 USDC via x402) and is automatically registered on-chain if verified. Returns resource ID, access URL, verification result, and on-chain registration status. Pass dryRun: true to validate inputs without submitting payment.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Resource title shown in the catalog (concise, descriptive; 1–256 characters).",
          examples: ["Intro to Stellar Consensus", "Soroban Smart Contract Tutorial"],
        },
        description: {
          type: "string",
          description:
            "Optional detailed description of the resource content (max 2048 characters).",
          examples: [
            "A beginner-friendly guide covering Stellar's Federated Byzantine Agreement protocol.",
          ],
        },
        price: {
          type: "string",
          description:
            "Price in USDC as a decimal string. Example: '5.00' charges 5 USDC per access.",
          examples: ["5.00", "0.99", "25.00"],
        },
        externalUrl: {
          type: "string",
          description: "Public http(s) URL buyers receive after payment.",
          examples: ["https://docs.stellar.org/consensus", "https://example.com/data.json"],
        },
        dryRun: {
          type: "boolean",
          description:
            "Optional dry-run flag. When true, validates inputs and shows intended network, endpoint, and required wallet state without submitting payment or transactions.",
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: ["title", "price", "externalUrl"],
    },
    annotations: {
      title: "Publish Resource",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_buy",
    description:
      "Pay USDC via x402 and access a resource. On mainnet, pass confirmMainnet: true (or set MINDVAULT_ALLOW_MAINNET=1). Pass dryRun: true to validate the resource and show intended payment flow without submitting payment.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description:
            "The resource ID to buy, from mindvault_browse or mindvault_search. Letters, digits, dot, dash, or underscore.",
          examples: ["cm7x8y9z", "swcn98besxpp6t1u8e77fqz3"],
        },
        dryRun: {
          type: "boolean",
          description:
            "Optional dry-run flag. When true, validates the resource ID and shows intended network, endpoint, and required wallet state without submitting payment.",
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: ["resourceId"],
    },
    annotations: {
      title: "Buy Resource",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_export_receipts",
    description:
      "Export receipts for resources this agent has purchased as a schema-versioned document (JSON, or RFC 4180 CSV in the envelope's csv field). Filter by resource, network, and date range. Reports a row count and the summed USDC total, so an agent can reconcile spend without re-reading each purchase.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "csv"],
          description:
            'Output format. "json" (default) returns the receipts array; "csv" additionally renders the same rows as an RFC 4180 document in the envelope\'s csv field.',
          examples: ["json", "csv"],
        },
        resourceId: {
          type: "string",
          description: "Export only receipts for this resource id.",
          examples: ["cm7x8y9z", "swcn98besxpp6t1u8e77fqz3"],
        },
        network: {
          type: "string",
          description:
            "Export only receipts settled on this x402 network id. Example: 'stellar:testnet'.",
          examples: ["stellar:testnet", "stellar:pubnet"],
        },
        since: {
          type: "string",
          description:
            "Inclusive lower bound on the purchase time (ISO-8601 date or timestamp; a bare date is read as midnight UTC).",
          examples: ["2026-08-01", "2026-08-01T12:00:00Z"],
        },
        until: {
          type: "string",
          description: "Inclusive upper bound on the purchase time (ISO-8601 date or timestamp).",
          examples: ["2026-08-31", "2026-08-31T23:59:59Z"],
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: RECEIPT_EXPORT_MAX_LIMIT,
          description: `Max receipts to export, newest first (1–${RECEIPT_EXPORT_MAX_LIMIT}).`,
          examples: [50, 100],
        },
      },
      required: [],
    },
    outputSchema: RECEIPT_EXPORT_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    annotations: {
      title: "Export Receipts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_register_onchain",
    description:
      "Register an already-published, verified resource on the vault registry contract. Use this to retry on-chain registration after mindvault_publish reports the on-chain step failed. Prepares the unsigned transaction, signs it with the agent wallet (which must be the resource creator), submits it, and returns the registry status and on-chain tx hash.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description:
            "The resource ID to register on-chain (from mindvault_publish output). Must be verified and not already registered. Example: 'cm7x8y9z'",
          examples: ["cm7x8y9z", "res-001", "ckx9j2h3f"],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: ["resourceId"],
    },
    annotations: {
      title: "Register On-Chain",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_agent_status",
    description:
      "Check the verification agent's earnings and activity. Returns total verifications, pass/fail counts, total USDC earned, average confidence score, and recent verification history with resource titles.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "Agent Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_registry_info",
    description:
      "Return the on-chain vault-registry contract ID, network passphrase, RPC URL, and the resource fields available for direct Soroban queries. Use this to verify ownership, price, and listing state directly from Stellar without trusting the MindVault API.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "Registry Info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_network_profile",
    description:
      "Report current Stellar/x402 network configuration (testnet/mainnet), RPC URLs, registry contract ID, and warnings for custom overrides. Use this to verify which network the MCP is connected to and diagnose configuration issues.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "Network Profile",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_check_bindings",
    description:
      "Verify the installed registry-client bindings match the deployed vault-registry contract interface. Reports a match, or a warning listing the drifting methods with the contract ID, network, client version, and a recommended fix (redeploy the contract or regenerate bindings). Useful after a contract redeploy or client upgrade.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "Check Bindings",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_check_consistency",
    description:
      "Compare a resource from the API catalog with the same resource in the vault-registry contract. Reports matching fields, mismatches, missing API records, and missing on-chain records, plus the content digest anchored in the on-chain metadata pointer. Pass expectedMetadataHash to assert the anchor matches a digest you computed yourself. Useful for detecting synchronization issues between the API and on-chain registry.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description: "The resource ID to compare between API and on-chain registry.",
        },
        expectedMetadataHash: {
          type: "string",
          description:
            "Optional content digest to compare against the on-chain metadata anchor. Accepts sha256 (64 hex chars) or sha512 (128 hex chars), bare or prefixed ('sha256:…'), case-insensitive. Compared in canonical '<algorithm>:<hex>' form.",
          examples: [
            "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
          ],
        },
      },
      required: ["resourceId"],
    },
    annotations: {
      title: "Check Consistency",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_registry_lookup",
    description:
      "Look up a resource directly from the on-chain vault registry by its ID. Returns creator wallet address, price (USDC), metadata (title/description), listed state, tags, contract ID, and network. Data comes from Stellar/Soroban, not the MindVault API. Returns an actionable message when the resource is not registered on-chain.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description:
            "The resource ID to look up on-chain. Must be a registered resource. Example: 'cm7x8y9z'",
          examples: ["cm7x8y9z", "res-001", "ckx9j2h3f"],
        },
      },
      required: ["resourceId"],
    },
    annotations: {
      title: "Registry Lookup",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_registry_list",
    description:
      "List resources registered in the on-chain vault-registry contract with pagination (Soroban list). Returns compact summaries directly from Stellar, not the MindVault API catalog. Use start/limit to page through insertion order; limit is capped at 20 to match the contract. Empty pages return a clear message and next-step hint.",
    inputSchema: {
      type: "object",
      properties: {
        start: {
          type: "integer",
          minimum: 0,
          description:
            "0-based index into the on-chain registry (default 0). Example: 0 for the first page, 20 for the second page when limit is 20.",
          examples: [0, 20],
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description:
            "Page size (1–20, default 20). The contract silently caps higher values at 20.",
          examples: [20, 10],
        },
      },
      required: [],
    },
    annotations: {
      title: "Registry List",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_tx_status",
    description:
      "Look up the status of a Stellar transaction by hash via Soroban RPC. Returns SUCCESS, FAILED, or NOT_FOUND along with ledger number, close time, application order, and XDR envelopes. Useful for debugging on-chain registration failures.",
    inputSchema: {
      type: "object",
      properties: {
        txHash: {
          type: "string",
          description:
            "The 64-character hex transaction hash from Stellar (a sha256 digest; case-insensitive, 'sha256:' prefix accepted). From mindvault_register_onchain or mindvault_publish output.",
          examples: [
            "f47ac10b58cc4372a5670e02b2c3d479c3e5d0a1b2c3d4e5f6a7b8c9d0e1f2a3",
            "3fdba35f04dc8c462986c992bcf875546257113072a909c162f7e470e581e278",
          ],
        },
      },
      required: ["txHash"],
    },
    annotations: {
      title: "Transaction Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_reset",
    description:
      "Clear credentials from memory and disk (~/.mindvault/state.json). By default only the active profile is cleared; pass all=true to remove every profile and delete the state file. After reset, run mindvault_setup_wallet and mindvault_register again.",
    inputSchema: {
      type: "object",
      properties: {
        all: {
          type: "boolean",
          description:
            "Clear every profile and delete the state file (default: false clears active profile only). Example: true removes all profiles.",
          examples: [true, false],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: [],
    },
    annotations: {
      title: "Reset State",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_backup_state",
    description:
      "Export an encrypted backup of ~/.mindvault/state.json for moving agent environments. Requires a passphrase (min 8 chars). Output is a self-contained ciphertext blob — wallet secret keys and API keys never appear in plaintext. Restore with mindvault_restore_state using the same passphrase. Does not change reset behavior.",
    inputSchema: {
      type: "object",
      properties: {
        passphrase: {
          type: "string",
          description: "Passphrase used to encrypt the backup (min 8 characters). Keep it offline.",
        },
      },
      required: ["passphrase"],
    },
    annotations: {
      title: "Back Up State",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_restore_state",
    description:
      "Restore ~/.mindvault/state.json from an encrypted backup produced by mindvault_backup_state. Validates integrity (wrong passphrase or tampered data fails before any write). Replaces in-memory profiles and re-persists to disk (mode 0600). Existing reset behavior is unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        blob: {
          type: "string",
          description: "Encrypted backup blob from mindvault_backup_state (v1:… format).",
        },
        passphrase: {
          type: "string",
          description: "Passphrase used when the backup was created (min 8 characters).",
        },
      },
      required: ["blob", "passphrase"],
    },
    annotations: {
      title: "Restore State",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_metrics",
    description:
      "Return opt-in tool-level metrics: per-tool call/error counts and durations, plus payment attempt/failure totals. Enable by setting MINDVAULT_METRICS=1 on the server. Output contains only tool names, counts, and durations — never arguments, wallets, or API keys. Pass reset=true to clear counters after reading.",
    inputSchema: {
      type: "object",
      properties: {
        reset: {
          type: "boolean",
          description:
            "Clear all counters after returning the current snapshot (default: false leaves counters intact). Example: true resets metrics after reading.",
          examples: [true, false],
        },
      },
      required: [],
    },
    annotations: {
      title: "Tool Metrics",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_set_tags",
    description:
      "Replace the discovery tags on an on-chain resource. Only the resource creator (the agent wallet) may call this. Tags are normalized to lowercase before the on-chain call — pass them already lowercased to avoid round-trip surprises. Constraints: 1–8 tags, each 1–32 characters, containing only lowercase letters, digits, hyphens, or underscores. Pass an empty array to clear all tags. Requires a funded agent wallet.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description:
            "The on-chain resource ID to update tags for (from mindvault_publish or mindvault_browse).",
          examples: ["cm7x8y9z", "res-001"],
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Replacement tag list (0–8 entries, each 1–32 chars). Tags are normalized to lowercase. Use lowercase letters, digits, hyphens, or underscores. Examples: ['dataset', 'research'], [] to clear all tags.",
          examples: [["dataset", "research"], ["finance", "api"], []],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation on the public Stellar network.",
        },
      },
      required: ["resourceId", "tags"],
    },
    annotations: {
      title: "Set Tags",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_update_metadata",
    description:
      "Update the on-chain metadata pointer for a registered resource in the vault registry contract. Only the resource creator/owner may call this. Validates the pointer length and format (must start with ipfs://, ar://, http(s)://, sha256:, sha-256:, or 0x and be at most 512 characters) client-side before signing and submitting.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description:
            "The on-chain resource ID to update (from mindvault_publish or mindvault_browse). Letters, digits, dot, dash, or underscore.",
          examples: ["cm7x8y9z", "res-001"],
        },
        metadata: {
          type: "string",
          description:
            "The new metadata pointer string (max 512 characters). Must start with ipfs://, ar://, http(s)://, sha256:, sha-256:, or 0x. Example: 'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco'",
          examples: [
            "ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
            "https://example.com/metadata.json",
          ],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: ["resourceId", "metadata"],
    },
    annotations: {
      title: "Update Metadata",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_set_price",
    description:
      "Update the on-chain price in USDC for a registered resource in the vault registry contract. Only the resource creator/owner may call this. Prepares, signs, and submits the set_price mutation.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description: "The resource ID to update price for. Example: 'cm7x8y9z'",
          examples: ["cm7x8y9z", "res-001"],
        },
        price: {
          type: "string",
          description:
            "New price in USDC as a decimal string. Example: '10.00' charges 10 USDC per access.",
          examples: ["10.00", "5.50", "0.99"],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: ["resourceId", "price"],
    },
    annotations: {
      title: "Set Price",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_transfer_ownership",
    description:
      "Transfer ownership of a registered resource on the vault registry contract to a new creator wallet address (G… key). Only the current resource owner may call this.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description: "The resource ID to transfer ownership of. Example: 'cm7x8y9z'",
          examples: ["cm7x8y9z", "res-001"],
        },
        newCreator: {
          type: "string",
          description: "The Stellar public key (G… , 56 chars) of the new resource owner.",
          examples: ["GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH"],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
        },
      },
      required: ["resourceId", "newCreator"],
    },
    annotations: {
      title: "Transfer Ownership",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_set_listed",
    description:
      "Manage catalog availability by changing the listed state (listed or delisted) of a resource on the vault registry contract. Only the resource creator/owner may call this.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: {
          type: "string",
          description: "The resource ID to change listed state for. Example: 'cm7x8y9z'",
          examples: ["cm7x8y9z", "res-001"],
        },
        listed: {
          type: "boolean",
          description:
            "Set to true to list/relist the resource in the catalog, or false to delist it.",
          examples: [true, false],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation on the public Stellar network.",
        },
      },
      required: ["resourceId", "listed"],
    },
    annotations: {
      title: "Set Listed",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_check_state_permissions",
    description:
      "Verify the state file (~/.mindvault/state.json) has safe permissions (mode 0600). Warns when the file is world-readable or group-readable, which would expose wallet secret keys and API keys to other system users. Safe by default; run after any manual file operations or environment migration.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "Check State Permissions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_registry_health",
    description:
      "Check the health of every dependency the MCP server relies on: MindVault API, Horizon, Soroban RPC, vault-registry contract, and x402 network alignment. Returns per-dependency status (ok/error) with actionable failure messages. Does not leak secrets or environment variables.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "Registry Health",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "mindvault_import_wallet",
    description:
      "Import an existing Stellar wallet by providing a secret key (or reading MINDVAULT_AGENT_SECRET from the environment). Validates the key, optionally persists it to the active profile (or a named profile), and never logs the secret. Use this to restore a wallet from backup or connect to an existing identity.",
    inputSchema: {
      type: "object",
      properties: {
        secretKey: {
          type: "string",
          description:
            "Stellar secret key (S… , 56 chars) to import. If omitted, reads from MINDVAULT_AGENT_SECRET env var.",
          examples: ["SCHZPJ..."],
        },
        profile: {
          type: "string",
          description: "Optional profile name to import into. Defaults to the active profile.",
          examples: ["testnet", "mainnet-publisher"],
        },
        persist: {
          type: "boolean",
          description:
            "When true (default), save the imported wallet to the state file. When false, validate only and return the public key without writing to disk.",
          examples: [true, false],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation on the public Stellar network.",
        },
      },
      required: [],
    },
    annotations: {
      title: "Import Wallet",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_rotate_publisher_key",
    description:
      "Rotate the publisher API key for the active profile. Calls the MindVault server rotation endpoint (POST /publishers/rotate-key), stores the new key in the state file, and returns the updated publisher ID. The old key is invalidated server-side. Requires an existing registration (mindvault_register).",
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "string",
          description:
            "Optional profile name to rotate the key for. Defaults to the active profile.",
          examples: ["testnet", "mainnet-publisher"],
        },
        confirmMainnet: {
          type: "boolean",
          description:
            "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation on the public Stellar network.",
        },
      },
      required: [],
    },
    annotations: {
      title: "Rotate Publisher Key",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "mindvault_verify_install",
    description:
      "Verify the MindVault MCP server is installed and configured correctly. Checks Node.js version (>=20), network settings, URL variables, vault-registry contract ID, and warns about plaintext secrets in the environment. No network calls are made — all checks are local. Run this first when setting up a new agent or diagnosing a configuration problem.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: {
      title: "Verify Install",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
];
