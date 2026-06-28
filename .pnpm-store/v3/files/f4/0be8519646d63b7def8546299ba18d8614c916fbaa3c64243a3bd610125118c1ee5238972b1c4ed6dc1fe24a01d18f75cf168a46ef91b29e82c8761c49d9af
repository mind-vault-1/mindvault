import { z } from 'zod';

// src/types/x402Specs.ts
var schemes = ["exact"];
var x402Versions = [1];
var stellarNetworks = ["stellar-testnet", "stellar"];
var StellarAddressRegex = /^G[A-Z2-7]{55}$/;
var StellarContractRegex = /^C[A-Z2-7]{55}$/;
var StellarAssetRegex = /^(native|C[A-Z2-7]{55})$/;
var Base64EncodedRegex = /^[A-Za-z0-9+/]*={0,2}$/;
var isNonNegativeIntegerString = (value) => /^\d+$/.test(value) && Number.isInteger(Number(value)) && Number(value) >= 0;
var StellarNetworkSchema = z.enum(stellarNetworks);
var PaymentRequirementsSchema = z.object({
  scheme: z.enum(schemes),
  network: StellarNetworkSchema,
  maxAmountRequired: z.string().refine(isNonNegativeIntegerString, {
    message: "maxAmountRequired must be a non-negative integer string"
  }),
  resource: z.string().url({ message: "resource must be a valid URL" }),
  description: z.string(),
  mimeType: z.string(),
  outputSchema: z.record(z.any()).optional().nullable(),
  payTo: z.string().regex(StellarAddressRegex, {
    message: "payTo must be a valid Stellar address (G...)"
  }),
  maxTimeoutSeconds: z.number().int().positive(),
  asset: z.string().regex(StellarAssetRegex, {
    message: 'asset must be "native" or a valid Stellar contract address (C...)'
  }),
  extra: z.record(z.any()).optional().nullable()
});
var StellarPayloadSchema = z.object({
  // The signed transaction envelope (XDR format, base64 encoded)
  signedTxXdr: z.string().regex(Base64EncodedRegex, {
    message: "signedTxXdr must be valid base64"
  }),
  // Source account (payer's public key)
  sourceAccount: z.string().regex(StellarAddressRegex, {
    message: "sourceAccount must be a valid Stellar address (G...)"
  }),
  // Amount in stroops (7 decimals: 1 unit = 10^7 stroops)
  amount: z.string().refine(isNonNegativeIntegerString, {
    message: "amount must be a non-negative integer string (stroops)"
  }),
  // Destination account (payTo address)
  destination: z.string().regex(StellarAddressRegex, {
    message: "destination must be a valid Stellar address (G...)"
  }),
  // Asset: "native" for XLM or contract address for Soroban tokens
  asset: z.string().regex(StellarAssetRegex, {
    message: 'asset must be "native" or a valid Stellar contract address (C...)'
  }),
  // Expiration: ledger number after which the tx is invalid
  validUntilLedger: z.number().int().positive(),
  // Unique nonce for replay protection
  nonce: z.string().min(1, { message: "nonce is required" })
});
var PaymentPayloadSchema = z.object({
  x402Version: z.number().refine((val) => x402Versions.includes(val), {
    message: "x402Version must be 1"
  }),
  scheme: z.enum(schemes),
  network: StellarNetworkSchema,
  payload: StellarPayloadSchema
});
var FacilitatorRequestSchema = z.object({
  x402Version: z.number().refine((val) => x402Versions.includes(val), {
    message: "x402Version must be 1"
  }),
  paymentHeader: z.string().optional(),
  paymentPayload: PaymentPayloadSchema.optional(),
  paymentRequirements: PaymentRequirementsSchema
}).refine((data) => data.paymentHeader || data.paymentPayload, {
  message: "Either paymentHeader or paymentPayload is required"
});
var VerifyRequestSchema = FacilitatorRequestSchema;
var SettleRequestSchema = FacilitatorRequestSchema;
var VerifyResponseSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z.string().optional(),
  payer: z.string().optional()
});
var SettleResponseSchema = z.object({
  success: z.boolean(),
  errorReason: z.string().optional(),
  payer: z.string().optional(),
  transaction: z.string(),
  network: z.string()
});
var SupportedPaymentKindSchema = z.object({
  x402Version: z.number().refine((val) => x402Versions.includes(val), {
    message: "x402Version must be 1"
  }),
  scheme: z.enum(schemes),
  network: StellarNetworkSchema,
  extra: z.record(z.any()).optional()
});
var SupportedPaymentKindsResponseSchema = z.object({
  kinds: z.array(SupportedPaymentKindSchema)
});
var x402ResponseSchema = z.object({
  x402Version: z.number().refine((val) => x402Versions.includes(val)),
  error: z.string().optional(),
  accepts: z.array(PaymentRequirementsSchema).optional(),
  payer: z.string().optional()
});
var DiscoveredResourceSchema = z.object({
  /** The resource URL being monetized */
  resource: z.string().url(),
  /** Resource type (currently only "http") */
  type: z.enum(["http"]),
  /** x402 protocol version */
  x402Version: z.number().refine((val) => x402Versions.includes(val)),
  /** Payment requirements for this resource */
  accepts: z.array(PaymentRequirementsSchema),
  /** Unix timestamp of when the resource was last updated */
  lastUpdated: z.number().int().positive(),
  /** Additional metadata about the resource */
  metadata: z.record(z.any()).optional()
});
var ListDiscoveryResourcesRequestSchema = z.object({
  /** Filter by resource type */
  type: z.string().optional(),
  /** Maximum number of results to return (1-100) */
  limit: z.number().int().min(1).max(100).optional(),
  /** Number of results to skip for pagination */
  offset: z.number().int().min(0).optional()
});
var DiscoveryPaginationSchema = z.object({
  limit: z.number().int(),
  offset: z.number().int(),
  total: z.number().int()
});
var ListDiscoveryResourcesResponseSchema = z.object({
  x402Version: z.number().refine((val) => x402Versions.includes(val)),
  items: z.array(DiscoveredResourceSchema),
  pagination: DiscoveryPaginationSchema
});

