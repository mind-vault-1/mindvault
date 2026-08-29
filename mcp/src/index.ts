#!/usr/bin/env node
/**
 * MindVault MCP Server
 * Exposes vault tools to AI agents via the Model Context Protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { checkContractBindings } from "@mindvault/registry-client";
import { homedir } from "os";
import { join } from "path";
import { PROMPT_DEFINITIONS, getPrompt } from "./prompts.js";
import { createProgressEmitter } from "./progress.js";
import { Mutex } from "./mutex.js";
import { catalogFilterInputProperties, parseCatalogFilters } from "./catalogFilters.js";
import { TOOL_DEFINITIONS, type ToolDefinition } from "./tools.js";
import {
  collectStartupDiagnostics,
  formatDiagnostics,
  hasBlockingDiagnostics,
} from "./diagnostics.js";
import { mockEnabledFromEnv } from "./mock.js";
import { measureTool } from "./metrics.js";
import { safeErrorMessage } from "./redaction.js";
import { assertMainnetMutationAllowed } from "./mainnetGuardrails.js";
import { REGISTRY_LIST_DEFAULT_LIMIT, REGISTRY_LIST_DEFAULT_START } from "./registryPagination.js";
import {
  flag,
  optionalInt,
  optionalString,
  requiredString,
  TOOL_ARGUMENT_SPECS,
  UnknownToolError,
  validateToolArgs,
  type ValidatedArgs,
} from "./validation.js";
import { purchaseHistoryTool } from "./purchaseHistory.js";
import { exportReceiptsTool } from "./receipts.js";
import { verifyInstall, formatVerifyInstall } from "./verifyInstall.js";
import { browse, search, preview } from "./tools/catalog.js";
import { setupWallet, walletInfo, txStatus, publishStatus } from "./tools/wallet.js";
import {
  useProfile,
  listProfiles,
  backupState,
  restoreStateTool,
  resetState,
  checkStatePermissionsTool,
} from "./tools/state.js";
import {
  register,
  publish,
  buy,
  registerOnchain,
  updateMetadata,
  setPrice,
  transferOwnership,
  setListed,
  agentStatus,
  usdcToStroops,
} from "./tools/publish.js";
import {
  registryLookup,
  registryList,
  registryInfo,
  checkConsistency,
  type SearchFilters,
} from "./tools/registry.js";
import {
  importWallet,
  rotatePublisherKey,
  networkProfile,
  checkBindings,
  registryHealth,
  toolMetrics,
} from "./tools/diagnostics.js";
import {
  configureStatePaths,
  loadState,
  metrics,
  MOCK,
  NETWORK,
  REGISTRY_CONTRACT_ID,
  REGISTRY_NETWORK_PASSPHRASE,
  saveState,
  SOROBAN_RPC_URL,
  STELLAR_NETWORK,
  _setAgentWallet,
  _setAgentApiKey,
  _resetProfiles,
  _setMockMode,
} from "./runtime.js";

const STATE_DIR = join(homedir(), ".mindvault");
const STATE_FILE = join(STATE_DIR, "state.json");
configureStatePaths(STATE_DIR, STATE_FILE);
loadState();

export {
  browse,
  search,
  preview,
  txStatus,
  walletInfo,
  useProfile,
  listProfiles,
  publishStatus,
  buy,
  registerOnchain,
  updateMetadata,
  setPrice,
  transferOwnership,
  setListed,
  registryLookup,
  registryList,
  checkConsistency,
  networkProfile,
  backupState,
  restoreStateTool,
  resetState,
  usdcToStroops,
  type SearchFilters,
  _setAgentWallet,
  _setAgentApiKey,
  _resetProfiles,
  _setMockMode,
};

if (!process.env.VITEST && !mockEnabledFromEnv(process.env)) {
  const diagnostics = collectStartupDiagnostics(process.env);
  if (diagnostics.length > 0) console.error(formatDiagnostics(diagnostics));
  if (hasBlockingDiagnostics(diagnostics)) process.exit(1);
}

const TOOLS_WITHOUT_ARG_VALIDATION = new Set([
  "mindvault_publish_status",
  "mindvault_purchase_history",
]);

function isDispatchableTool(name: string): boolean {
  return name in TOOL_ARGUMENT_SPECS || TOOLS_WITHOUT_ARG_VALIDATION.has(name);
}

const STATE_MUTATING_TOOLS = new Set([
  "mindvault_setup_wallet",
  "mindvault_use_profile",
  "mindvault_register",
  "mindvault_publish",
  "mindvault_buy",
  "mindvault_register_onchain",
  "mindvault_update_metadata",
  "mindvault_set_price",
  "mindvault_transfer_ownership",
  "mindvault_set_listed",
  "mindvault_set_tags",
  "mindvault_reset",
  "mindvault_restore_state",
  "mindvault_import_wallet",
  "mindvault_rotate_publisher_key",
  "mindvault_metrics",
]);

const stateMutex = new Mutex();

export async function dispatchTool(
  name: string,
  rawArgs: unknown,
  onProgress?: (progress: number, total?: number, message?: string) => Promise<void>,
): Promise<string> {
  if (!isDispatchableTool(name)) {
    throw new UnknownToolError(name);
  }

  const rawRecord =
    typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};

  const isDryRunCall =
    (name === "mindvault_publish" || name === "mindvault_buy") && rawRecord.dryRun === true;

  const args: ValidatedArgs =
    name in TOOL_ARGUMENT_SPECS && !isDryRunCall ? validateToolArgs(name, rawArgs) : {};
  const dryRunArgs = isDryRunCall ? (rawRecord as ValidatedArgs) : args;

  assertMainnetMutationAllowed(NETWORK, name, rawRecord);

  const execute = async (): Promise<string> => {
    switch (name) {
      case "mindvault_setup_wallet":
        return setupWallet(optionalString(args, "profile"));
      case "mindvault_wallet_info":
        return walletInfo();
      case "mindvault_use_profile":
        return useProfile(requiredString(args, "name"));
      case "mindvault_list_profiles":
        return listProfiles();
      case "mindvault_browse": {
        const parsed = parseCatalogFilters(rawRecord);
        return parsed.ok ? browse(parsed.filters) : parsed.error;
      }
      case "mindvault_search": {
        const parsed = parseCatalogFilters(rawRecord, { requireCriteria: true });
        return parsed.ok ? search(parsed.filters) : parsed.error;
      }
      case "mindvault_preview":
        return preview(requiredString(args, "resourceId"));
      case "mindvault_register":
        return register(
          requiredString(args, "name"),
          requiredString(args, "email"),
          optionalString(args, "walletAddress"),
        );
      case "mindvault_publish":
        return publish({
          title: requiredString(dryRunArgs, "title"),
          description: optionalString(dryRunArgs, "description"),
          price: requiredString(dryRunArgs, "price"),
          externalUrl: requiredString(dryRunArgs, "externalUrl"),
          dryRun: flag(dryRunArgs, "dryRun"),
        });
      case "mindvault_publish_status":
        return publishStatus(rawRecord);
      case "mindvault_buy":
        return buy(requiredString(args, "resourceId"), flag(args, "dryRun"), undefined, onProgress);
      case "mindvault_purchase_history":
        return purchaseHistoryTool(rawRecord);
      case "mindvault_export_receipts":
        return exportReceiptsTool(rawRecord);
      case "mindvault_register_onchain":
        return registerOnchain(requiredString(args, "resourceId"), onProgress);
      case "mindvault_agent_status":
        return agentStatus();
      case "mindvault_registry_info":
        return registryInfo();
      case "mindvault_network_profile":
        return networkProfile();
      case "mindvault_check_bindings":
        return checkBindings();
      case "mindvault_check_consistency":
        return checkConsistency(
          requiredString(args, "resourceId"),
          optionalString(args, "expectedMetadataHash"),
        );
      case "mindvault_registry_lookup":
        return registryLookup(requiredString(args, "resourceId"));
      case "mindvault_registry_list":
        return registryList(
          optionalInt(args, "start", REGISTRY_LIST_DEFAULT_START),
          optionalInt(args, "limit", REGISTRY_LIST_DEFAULT_LIMIT),
        );
      case "mindvault_update_metadata":
        return updateMetadata(requiredString(args, "resourceId"), requiredString(args, "metadata"));
      case "mindvault_set_price":
        return setPrice(requiredString(args, "resourceId"), requiredString(args, "price"));
      case "mindvault_transfer_ownership":
        return transferOwnership(
          requiredString(args, "resourceId"),
          requiredString(args, "newCreator"),
        );
      case "mindvault_set_listed":
        return setListed(requiredString(args, "resourceId"), flag(args, "listed"));
      case "mindvault_tx_status":
        return txStatus(requiredString(args, "txHash"));
      case "mindvault_reset":
        return resetState(flag(args, "all"), rawRecord.confirm);
      case "mindvault_backup_state":
        return backupState(requiredString(args, "passphrase"));
      case "mindvault_restore_state":
        return restoreStateTool(requiredString(args, "blob"), requiredString(args, "passphrase"));
      case "mindvault_metrics":
        return toolMetrics(flag(args, "reset"));
      case "mindvault_check_state_permissions":
        return checkStatePermissionsTool();
      case "mindvault_registry_health":
        return registryHealth();
      case "mindvault_import_wallet":
        return importWallet({
          secretKey: optionalString(args, "secretKey"),
          profile: optionalString(args, "profile"),
          persist: flag(args, "persist"),
        });
      case "mindvault_rotate_publisher_key":
        return rotatePublisherKey(optionalString(args, "profile"));
      case "mindvault_verify_install":
        return formatVerifyInstall(verifyInstall(process.env));
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };

  if (STATE_MUTATING_TOOLS.has(name)) {
    return stateMutex.runExclusive(execute);
  }

  return execute();
}

function toolDefinition(name: string): ToolDefinition {
  const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
  if (!definition) throw new Error(`No tool definition for ${name} in TOOL_DEFINITIONS.`);
  return definition;
}

const EXTRA_TOOL_ANNOTATIONS: Record<
  string,
  { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean }
> = {
  mindvault_publish_status: {
    title: "Publish Status",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  mindvault_purchase_history: {
    title: "Purchase History",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

function toolAnnotations(name: string): {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
} {
  if (name in EXTRA_TOOL_ANNOTATIONS) return EXTRA_TOOL_ANNOTATIONS[name];
  const { annotations } = toolDefinition(name);
  return {
    title: annotations.title,
    readOnlyHint: annotations.readOnlyHint,
    destructiveHint: annotations.destructiveHint,
    idempotentHint: annotations.idempotentHint,
  };
}

const TOOLS_WITH_OUTPUT_SCHEMA = new Set(
  TOOL_DEFINITIONS.filter((tool) => tool.outputSchema).map((tool) => tool.name),
);

function structuredResult(name: string, text: string): Record<string, unknown> | undefined {
  if (!TOOLS_WITH_OUTPUT_SCHEMA.has(name)) return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const server = new Server(
  { name: "mindvault", version: "1.0.0" },
  { capabilities: { tools: {}, prompts: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const advertisedTools = [
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
    },
    {
      name: "mindvault_wallet_info",
      description:
        "Check the active profile name, its agent wallet address, USDC balance, and whether it is registered as a publisher.",
      inputSchema: { type: "object", properties: {}, required: [] },
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
    },
    {
      name: "mindvault_list_profiles",
      description:
        "List all named wallet profiles, marking the active one and showing each profile's wallet address and whether it is registered as a publisher. Secret keys are never shown.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_browse",
      description:
        "List resources in the MindVault catalog with the same optional filters as mindvault_search and GET /resources: keyword, price range, verification status, resource type, owner, sort, pagination, tags, and listed state.",
      inputSchema: {
        type: "object",
        properties: { ...catalogFilterInputProperties },
        required: [],
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
    },
    {
      name: "mindvault_register",
      description:
        "Register as a publisher using the agent wallet. The API key is persisted to ~/.mindvault/state.json (mode 0600, key not shown in output) and reloaded on restart so mindvault_publish works across sessions.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          walletAddress: { type: "string" },
          confirmMainnet: {
            type: "boolean",
            description:
              "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
          },
        },
        required: ["name", "email"],
      },
    },
    {
      name: "mindvault_publish",
      description:
        "Publish a link resource to the MindVault catalog. The resource undergoes AI verification (agent wallet pays ~$0.10 USDC via x402) and is automatically registered on-chain if verified. Returns resource ID, access URL, verification result, and on-chain registration status.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          price: { type: "string" },
          externalUrl: { type: "string" },
          confirmMainnet: {
            type: "boolean",
            description:
              "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
          },
        },
        required: ["title", "price", "externalUrl"],
      },
    },
    {
      name: "mindvault_publish_status",
      description:
        "Poll a published resource's verification and on-chain sync status. Returns verificationStatus (pending, verified, rejected, skipped), listed, onchainStatus, onchainTxHash, and optional verification details. Pass wait: true to poll until verification settles or timeoutMs elapses. Deterministic errors for missing resourceId and 404s.",
      inputSchema: {
        type: "object",
        properties: {
          resourceId: {
            type: "string",
            description:
              "The resource ID from mindvault_publish (or browse/search). Example: 'cm7x8y9z'",
            examples: ["cm7x8y9z", "res-001", "swcn98besxpp6t1u8e77fqz3"],
          },
          wait: {
            type: "boolean",
            description:
              "When true, poll until verificationStatus is verified, rejected, or skipped (or until timeoutMs). Default false (single fetch).",
          },
          timeoutMs: {
            type: "number",
            description:
              "Max wait time in milliseconds when wait is true (default 60000, max 300000).",
            examples: [30000, 60000, 120000],
          },
          intervalMs: {
            type: "number",
            description:
              "Delay between polls in milliseconds when wait is true (default 2000, min 200).",
            examples: [1000, 2000, 5000],
          },
        },
        required: ["resourceId"],
      },
    },
    {
      name: "mindvault_buy",
      description:
        "Pay USDC via x402 and access a resource. On mainnet, pass confirmMainnet: true (or set MINDVAULT_ALLOW_MAINNET=1).",
      inputSchema: {
        type: "object",
        properties: {
          resourceId: { type: "string" },
          confirmMainnet: {
            type: "boolean",
            description:
              "Required on mainnet (or set MINDVAULT_ALLOW_MAINNET=1). Explicitly confirm this mutation/payment on the public Stellar network.",
          },
        },
        required: ["resourceId"],
      },
    },
    {
      name: "mindvault_purchase_history",
      description:
        "List locally persisted purchase receipts from successful mindvault_buy calls (~/.mindvault/purchases.json). Read-only. Optional filters: resourceId and network (exact match, e.g. stellar:testnet). Returns count + purchases (newest first), or an empty list when nothing matches.",
      inputSchema: {
        type: "object",
        properties: {
          resourceId: {
            type: "string",
            description: "Optional. Only return receipts for this resource id. Example: 'cm7x8y9z'",
            examples: ["cm7x8y9z", "res-001"],
          },
          network: {
            type: "string",
            description:
              "Optional. Only return receipts recorded on this x402 network id. Example: 'stellar:testnet'",
            examples: ["stellar:testnet", "stellar:pubnet"],
          },
        },
        required: [],
      },
    },
    toolDefinition("mindvault_export_receipts"),
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
    },
    {
      name: "mindvault_agent_status",
      description:
        "Check the verification agent's earnings and activity. Returns total verifications, pass/fail counts, total USDC earned, average confidence score, and recent verification history with resource titles.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_registry_info",
      description:
        "Return the on-chain vault-registry contract ID, network passphrase, RPC URL, and the resource fields available for direct Soroban queries. Use this to verify ownership, price, and listing state directly from Stellar without trusting the MindVault API.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_network_profile",
      description:
        "Report current Stellar/x402 network configuration (testnet/mainnet), RPC URLs, registry contract ID, and warnings for custom overrides. Use this to verify which network the MCP is connected to and diagnose configuration issues.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_check_bindings",
      description:
        "Verify the installed registry-client bindings match the deployed vault-registry contract interface. Reports a match, or a warning listing the drifting methods with the contract ID, network, client version, and a recommended fix (redeploy the contract or regenerate bindings). Useful after a contract redeploy or client upgrade.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_check_consistency",
      description:
        "Compare a resource from the API catalog with the same resource in the vault-registry contract. Reports matching fields, mismatches, missing API records, and missing on-chain records. Useful for detecting synchronization issues between the API and on-chain registry.",
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
              "Optional. The canonical SHA-256 digest (sha256:<hex>) of the off-chain content the agent expects to be anchored on-chain. When supplied, it is compared against the contentHash in the on-chain metadata pointer.",
            examples: ["sha256:1f09d48cb617cd04c123454e2b1b6d51acd66378f2c4b79d5ac09e9d3b123456"],
          },
        },
        required: ["resourceId"],
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
              "The 64-character hex transaction hash from Stellar. Example: 'abc123def456...' (from mindvault_register_onchain or mindvault_publish output).",
            examples: [
              "abc123def456789012345678901234567890123456789012345678901234",
              "f47ac10b58cc4372a5670e02b2c3d479c3e5d0a1b2c3d4e5f6a7b8c9d0e1f2a3",
            ],
          },
        },
        required: ["txHash"],
      },
    },
    {
      name: "mindvault_reset",
      description:
        "Clear credentials from memory and disk (~/.mindvault/state.json). Destructive and irreversible, so it is two-step: without confirm=true the call changes nothing and returns a warning listing exactly what would be removed; call again with confirm=true to perform it. By default only the active profile is cleared; pass all=true to remove every profile and delete the state file. After a confirmed reset, run mindvault_setup_wallet and mindvault_register again.",
      inputSchema: {
        type: "object",
        properties: {
          confirm: {
            type: "boolean",
            description:
              "Required to actually clear anything. Omitted or false returns a warning describing what would be removed and performs no deletion. Example: true clears the credentials.",
            examples: [true, false],
          },
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
            description:
              "Passphrase used to encrypt the backup (min 8 characters). Keep it offline.",
          },
        },
        required: ["passphrase"],
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
    },
    {
      name: "mindvault_check_state_permissions",
      description:
        "Verify the state file (~/.mindvault/state.json) has safe permissions (mode 0600). Warns when the file is world-readable or group-readable, which would expose wallet secret keys and API keys to other system users. Safe by default; run after any manual file operations or environment migration.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "mindvault_registry_health",
      description:
        "Check the health of every dependency the MCP server relies on: MindVault API, Horizon, Soroban RPC, vault-registry contract, and x402 network alignment. Returns per-dependency status (ok/error) with actionable failure messages. Does not leak secrets or environment variables.",
      inputSchema: { type: "object", properties: {}, required: [] },
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
    },
    {
      name: "mindvault_verify_install",
      description:
        "Verify the MindVault MCP server is installed and configured correctly. Checks Node.js version (>=20), network settings, URL variables, vault-registry contract ID, and warns about plaintext secrets in the environment. No network calls are made — all checks are local. Run this first when setting up a new agent or diagnosing a configuration problem.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
  ];

  return {
    tools: advertisedTools.map((tool) => ({
      ...tool,
      annotations: toolAnnotations(tool.name),
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args = {} } = request.params;
  const progressToken = request.params._meta?.progressToken;
  const onProgress =
    progressToken != null
      ? createProgressEmitter({ token: progressToken, send: extra.sendNotification })
      : undefined;
  try {
    const result = await measureTool(metrics, name, () => dispatchTool(name, args, onProgress));
    return { content: [{ type: "text", text: result }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${safeErrorMessage(err)}` }], isError: true };
  }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPT_DEFINITIONS.map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments.map((a) => ({
      name: a.name,
      description: a.description,
      required: a.required,
    })),
  })),
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const result = getPrompt(name, args as Record<string, string | undefined>);
  return {
    description: result.description,
    messages: result.messages,
  };
});

if (!process.env.VITEST && !MOCK) {
  void checkContractBindings({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: REGISTRY_NETWORK_PASSPHRASE,
    network: STELLAR_NETWORK,
  })
    .then((result: { status: string; message: string }) => {
      if (result.status === "mismatch") console.error(`MindVault MCP: ${result.message}`);
    })
    .catch(() => {});
}

export { server };

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    saveState();
    await server.close();
  } catch {
    void 0;
  }

  const exitCode = signal === "SIGINT" ? 130 : 0;
  process.exit(exitCode);
}

if (!process.env.VITEST) {
  const transport = new StdioServerTransport();

  transport.onclose = () => shutdown("transport-close");
  transport.onerror = () => shutdown("transport-error");

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.stdin.on("end", () => shutdown("stdin-EOF"));

  await server.connect(transport);
}