// src/types/facilitator.ts
var StellarErrorReasons = [
  // Generic x402 errors (from Coinbase spec)
  "insufficient_funds",
  "invalid_network",
  "invalid_payload",
  "invalid_payment_requirements",
  "invalid_scheme",
  "invalid_payment",
  "payment_expired",
  "unsupported_scheme",
  "invalid_x402_version",
  "invalid_transaction_state",
  "unexpected_settle_error",
  "unexpected_verify_error",
  // Stellar-specific errors (following Coinbase naming pattern: invalid_exact_{network}_payload_*)
  "invalid_exact_stellar_payload_missing_signed_tx_xdr",
  "invalid_exact_stellar_payload_invalid_xdr",
  "invalid_exact_stellar_payload_source_account_not_found",
  "invalid_exact_stellar_payload_insufficient_balance",
  "invalid_exact_stellar_payload_amount_mismatch",
  "invalid_exact_stellar_payload_destination_mismatch",
  "invalid_exact_stellar_payload_asset_mismatch",
  "invalid_exact_stellar_payload_network_mismatch",
  "invalid_exact_stellar_payload_missing_required_fields",
  "invalid_exact_stellar_payload_transaction_expired",
  "invalid_exact_stellar_payload_transaction_already_used",
  "settle_exact_stellar_transaction_failed",
  "settle_exact_stellar_fee_bump_failed"
];
var SUPPORTED_NETWORKS = ["stellar-testnet", "stellar"];

// src/types/network.ts
var STELLAR_NETWORKS = {
  "stellar-testnet": {
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015"
  },
  stellar: {
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015"
  }
};

// src/types/tokenCatalog.ts
var STELLAR_TOKENS = {
  "stellar-testnet": {
    USDC: {
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      decimals: 7,
      symbol: "USDC",
      name: "USD Coin"
    }
  },
  stellar: {
    USDC: {
      address: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      decimals: 7,
      symbol: "USDC",
      name: "USD Coin"
    }
  }
};
function getTokenByAddress(network, address) {
  const tokens = STELLAR_TOKENS[network];
  return Object.values(tokens).find((t) => t.address === address);
}
function getTokenBySymbol(network, symbol) {
  return STELLAR_TOKENS[network][symbol];
}
function isSacToken(asset) {
  return /^C[A-Z2-7]{55}$/.test(asset);
}
function isNativeAsset(asset) {
  return asset === "native";
}

// src/shared/base64.ts
function safeBase64Decode(str) {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(str, "base64").toString("utf-8");
    }
    return atob(str);
  } catch {
    throw new Error("Invalid base64 string");
  }
}
function safeBase64Encode(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  return btoa(str);
}
function encodePaymentHeader(payload) {
  return safeBase64Encode(JSON.stringify(payload));
}
function decodePaymentHeader(header) {
  const decoded = safeBase64Decode(header);
  return JSON.parse(decoded);
}

// src/shared/json.ts
function toJsonSafe(obj) {
  return JSON.parse(
    JSON.stringify(
      obj,
      (_key, value) => typeof value === "bigint" ? value.toString() : value
    )
  );
}

// src/verify/useFacilitator.ts
var DEFAULT_FACILITATOR_URL = "https://facilitator.stellar-x402.org";
function useFacilitator(facilitator) {
  async function verify2(payload, paymentRequirements) {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.verify };
    }
    const res = await fetch(`${url}/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements)
      })
    });
    if (res.status !== 200) {
      let errorMessage = `Failed to verify payment: ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();
    return data;
  }
  async function settle2(payload, paymentRequirements) {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.settle };
    }
    const res = await fetch(`${url}/settle`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements)
      })
    });
    if (res.status !== 200) {
      let errorMessage = `Failed to settle payment: ${res.status} ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();
    return data;
  }
  async function supported2() {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.supported };
    }
    const res = await fetch(`${url}/supported`, {
      method: "GET",
      headers
    });
    if (res.status !== 200) {
      throw new Error(`Failed to get supported payment kinds: ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  }
  async function list2(config = {}) {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;
    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      if (authHeaders.list) {
        headers = { ...headers, ...authHeaders.list };
      }
    }
    const params = new URLSearchParams();
    if (config.type !== void 0) params.set("type", config.type);
    if (config.limit !== void 0) params.set("limit", config.limit.toString());
    if (config.offset !== void 0) params.set("offset", config.offset.toString());
    const queryString = params.toString();
    const requestUrl = queryString ? `${url}/discovery/resources?${queryString}` : `${url}/discovery/resources`;
    const res = await fetch(requestUrl, {
      method: "GET",
      headers
    });
    if (res.status !== 200) {
      throw new Error(`Failed to list discovery resources: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  }
  return { verify: verify2, settle: settle2, supported: supported2, list: list2 };
}
var { verify, settle, supported, list } = useFacilitator();

export { Base64EncodedRegex, DiscoveredResourceSchema, DiscoveryPaginationSchema, FacilitatorRequestSchema, ListDiscoveryResourcesRequestSchema, ListDiscoveryResourcesResponseSchema, PaymentPayloadSchema, PaymentRequirementsSchema, STELLAR_NETWORKS, STELLAR_TOKENS, SUPPORTED_NETWORKS, SettleRequestSchema, SettleResponseSchema, StellarAddressRegex, StellarAssetRegex, StellarContractRegex, StellarErrorReasons, StellarNetworkSchema, StellarPayloadSchema, SupportedPaymentKindSchema, SupportedPaymentKindsResponseSchema, VerifyRequestSchema, VerifyResponseSchema, decodePaymentHeader, encodePaymentHeader, getTokenByAddress, getTokenBySymbol, isNativeAsset, isSacToken, list, safeBase64Decode, safeBase64Encode, schemes, settle, stellarNetworks, supported, toJsonSafe, useFacilitator, verify, x402ResponseSchema, x402Versions };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map