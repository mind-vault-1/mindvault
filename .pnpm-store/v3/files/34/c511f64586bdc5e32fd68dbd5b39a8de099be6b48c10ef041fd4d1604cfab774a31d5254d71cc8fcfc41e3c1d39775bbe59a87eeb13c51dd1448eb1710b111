"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/server/index.ts
var server_exports = {};
__export(server_exports, {
  FacilitatorResponseError: () => FacilitatorResponseError,
  HTTPFacilitatorClient: () => HTTPFacilitatorClient,
  RouteConfigurationError: () => RouteConfigurationError,
  SETTLEMENT_OVERRIDES_HEADER: () => SETTLEMENT_OVERRIDES_HEADER,
  assertAcceptsAdditiveExtraAfterSchemeEnrich: () => assertAcceptsAdditiveExtraAfterSchemeEnrich,
  assertAcceptsAllowlistedAfterExtensionEnrich: () => assertAcceptsAllowlistedAfterExtensionEnrich,
  assertAdditivePayloadEnrichment: () => assertAdditivePayloadEnrichment,
  assertAdditiveSettlementExtra: () => assertAdditiveSettlementExtra,
  assertSettleResponseCoreUnchanged: () => assertSettleResponseCoreUnchanged,
  checkIfBazaarNeeded: () => checkIfBazaarNeeded,
  getFacilitatorResponseError: () => getFacilitatorResponseError,
  isVacantStringField: () => isVacantStringField,
  snapshotPaymentRequirementsList: () => snapshotPaymentRequirementsList,
  snapshotSettleResponseCore: () => snapshotSettleResponseCore,
  x402HTTPResourceServer: () => x402HTTPResourceServer,
  x402ResourceServer: () => x402ResourceServer
});
module.exports = __toCommonJS(server_exports);

// src/types/facilitator.ts
var VerifyError = class extends Error {
  /**
   * Creates a VerifyError from a failed verification response.
   *
   * @param statusCode - HTTP status code from the facilitator
   * @param response - The verify response containing failure details
   */
  constructor(statusCode, response) {
    const reason = response.invalidReason || "unknown reason";
    const message = response.invalidMessage;
    super(message ? `${reason}: ${message}` : reason);
    this.name = "VerifyError";
    this.statusCode = statusCode;
    this.invalidReason = response.invalidReason;
    this.invalidMessage = response.invalidMessage;
    this.payer = response.payer;
  }
};
var SettleError = class extends Error {
  /**
   * Creates a SettleError from a failed settlement response.
   *
   * @param statusCode - HTTP status code from the facilitator
   * @param response - The settle response containing error details
   */
  constructor(statusCode, response) {
    const reason = response.errorReason || "unknown reason";
    const message = response.errorMessage;
    super(message ? `${reason}: ${message}` : reason);
    this.name = "SettleError";
    this.statusCode = statusCode;
    this.errorReason = response.errorReason;
    this.errorMessage = response.errorMessage;
    this.payer = response.payer;
    this.transaction = response.transaction;
    this.network = response.network;
  }
};
var FacilitatorResponseError = class extends Error {
  /**
   * Creates a FacilitatorResponseError for malformed facilitator responses.
   *
   * @param message - The boundary error message
   */
  constructor(message) {
    super(message);
    this.name = "FacilitatorResponseError";
  }
};
function getFacilitatorResponseError(error) {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof FacilitatorResponseError) {
      return current;
    }
    current = current.cause;
  }
  return null;
}

// src/utils/index.ts
var escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var networkPatternToRegExp = (pattern) => {
  const source = escapeRegExp(pattern).replace(/\\\*/g, ".*");
  return new RegExp(`^${source}$`);
};
var networkMatchesPattern = (pattern, network) => {
  return networkPatternToRegExp(pattern).test(network);
};
var findSchemesByNetwork = (map, network) => {
  let implementationsByScheme = map.get(network);
  if (!implementationsByScheme) {
    for (const [registeredNetworkPattern, implementations] of map.entries()) {
      if (networkMatchesPattern(registeredNetworkPattern, network)) {
        implementationsByScheme = implementations;
        break;
      }
    }
  }
  return implementationsByScheme;
};
var findByNetworkAndScheme = (map, scheme, network) => {
  return findSchemesByNetwork(map, network)?.get(scheme);
};
var Base64EncodedRegex = /^[A-Za-z0-9+/]*={0,2}$/;
function safeBase64Encode(data) {
  if (typeof globalThis !== "undefined" && typeof globalThis.btoa === "function") {
    const bytes = new TextEncoder().encode(data);
    const binaryString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return globalThis.btoa(binaryString);
  }
  return Buffer.from(data, "utf8").toString("base64");
}
function safeBase64Decode(data) {
  if (typeof globalThis !== "undefined" && typeof globalThis.atob === "function") {
    const binaryString = globalThis.atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(bytes);
  }
  return Buffer.from(data, "base64").toString("utf-8");
}
function deepEqual(obj1, obj2) {
  const normalize = (obj) => {
    if (obj === null || obj === void 0) return JSON.stringify(obj);
    if (typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) {
      return JSON.stringify(
        obj.map(
          (item) => typeof item === "object" && item !== null ? JSON.parse(normalize(item)) : item
        )
      );
    }
    const sorted = {};
    Object.keys(obj).sort().forEach((key) => {
      const value = obj[key];
      sorted[key] = typeof value === "object" && value !== null ? JSON.parse(normalize(value)) : value;
    });
    return JSON.stringify(sorted);
  };
  try {
    return normalize(obj1) === normalize(obj2);
  } catch {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
  }
}

// src/server/hookPolicy.ts
function isVacantStringField(value) {
  return value.trim() === "";
}
function snapshotPaymentRequirementsList(requirements) {
  return requirements.map((req) => ({
    ...req,
    extra: structuredClone(req.extra)
  }));
}
function assertAcceptsAllowlistedAfterExtensionEnrich(baseline, current, extensionKey) {
  if (baseline.length !== current.length) {
    throw new Error(
      `[x402] extension "${extensionKey}" violated accepts mutation policy: accepts length changed (${baseline.length} \u2192 ${current.length})`
    );
  }
  for (let i = 0; i < baseline.length; i++) {
    const b = baseline[i];
    const c = current[i];
    if (b.scheme !== c.scheme || b.network !== c.network) {
      throw new Error(
        `[x402] extension "${extensionKey}" violated accepts mutation policy: scheme/network are immutable (index ${i})`
      );
    }
    if (b.maxTimeoutSeconds !== c.maxTimeoutSeconds) {
      throw new Error(
        `[x402] extension "${extensionKey}" violated accepts mutation policy: maxTimeoutSeconds is immutable (index ${i})`
      );
    }
    for (const field of ["payTo", "amount", "asset"]) {
      const bv = b[field];
      const cv = c[field];
      if (!isVacantStringField(bv) && cv !== bv) {
        throw new Error(
          `[x402] extension "${extensionKey}" violated accepts mutation policy: "${field}" may only be set when the resource left it vacant (""); non-vacant values are immutable (index ${i})`
        );
      }
    }
    for (const key of Object.keys(b.extra)) {
      if (!Object.prototype.hasOwnProperty.call(c.extra, key)) {
        throw new Error(
          `[x402] extension "${extensionKey}" violated accepts mutation policy: extra["${key}"] was removed (index ${i})`
        );
      }
      if (!deepEqual(c.extra[key], b.extra[key])) {
        throw new Error(
          `[x402] extension "${extensionKey}" violated accepts mutation policy: extra["${key}"] may not be changed (index ${i})`
        );
      }
    }
  }
}
function assertAcceptsAdditiveExtraAfterSchemeEnrich(baseline, current, scheme, network) {
  if (baseline.length !== current.length) {
    throw new Error(
      `[x402] scheme "${scheme}" violated accepts mutation policy: accepts length changed (${baseline.length} \u2192 ${current.length})`
    );
  }
  for (let i = 0; i < baseline.length; i++) {
    const b = baseline[i];
    const c = current[i];
    const isMatchingAccept = b.scheme === scheme && b.network === network;
    if (b.scheme !== c.scheme || b.network !== c.network) {
      throw new Error(
        `[x402] scheme "${scheme}" violated accepts mutation policy: scheme/network are immutable (index ${i})`
      );
    }
    if (b.maxTimeoutSeconds !== c.maxTimeoutSeconds || b.payTo !== c.payTo || b.amount !== c.amount || b.asset !== c.asset) {
      throw new Error(
        `[x402] scheme "${scheme}" violated accepts mutation policy: payment terms are immutable (index ${i})`
      );
    }
    for (const key of Object.keys(b.extra)) {
      if (!Object.prototype.hasOwnProperty.call(c.extra, key)) {
        throw new Error(
          `[x402] scheme "${scheme}" violated accepts mutation policy: extra["${key}"] was removed (index ${i})`
        );
      }
      if (!deepEqual(c.extra[key], b.extra[key])) {
        throw new Error(
          `[x402] scheme "${scheme}" violated accepts mutation policy: extra["${key}"] may not be changed (index ${i})`
        );
      }
    }
    if (!isMatchingAccept && Object.keys(c.extra).length !== Object.keys(b.extra).length) {
      throw new Error(
        `[x402] scheme "${scheme}" violated accepts mutation policy: only matching accepts may receive new extra fields (index ${i})`
      );
    }
  }
}
function snapshotSettleResponseCore(result) {
  return {
    success: result.success,
    transaction: result.transaction,
    network: result.network,
    amount: result.amount,
    payer: result.payer,
    errorReason: result.errorReason,
    errorMessage: result.errorMessage
  };
}
function assertSettleResponseCoreUnchanged(before, after, extensionKey) {
  const keys = [
    "success",
    "transaction",
    "network",
    "amount",
    "payer",
    "errorReason",
    "errorMessage"
  ];
  for (const k of keys) {
    if (!deepEqual(after[k], before[k])) {
      throw new Error(
        `[x402] extension "${extensionKey}" violated settlement mutation policy: field "${String(k)}" is immutable after facilitator settle`
      );
    }
  }
}
function assertAdditivePayloadEnrichment(payload, enrichment, callerLabel) {
  for (const key of Object.keys(enrichment)) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    throw new Error(
      `[x402] ${callerLabel} violated settlement payload enrichment policy: "${key}" already exists on the client payload`
    );
  }
}
function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertAdditiveSettlementExtra(extra, enrichment, callerLabel) {
  assertAdditiveRecord(extra, enrichment, callerLabel, "extra");
}
function mergeAdditiveSettlementExtra(extra, enrichment) {
  return mergeAdditiveRecord(extra, enrichment);
}
function assertAdditiveRecord(target, enrichment, callerLabel, path) {
  for (const [key, enrichmentValue] of Object.entries(enrichment)) {
    const nextPath = `${path}["${key}"]`;
    if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
    const targetValue = target[key];
    if (isPlainRecord(targetValue) && isPlainRecord(enrichmentValue)) {
      assertAdditiveRecord(targetValue, enrichmentValue, callerLabel, nextPath);
      continue;
    }
    throw new Error(
      `[x402] ${callerLabel} violated settlement response enrichment policy: ${nextPath} already exists on the settlement result`
    );
  }
}
function mergeAdditiveRecord(target, enrichment) {
  const merged = { ...target };
  for (const [key, enrichmentValue] of Object.entries(enrichment)) {
    const targetValue = merged[key];
    if (isPlainRecord(targetValue) && isPlainRecord(enrichmentValue)) {
      merged[key] = mergeAdditiveRecord(targetValue, enrichmentValue);
      continue;
    }
    merged[key] = enrichmentValue;
  }
  return merged;
}

// src/schemas/index.ts
var import_zod = require("zod");
var import_zod2 = require("zod");
var NonEmptyString = import_zod.z.string().min(1);
var Any = import_zod.z.record(import_zod.z.unknown());
var OptionalAny = import_zod.z.record(import_zod.z.unknown()).optional().nullable();
var NetworkSchemaV1 = NonEmptyString;
var NetworkSchemaV2 = import_zod.z.string().min(3).refine((val) => val.includes(":"), {
  message: "Network must be in CAIP-2 format (e.g., 'eip155:84532')"
});
var NetworkSchema = import_zod.z.union([NetworkSchemaV1, NetworkSchemaV2]);
var PRINTABLE_ASCII_REGEX = /^[\x20-\x7e]+$/;
var ResourceInfoSchema = import_zod.z.object({
  url: NonEmptyString,
  description: import_zod.z.string().optional(),
  mimeType: import_zod.z.string().optional(),
  serviceName: import_zod.z.string().min(1).max(32).regex(PRINTABLE_ASCII_REGEX).optional(),
  tags: import_zod.z.array(import_zod.z.string().min(1).max(32).regex(PRINTABLE_ASCII_REGEX)).max(5).optional(),
  iconUrl: import_zod.z.string().max(2048).optional()
});
var PaymentRequirementsV1Schema = import_zod.z.object({
  scheme: NonEmptyString,
  network: NetworkSchemaV1,
  maxAmountRequired: NonEmptyString,
  resource: NonEmptyString,
  // URL string in V1
  description: import_zod.z.string(),
  mimeType: import_zod.z.string().optional(),
  outputSchema: Any.optional().nullable(),
  payTo: NonEmptyString,
  maxTimeoutSeconds: import_zod.z.number().positive(),
  asset: NonEmptyString,
  extra: OptionalAny
});
var PaymentRequiredV1Schema = import_zod.z.object({
  x402Version: import_zod.z.literal(1),
  error: import_zod.z.string().optional(),
  accepts: import_zod.z.array(PaymentRequirementsV1Schema).min(1)
});
var PaymentPayloadV1Schema = import_zod.z.object({
  x402Version: import_zod.z.literal(1),
  scheme: NonEmptyString,
  network: NetworkSchemaV1,
  payload: Any
});
var PaymentRequirementsV2Schema = import_zod.z.object({
  scheme: NonEmptyString,
  network: NetworkSchemaV2,
  amount: NonEmptyString,
  asset: NonEmptyString,
  payTo: NonEmptyString,
  maxTimeoutSeconds: import_zod.z.number().positive(),
  extra: OptionalAny
});
var PaymentRequiredV2Schema = import_zod.z.object({
  x402Version: import_zod.z.literal(2),
  error: import_zod.z.string().optional(),
  resource: ResourceInfoSchema,
  accepts: import_zod.z.array(PaymentRequirementsV2Schema).min(1),
  extensions: OptionalAny
});
var PaymentPayloadV2Schema = import_zod.z.object({
  x402Version: import_zod.z.literal(2),
  resource: ResourceInfoSchema.optional(),
  accepted: PaymentRequirementsV2Schema,
  payload: Any,
  extensions: OptionalAny
});
var PaymentRequirementsSchema = import_zod.z.union([
  PaymentRequirementsV1Schema,
  PaymentRequirementsV2Schema
]);
var PaymentRequiredSchema = import_zod.z.discriminatedUnion("x402Version", [
  PaymentRequiredV1Schema,
  PaymentRequiredV2Schema
]);
var PaymentPayloadSchema = import_zod.z.discriminatedUnion("x402Version", [
  PaymentPayloadV1Schema,
  PaymentPayloadV2Schema
]);

// src/http/httpFacilitatorClient.ts
var DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";
var GET_SUPPORTED_RETRIES = 3;
var GET_SUPPORTED_RETRY_DELAY_MS = 1e3;
var MAX_RETRY_DELAY_MS = 3e4;
function computeRetryDelay(retryAfter, attempt) {
  let delay = null;
  if (retryAfter !== null) {
    const trimmedRetryAfter = retryAfter.trim();
    if (/^\d+$/.test(trimmedRetryAfter)) {
      delay = Number(trimmedRetryAfter) * 1e3;
    } else {
      const retryDate = Date.parse(retryAfter);
      if (!isNaN(retryDate)) {
        delay = retryDate - Date.now();
      }
    }
  }
  if (delay === null || delay <= 0) {
    delay = GET_SUPPORTED_RETRY_DELAY_MS * Math.pow(2, attempt);
  }
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}
var verifyResponseSchema = import_zod2.z.object({
  isValid: import_zod2.z.boolean(),
  invalidReason: import_zod2.z.string().nullish().transform((v) => v ?? void 0),
  invalidMessage: import_zod2.z.string().nullish().transform((v) => v ?? void 0),
  payer: import_zod2.z.string().nullish().transform((v) => v ?? void 0),
  extensions: import_zod2.z.record(import_zod2.z.string(), import_zod2.z.unknown()).nullish().transform((v) => v ?? void 0),
  extra: import_zod2.z.record(import_zod2.z.string(), import_zod2.z.unknown()).nullish().transform((v) => v ?? void 0)
});
var settleResponseSchema = import_zod2.z.object({
  success: import_zod2.z.boolean(),
  errorReason: import_zod2.z.string().nullish().transform((v) => v ?? void 0),
  errorMessage: import_zod2.z.string().nullish().transform((v) => v ?? void 0),
  payer: import_zod2.z.string().nullish().transform((v) => v ?? void 0),
  transaction: import_zod2.z.string(),
  network: import_zod2.z.custom((value) => typeof value === "string"),
  amount: import_zod2.z.string().nullish().transform((v) => v ?? void 0),
  extensions: import_zod2.z.record(import_zod2.z.string(), import_zod2.z.unknown()).nullish().transform((v) => v ?? void 0),
  extra: import_zod2.z.record(import_zod2.z.string(), import_zod2.z.unknown()).nullish().transform((v) => v ?? void 0)
});
var supportedKindSchema = import_zod2.z.object({
  x402Version: import_zod2.z.number(),
  scheme: import_zod2.z.string(),
  network: import_zod2.z.custom(
    (value) => typeof value === "string"
  ),
  extra: import_zod2.z.record(import_zod2.z.string(), import_zod2.z.unknown()).nullish().transform((v) => v ?? void 0)
});
var supportedResponseSchema = import_zod2.z.object({
  kinds: import_zod2.z.array(supportedKindSchema),
  extensions: import_zod2.z.array(import_zod2.z.string()).default([]),
  signers: import_zod2.z.record(import_zod2.z.string(), import_zod2.z.array(import_zod2.z.string())).default({})
});
function responseExcerpt(text, limit = 200) {
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "<empty response>";
  }
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, limit - 3)}...`;
}
var EXTENSION_RESPONSE_LOG_FIELD_ALLOWLIST = ["status", "rejectedReason", "reason", "code"];
function logExtensionResponsesHeader(response) {
  const header = response.headers.get("EXTENSION-RESPONSES");
  if (!header) return;
  try {
    const decoded = JSON.parse(safeBase64Decode(header));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return;
    const sanitized = {};
    for (const [extensionKey, payload] of Object.entries(decoded)) {
      const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
      const filtered = {};
      for (const key of EXTENSION_RESPONSE_LOG_FIELD_ALLOWLIST) {
        if (source[key] !== void 0) {
          filtered[key] = source[key];
        }
      }
      sanitized[extensionKey] = filtered;
    }
    console.log(`[x402] extension responses: ${JSON.stringify(sanitized)}`);
  } catch {
  }
}
async function parseSuccessResponse(response, schema, operation) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FacilitatorResponseError(
      `Facilitator ${operation} returned invalid JSON: ${responseExcerpt(text)}`
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new FacilitatorResponseError(
      `Facilitator ${operation} returned invalid data: ${responseExcerpt(text)}`
    );
  }
  return parsed.data;
}
var HTTPFacilitatorClient = class {
  /**
   * Creates a new HTTPFacilitatorClient instance.
   *
   * @param config - Configuration options for the facilitator client
   */
  constructor(config) {
    this.url = (config?.url || DEFAULT_FACILITATOR_URL).replace(/\/+$/, "");
    this._createAuthHeaders = config?.createAuthHeaders;
  }
  /**
   * Verify a payment with the facilitator
   *
   * @param paymentPayload - The payment to verify
   * @param paymentRequirements - The requirements to verify against
   * @returns Verification response
   */
  async verify(paymentPayload, paymentRequirements) {
    let headers = {
      "Content-Type": "application/json"
    };
    if (this._createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders("verify");
      headers = { ...headers, ...authHeaders.headers };
    }
    const response = await fetch(`${this.url}/verify`, {
      method: "POST",
      headers,
      redirect: "follow",
      body: JSON.stringify({
        x402Version: paymentPayload.x402Version,
        paymentPayload: this.toJsonSafe(paymentPayload),
        paymentRequirements: this.toJsonSafe(paymentRequirements)
      })
    });
    if (!response.ok) {
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Facilitator verify failed (${response.status}): ${responseExcerpt(text)}`);
      }
      if (typeof data === "object" && data !== null && "isValid" in data) {
        throw new VerifyError(response.status, data);
      }
      throw new Error(
        `Facilitator verify failed (${response.status}): ${responseExcerpt(JSON.stringify(data))}`
      );
    }
    const verifyResult = await parseSuccessResponse(response, verifyResponseSchema, "verify");
    logExtensionResponsesHeader(response);
    return verifyResult;
  }
  /**
   * Settle a payment with the facilitator
   *
   * @param paymentPayload - The payment to settle
   * @param paymentRequirements - The requirements for settlement
   * @returns Settlement response
   */
  async settle(paymentPayload, paymentRequirements) {
    let headers = {
      "Content-Type": "application/json"
    };
    if (this._createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders("settle");
      headers = { ...headers, ...authHeaders.headers };
    }
    const response = await fetch(`${this.url}/settle`, {
      method: "POST",
      headers,
      redirect: "follow",
      body: JSON.stringify({
        x402Version: paymentPayload.x402Version,
        paymentPayload: this.toJsonSafe(paymentPayload),
        paymentRequirements: this.toJsonSafe(paymentRequirements)
      })
    });
    if (!response.ok) {
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Facilitator settle failed (${response.status}): ${responseExcerpt(text)}`);
      }
      if (typeof data === "object" && data !== null && "success" in data) {
        throw new SettleError(response.status, data);
      }
      throw new Error(
        `Facilitator settle failed (${response.status}): ${responseExcerpt(JSON.stringify(data))}`
      );
    }
    const settleResult = await parseSuccessResponse(response, settleResponseSchema, "settle");
    logExtensionResponsesHeader(response);
    return settleResult;
  }
  /**
   * Get supported payment kinds and extensions from the facilitator.
   * Retries with exponential backoff on 429 rate limit errors.
   *
   * @returns Supported payment kinds and extensions
   */
  async getSupported() {
    let headers = {
      "Content-Type": "application/json"
    };
    if (this._createAuthHeaders) {
      const authHeaders = await this.createAuthHeaders("supported");
      headers = { ...headers, ...authHeaders.headers };
    }
    let lastError = null;
    for (let attempt = 0; attempt < GET_SUPPORTED_RETRIES; attempt++) {
      const response = await fetch(`${this.url}/supported`, {
        method: "GET",
        headers,
        redirect: "follow"
      });
      if (response.ok) {
        return parseSuccessResponse(response, supportedResponseSchema, "supported");
      }
      const errorText = await response.text().catch(() => response.statusText);
      lastError = new Error(
        `Facilitator getSupported failed (${response.status}): ${responseExcerpt(errorText)}`
      );
      if (response.status === 429 && attempt < GET_SUPPORTED_RETRIES - 1) {
        const delay = computeRetryDelay(response.headers.get("Retry-After"), attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw lastError;
    }
    throw lastError ?? new Error("Facilitator getSupported failed after retries");
  }
  /**
   * Creates authentication headers for a specific path.
   *
   * @param path - The path to create authentication headers for (e.g., "verify", "settle", "supported")
   * @returns An object containing the authentication headers for the specified path
   */
  async createAuthHeaders(path) {
    if (this._createAuthHeaders) {
      const authHeaders = await this._createAuthHeaders();
      return {
        headers: authHeaders[path] ?? {}
      };
    }
    return {
      headers: {}
    };
  }
  /**
   * Helper to convert objects to JSON-safe format.
   * Handles BigInt and other non-JSON types.
   *
   * @param obj - The object to convert
   * @returns The JSON-safe representation of the object
   */
  toJsonSafe(obj) {
    return JSON.parse(
      JSON.stringify(obj, (_, value) => typeof value === "bigint" ? value.toString() : value)
    );
  }
};

// src/index.ts
var x402Version = 2;

// src/server/x402ResourceServer.ts
function resolveSettlementOverrideAmount(rawAmount, requirements, decimals = 6) {
  const percentMatch = rawAmount.match(/^(\d+(?:\.\d{0,2})?)%$/);
  if (percentMatch) {
    const [intPart, decPart = ""] = percentMatch[1].split(".");
    const scaledPercent = BigInt(intPart) * 100n + BigInt(decPart.padEnd(2, "0").slice(0, 2));
    const base = BigInt(requirements.amount);
    return (base * scaledPercent / 10000n).toString();
  }
  const dollarMatch = rawAmount.match(/^\$(\d+(?:\.\d+)?)$/);
  if (dollarMatch) {
    const dollars = parseFloat(dollarMatch[1]);
    return Math.round(dollars * 10 ** decimals).toString();
  }
  return rawAmount;
}
var x402ResourceServer = class {
  /**
   * Creates a new x402ResourceServer instance.
   *
   * @param facilitatorClients - Optional facilitator client(s) for payment processing
   */
  constructor(facilitatorClients) {
    this.registeredServerSchemes = /* @__PURE__ */ new Map();
    this.schemeHookAdapters = /* @__PURE__ */ new Map();
    this.supportedResponsesMap = /* @__PURE__ */ new Map();
    this.facilitatorClientsMap = /* @__PURE__ */ new Map();
    this.registeredExtensions = /* @__PURE__ */ new Map();
    this.extensionHookAdapters = /* @__PURE__ */ new Map();
    this.beforeVerifyHooks = [];
    this.afterVerifyHooks = [];
    this.onVerifyFailureHooks = [];
    this.beforeSettleHooks = [];
    this.afterSettleHooks = [];
    this.onSettleFailureHooks = [];
    this.onVerifiedPaymentCanceledHooks = [];
    if (!facilitatorClients) {
      this.facilitatorClients = [new HTTPFacilitatorClient()];
    } else if (Array.isArray(facilitatorClients)) {
      this.facilitatorClients = facilitatorClients.length > 0 ? facilitatorClients : [new HTTPFacilitatorClient()];
    } else {
      this.facilitatorClients = [facilitatorClients];
    }
  }
  /**
   * Register a scheme/network server implementation.
   *
   * @param network - The network identifier
   * @param server - The scheme/network server implementation
   * @returns The x402ResourceServer instance for chaining
   */
  register(network, server) {
    if (!this.registeredServerSchemes.has(network)) {
      this.registeredServerSchemes.set(network, /* @__PURE__ */ new Map());
    }
    const serverByScheme = this.registeredServerSchemes.get(network);
    serverByScheme.set(server.scheme, server);
    if (!this.schemeHookAdapters.has(network)) {
      this.schemeHookAdapters.set(network, /* @__PURE__ */ new Map());
    }
    const hooksByScheme = this.schemeHookAdapters.get(network);
    const hooks = server.schemeHooks;
    if (!hooks) {
      hooksByScheme.delete(server.scheme);
      return this;
    }
    const handles = {};
    if (hooks.onBeforeVerify) handles.beforeVerify = hooks.onBeforeVerify;
    if (hooks.onAfterVerify) handles.afterVerify = hooks.onAfterVerify;
    if (hooks.onVerifyFailure) handles.onVerifyFailure = hooks.onVerifyFailure;
    if (hooks.onBeforeSettle) handles.beforeSettle = hooks.onBeforeSettle;
    if (hooks.onAfterSettle) handles.afterSettle = hooks.onAfterSettle;
    if (hooks.onSettleFailure) handles.onSettleFailure = hooks.onSettleFailure;
    if (hooks.onVerifiedPaymentCanceled) {
      handles.onVerifiedPaymentCanceled = hooks.onVerifiedPaymentCanceled;
    }
    if (Object.keys(handles).length > 0) {
      hooksByScheme.set(server.scheme, handles);
    } else {
      hooksByScheme.delete(server.scheme);
    }
    return this;
  }
  /**
   * Check if a scheme is registered for a given network.
   *
   * @param network - The network identifier
   * @param scheme - The payment scheme name
   * @returns True if the scheme is registered for the network, false otherwise
   */
  hasRegisteredScheme(network, scheme) {
    return !!findByNetworkAndScheme(this.registeredServerSchemes, scheme, network);
  }
  /**
   * Returns the decimal precision for the asset specified in the given payment requirements.
   * Looks up the registered scheme for the network and delegates to its getAssetDecimals
   * method if available. Falls back to 6 (standard for USDC stablecoins) when the scheme
   * does not implement getAssetDecimals or is not registered.
   *
   * @param requirements - The payment requirements containing scheme, network, and asset
   * @returns The number of decimal places for the asset
   */
  getAssetDecimalsForRequirements(requirements) {
    const scheme = findByNetworkAndScheme(
      this.registeredServerSchemes,
      requirements.scheme,
      requirements.network
    );
    return scheme?.getAssetDecimals?.(requirements.asset ?? "", requirements.network) ?? 6;
  }
  /**
   * Registers a resource server extension (enrichment and optional verify/settle hooks).
   * Re-registering the same key overwrites; omitting `hooks` removes adapter handles for that key.
   *
   * @param extension - Extension definition including `key` and optional `hooks`
   * @returns This server instance for chaining
   */
  registerExtension(extension) {
    this.registeredExtensions.set(extension.key, extension);
    const extensionKey = extension.key;
    const extensionHooks = extension.hooks;
    if (!extensionHooks) {
      this.extensionHookAdapters.delete(extensionKey);
      return this;
    }
    const handles = {};
    const bindExtensionHookAdapter = (extensionHookKey, adapterPhase) => {
      const impl = extensionHooks[extensionHookKey];
      if (!impl) return;
      handles[adapterPhase] = (async (ctx) => {
        if (ctx.declaredExtensions[extensionKey] === void 0) return;
        return impl(
          ctx.declaredExtensions[extensionKey],
          ctx
        );
      });
    };
    bindExtensionHookAdapter("onBeforeVerify", "beforeVerify");
    bindExtensionHookAdapter("onAfterVerify", "afterVerify");
    bindExtensionHookAdapter("onVerifyFailure", "onVerifyFailure");
    bindExtensionHookAdapter("onBeforeSettle", "beforeSettle");
    bindExtensionHookAdapter("onAfterSettle", "afterSettle");
    bindExtensionHookAdapter("onSettleFailure", "onSettleFailure");
    bindExtensionHookAdapter("onVerifiedPaymentCanceled", "onVerifiedPaymentCanceled");
    if (Object.keys(handles).length > 0) {
      this.extensionHookAdapters.set(extensionKey, handles);
    } else {
      this.extensionHookAdapters.delete(extensionKey);
    }
    return this;
  }
  /**
   * Check if an extension is registered.
   *
   * @param key - The extension key
   * @returns True if the extension is registered
   */
  hasExtension(key) {
    return this.registeredExtensions.has(key);
  }
  /**
   * Get all registered extensions.
   *
   * @returns Array of registered extensions
   */
  getExtensions() {
    return Array.from(this.registeredExtensions.values());
  }
  /**
   * Enriches declared extensions using registered extension hooks.
   *
   * @param declaredExtensions - Extensions declared on the route
   * @param transportContext - Transport-specific context (HTTP, A2A, MCP, etc.)
   * @returns Enriched extensions map
   */
  enrichExtensions(declaredExtensions, transportContext) {
    const enriched = {};
    for (const [key, declaration] of Object.entries(declaredExtensions)) {
      const extension = this.registeredExtensions.get(key);
      if (extension?.enrichDeclaration) {
        try {
          enriched[key] = extension.enrichDeclaration(declaration, transportContext);
        } catch (error) {
          this.warnExtensionHookFailure(key, "enrichDeclaration", error);
          enriched[key] = declaration;
        }
      } else {
        enriched[key] = declaration;
      }
    }
    return enriched;
  }
  /**
   * Register a hook to execute before payment verification.
   * Can abort verification by returning { abort: true, reason: string }
   *
   * @param hook - The hook function to register
   * @returns The x402ResourceServer instance for chaining
   */
  onBeforeVerify(hook) {
    this.beforeVerifyHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute after successful payment verification.
   *
   * @param hook - The hook function to register
   * @returns The x402ResourceServer instance for chaining
   */
  onAfterVerify(hook) {
    this.afterVerifyHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute when payment verification fails.
   * Can recover from failure by returning { recovered: true, result: VerifyResponse }
   *
   * @param hook - The hook function to register
   * @returns The x402ResourceServer instance for chaining
   */
  onVerifyFailure(hook) {
    this.onVerifyFailureHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute before payment settlement.
   * Can abort settlement by returning { abort: true, reason: string }
   *
   * @param hook - The hook function to register
   * @returns The x402ResourceServer instance for chaining
   */
  onBeforeSettle(hook) {
    this.beforeSettleHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute after successful payment settlement.
   *
   * @param hook - The hook function to register
   * @returns The x402ResourceServer instance for chaining
   */
  onAfterSettle(hook) {
    this.afterSettleHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute when payment settlement fails.
   * Can recover from failure by returning { recovered: true, result: SettleResponse }
   *
   * @param hook - The hook function to register
   * @returns The x402ResourceServer instance for chaining
   */
  onSettleFailure(hook) {
    this.onSettleFailureHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute when verified payment work is canceled before settlement.
   *
   * @param hook - The hook function to register
   * @returns The x402ResourceServer instance for chaining
   */
  onVerifiedPaymentCanceled(hook) {
    this.onVerifiedPaymentCanceledHooks.push(hook);
    return this;
  }
  /**
   * Initialize by fetching supported kinds from all facilitators
   * Creates mappings for supported responses and facilitator clients
   * Earlier facilitators in the array get precedence
   */
  async initialize() {
    this.supportedResponsesMap.clear();
    this.facilitatorClientsMap.clear();
    let lastError;
    for (const facilitatorClient of this.facilitatorClients) {
      try {
        const supported = await facilitatorClient.getSupported();
        for (const kind of supported.kinds) {
          const x402Version2 = kind.x402Version;
          if (!this.supportedResponsesMap.has(x402Version2)) {
            this.supportedResponsesMap.set(x402Version2, /* @__PURE__ */ new Map());
          }
          const responseVersionMap = this.supportedResponsesMap.get(x402Version2);
          if (!this.facilitatorClientsMap.has(x402Version2)) {
            this.facilitatorClientsMap.set(x402Version2, /* @__PURE__ */ new Map());
          }
          const clientVersionMap = this.facilitatorClientsMap.get(x402Version2);
          if (!responseVersionMap.has(kind.network)) {
            responseVersionMap.set(kind.network, /* @__PURE__ */ new Map());
          }
          const responseNetworkMap = responseVersionMap.get(kind.network);
          if (!clientVersionMap.has(kind.network)) {
            clientVersionMap.set(kind.network, /* @__PURE__ */ new Map());
          }
          const clientNetworkMap = clientVersionMap.get(kind.network);
          if (!responseNetworkMap.has(kind.scheme)) {
            responseNetworkMap.set(kind.scheme, supported);
            clientNetworkMap.set(kind.scheme, facilitatorClient);
          }
        }
      } catch (error) {
        lastError = error;
        console.warn(`Failed to fetch supported kinds from facilitator: ${error}`);
      }
    }
    if (this.supportedResponsesMap.size === 0) {
      throw lastError ? new Error(
        "Failed to initialize: no supported payment kinds loaded from any facilitator.",
        {
          cause: lastError
        }
      ) : new Error(
        "Failed to initialize: no supported payment kinds loaded from any facilitator."
      );
    }
  }
  /**
   * Get supported kind for a specific version, network, and scheme
   *
   * @param x402Version - The x402 version
   * @param network - The network identifier
   * @param scheme - The payment scheme
   * @returns The supported kind or undefined if not found
   */
  getSupportedKind(x402Version2, network, scheme) {
    const versionMap = this.supportedResponsesMap.get(x402Version2);
    if (!versionMap) return void 0;
    const supportedResponse = findByNetworkAndScheme(versionMap, scheme, network);
    if (!supportedResponse) return void 0;
    return supportedResponse.kinds.find(
      (kind) => kind.x402Version === x402Version2 && kind.network === network && kind.scheme === scheme
    );
  }
  /**
   * Get facilitator extensions for a specific version, network, and scheme
   *
   * @param x402Version - The x402 version
   * @param network - The network identifier
   * @param scheme - The payment scheme
   * @returns The facilitator extensions or empty array if not found
   */
  getFacilitatorExtensions(x402Version2, network, scheme) {
    const versionMap = this.supportedResponsesMap.get(x402Version2);
    if (!versionMap) return [];
    const supportedResponse = findByNetworkAndScheme(versionMap, scheme, network);
    return supportedResponse?.extensions || [];
  }
  /**
   * Build payment requirements for a protected resource
   *
   * @param resourceConfig - Configuration for the protected resource
   * @returns Array of payment requirements
   */
  async buildPaymentRequirements(resourceConfig) {
    const requirements = [];
    const scheme = resourceConfig.scheme;
    const SchemeNetworkServer = findByNetworkAndScheme(
      this.registeredServerSchemes,
      scheme,
      resourceConfig.network
    );
    if (!SchemeNetworkServer) {
      console.warn(
        `No server implementation registered for scheme: ${scheme}, network: ${resourceConfig.network}`
      );
      return requirements;
    }
    const supportedKind = this.getSupportedKind(
      x402Version,
      resourceConfig.network,
      SchemeNetworkServer.scheme
    );
    if (!supportedKind) {
      throw new Error(
        `Facilitator does not support ${SchemeNetworkServer.scheme} on ${resourceConfig.network}. Make sure to call initialize() to fetch supported kinds from facilitators.`
      );
    }
    const facilitatorExtensions = this.getFacilitatorExtensions(
      x402Version,
      resourceConfig.network,
      SchemeNetworkServer.scheme
    );
    const parsedPrice = await SchemeNetworkServer.parsePrice(
      resourceConfig.price,
      resourceConfig.network
    );
    const baseRequirements = {
      scheme: SchemeNetworkServer.scheme,
      network: resourceConfig.network,
      amount: parsedPrice.amount,
      asset: parsedPrice.asset,
      payTo: resourceConfig.payTo,
      maxTimeoutSeconds: resourceConfig.maxTimeoutSeconds || 300,
      // Default 5 minutes
      extra: {
        ...parsedPrice.extra,
        ...resourceConfig.extra
        // Merge user-provided extra
      }
    };
    const requirement = await SchemeNetworkServer.enhancePaymentRequirements(
      baseRequirements,
      supportedKind,
      facilitatorExtensions
    );
    requirements.push(requirement);
    return requirements;
  }
  /**
   * Build payment requirements from multiple payment options
   * This method handles resolving dynamic payTo/price functions and builds requirements for each option
   *
   * @param paymentOptions - Array of payment options to convert
   * @param context - HTTP request context for resolving dynamic functions
   * @returns Array of payment requirements (one per option)
   */
  async buildPaymentRequirementsFromOptions(paymentOptions, context) {
    const allRequirements = [];
    for (const option of paymentOptions) {
      const resolvedPayTo = typeof option.payTo === "function" ? await option.payTo(context) : option.payTo;
      const resolvedPrice = typeof option.price === "function" ? await option.price(context) : option.price;
      const resourceConfig = {
        scheme: option.scheme,
        payTo: resolvedPayTo,
        price: resolvedPrice,
        network: option.network,
        maxTimeoutSeconds: option.maxTimeoutSeconds,
        extra: option.extra
      };
      const requirements = await this.buildPaymentRequirements(resourceConfig);
      allRequirements.push(...requirements);
    }
    return allRequirements;
  }
  /**
   * Create a payment required response
   *
   * @param requirements - Payment requirements
   * @param resourceInfo - Resource information
   * @param error - Error message
   * @param extensions - Optional declared extensions (for per-key enrichment)
   * @param transportContext - Optional transport-specific context (e.g., HTTP request, MCP tool context)
   * @param paymentPayload - Optional failed payment payload for response-time scheme enrichment
   * @returns Payment required response object
   */
  async createPaymentRequiredResponse(requirements, resourceInfo, error, extensions, transportContext, paymentPayload) {
    const acceptsClone = requirements.map((req) => ({
      ...req,
      extra: structuredClone(req.extra)
    }));
    let workingAccepts = acceptsClone;
    let baselineAccepts = snapshotPaymentRequirementsList(workingAccepts);
    let response = {
      x402Version: 2,
      error,
      resource: resourceInfo,
      accepts: workingAccepts
    };
    if (extensions && Object.keys(extensions).length > 0) {
      response.extensions = extensions;
    }
    for (let i = 0; i < workingAccepts.length; i++) {
      const accept = workingAccepts[i];
      const scheme = findByNetworkAndScheme(
        this.registeredServerSchemes,
        accept.scheme,
        accept.network
      );
      if (!scheme?.enrichPaymentRequiredResponse) {
        continue;
      }
      const context = {
        requirements: workingAccepts,
        paymentPayload,
        resourceInfo,
        error,
        paymentRequiredResponse: response,
        transportContext
      };
      const enrichedAccepts = await scheme.enrichPaymentRequiredResponse(context);
      if (enrichedAccepts !== void 0) {
        workingAccepts = enrichedAccepts;
        response.accepts = workingAccepts;
      }
      assertAcceptsAdditiveExtraAfterSchemeEnrich(
        baselineAccepts,
        response.accepts,
        accept.scheme,
        accept.network
      );
      baselineAccepts = snapshotPaymentRequirementsList(response.accepts);
    }
    if (extensions) {
      for (const [key, declaration] of Object.entries(extensions)) {
        const extension = this.registeredExtensions.get(key);
        if (extension?.enrichPaymentRequiredResponse) {
          try {
            const context = {
              requirements: workingAccepts,
              resourceInfo,
              error,
              paymentRequiredResponse: response,
              transportContext
            };
            const extensionData = await extension.enrichPaymentRequiredResponse(
              declaration,
              context
            );
            if (extensionData !== void 0) {
              if (!response.extensions) {
                response.extensions = {};
              }
              response.extensions[key] = extensionData;
            }
          } catch (error2) {
            this.warnExtensionHookFailure(key, "enrichPaymentRequiredResponse", error2);
          }
          assertAcceptsAllowlistedAfterExtensionEnrich(baselineAccepts, workingAccepts, key);
          baselineAccepts = snapshotPaymentRequirementsList(workingAccepts);
        }
      }
    }
    return response;
  }
  /**
   * Verifies a payment against requirements, running manual and in-use extension hooks.
   *
   * @param paymentPayload - Signed payment payload from the client
   * @param requirements - Requirements matched to the payload
   * @param declaredExtensions - Optional per-extension declarations for the request
   * @param transportContext - Optional transport-specific context (e.g. HTTP, MCP)
   * @returns Facilitator verify outcome (optionally carrying a `skipHandler` directive),
   *   or abort/recovery as driven by hooks
   */
  async verifyPayment(paymentPayload, requirements, declaredExtensions, transportContext) {
    const resolvedDeclaredExtensions = declaredExtensions ?? {};
    const extensionKeysInUse = Object.keys(resolvedDeclaredExtensions);
    const matchedScheme = {
      network: requirements.network,
      scheme: requirements.scheme
    };
    const context = {
      paymentPayload,
      requirements,
      declaredExtensions: resolvedDeclaredExtensions,
      transportContext
    };
    for (const { label, hook } of this.getLabeledHooks(
      "beforeVerify",
      extensionKeysInUse,
      matchedScheme
    )) {
      try {
        const result = await hook(context);
        if (result && "abort" in result && result.abort) {
          return {
            isValid: false,
            invalidReason: result.reason,
            invalidMessage: result.message
          };
        }
        if (result && "skip" in result && result.skip) {
          return this.runAfterVerifyHooks(
            result.result,
            context,
            extensionKeysInUse,
            matchedScheme
          );
        }
      } catch (error) {
        this.warnResourceServerHookFailure("beforeVerify", label, error);
      }
    }
    try {
      const facilitatorClient = this.getFacilitatorClient(
        paymentPayload.x402Version,
        requirements.network,
        requirements.scheme
      );
      let verifyResult;
      if (!facilitatorClient) {
        let lastError;
        for (const client of this.facilitatorClients) {
          try {
            verifyResult = await client.verify(paymentPayload, requirements);
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!verifyResult) {
          throw lastError || new Error(
            `No facilitator supports ${requirements.scheme} on ${requirements.network} for v${paymentPayload.x402Version}`
          );
        }
      } else {
        verifyResult = await facilitatorClient.verify(paymentPayload, requirements);
      }
      return this.runAfterVerifyHooks(verifyResult, context, extensionKeysInUse, matchedScheme);
    } catch (error) {
      const failureContext = {
        ...context,
        error
      };
      for (const { label, hook } of this.getLabeledHooks(
        "onVerifyFailure",
        extensionKeysInUse,
        matchedScheme
      )) {
        try {
          const result = await hook(failureContext);
          if (result && "recovered" in result && result.recovered) {
            return result.result;
          }
        } catch (error2) {
          this.warnResourceServerHookFailure("onVerifyFailure", label, error2);
        }
      }
      throw error;
    }
  }
  /**
   * Create cancellation controls for a verified payment attempt.
   *
   * @param paymentPayload - Signed payment payload from the client
   * @param requirements - Requirements matched to the payload
   * @param declaredExtensions - Optional per-extension declarations for the request
   * @param transportContext - Optional transport-specific context
   * @returns Cancellation controls for the verified payment attempt
   */
  createPaymentCancellationDispatcher(paymentPayload, requirements, declaredExtensions, transportContext) {
    const resolvedDeclaredExtensions = declaredExtensions ?? {};
    let cancelPromise;
    return {
      cancel: (options) => {
        if (!cancelPromise) {
          cancelPromise = this.dispatchVerifiedPaymentCanceled(
            paymentPayload,
            requirements,
            resolvedDeclaredExtensions,
            options,
            transportContext
          );
        }
        return cancelPromise;
      }
    };
  }
  /**
   * Settle a verified payment
   *
   * @param paymentPayload - The payment payload to settle
   * @param requirements - The payment requirements
   * @param declaredExtensions - Optional declared extensions (for per-key enrichment)
   * @param transportContext - Optional transport-specific context (e.g., HTTP request/response, MCP tool context)
   * @param settlementOverrides - Optional overrides for settlement parameters (e.g., partial settlement amount)
   * @returns Settlement response
   */
  async settlePayment(paymentPayload, requirements, declaredExtensions, transportContext, settlementOverrides) {
    const resolvedDeclaredExtensions = declaredExtensions ?? {};
    const extensionKeysInUse = Object.keys(resolvedDeclaredExtensions);
    let effectiveRequirements = requirements;
    if (settlementOverrides?.amount !== void 0) {
      const scheme = findByNetworkAndScheme(
        this.registeredServerSchemes,
        requirements.scheme,
        requirements.network
      );
      const decimals = scheme?.getAssetDecimals?.(requirements.asset ?? "", requirements.network) ?? 6;
      effectiveRequirements = {
        ...requirements,
        amount: resolveSettlementOverrideAmount(settlementOverrides.amount, requirements, decimals)
      };
    }
    const context = {
      paymentPayload,
      requirements: effectiveRequirements,
      declaredExtensions: resolvedDeclaredExtensions,
      transportContext
    };
    const matchedScheme = {
      network: effectiveRequirements.network,
      scheme: effectiveRequirements.scheme
    };
    for (const { label, hook } of this.getLabeledHooks(
      "beforeSettle",
      extensionKeysInUse,
      matchedScheme
    )) {
      try {
        const result = await hook(context);
        if (result && "abort" in result && result.abort) {
          throw new SettleError(400, {
            success: false,
            errorReason: result.reason,
            errorMessage: result.message,
            transaction: "",
            network: requirements.network
          });
        }
        if (result && "skip" in result && result.skip) {
          const settleResult = result.result;
          const skipResultContext = {
            ...context,
            result: settleResult,
            transportContext
          };
          for (const { label: label2, hook: hook2 } of this.getLabeledHooks(
            "afterSettle",
            extensionKeysInUse,
            matchedScheme
          )) {
            try {
              await hook2(skipResultContext);
            } catch (error) {
              this.warnResourceServerHookFailure("afterSettle", label2, error);
            }
          }
          await this.enrichSettlementResponse(
            settleResult,
            skipResultContext,
            resolvedDeclaredExtensions,
            matchedScheme
          );
          return settleResult;
        }
      } catch (error) {
        if (error instanceof SettleError) {
          throw error;
        }
        this.warnResourceServerHookFailure("beforeSettle", label, error);
      }
    }
    try {
      const scheme = findByNetworkAndScheme(
        this.registeredServerSchemes,
        matchedScheme.scheme,
        matchedScheme.network
      );
      const payloadEnrichmentHook = scheme?.enrichSettlementPayload;
      if (payloadEnrichmentHook) {
        const label = `scheme "${matchedScheme.scheme}" enrichSettlementPayload`;
        const enrichment = await payloadEnrichmentHook(context);
        if (enrichment !== void 0) {
          assertAdditivePayloadEnrichment(paymentPayload.payload, enrichment, label);
          paymentPayload.payload = { ...paymentPayload.payload, ...enrichment };
        }
      }
      const facilitatorClient = this.getFacilitatorClient(
        paymentPayload.x402Version,
        effectiveRequirements.network,
        effectiveRequirements.scheme
      );
      let settleResult;
      if (!facilitatorClient) {
        let lastError;
        for (const client of this.facilitatorClients) {
          try {
            settleResult = await client.settle(paymentPayload, effectiveRequirements);
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!settleResult) {
          throw lastError || new Error(
            `No facilitator supports ${effectiveRequirements.scheme} on ${effectiveRequirements.network} for v${paymentPayload.x402Version}`
          );
        }
      } else {
        settleResult = await facilitatorClient.settle(paymentPayload, effectiveRequirements);
      }
      const resultContext = {
        ...context,
        result: settleResult
      };
      for (const { label, hook } of this.getLabeledHooks(
        "afterSettle",
        extensionKeysInUse,
        matchedScheme
      )) {
        try {
          await hook(resultContext);
        } catch (error) {
          this.warnResourceServerHookFailure("afterSettle", label, error);
        }
      }
      await this.enrichSettlementResponse(
        settleResult,
        resultContext,
        resolvedDeclaredExtensions,
        matchedScheme
      );
      return settleResult;
    } catch (error) {
      const failureContext = {
        ...context,
        error
      };
      for (const { label, hook } of this.getLabeledHooks(
        "onSettleFailure",
        extensionKeysInUse,
        matchedScheme
      )) {
        try {
          const result = await hook(failureContext);
          if (result && "recovered" in result && result.recovered) {
            return result.result;
          }
        } catch (error2) {
          this.warnResourceServerHookFailure("onSettleFailure", label, error2);
        }
      }
      throw error;
    }
  }
  /**
   * Find matching payment requirements for a payment
   *
   * @param availableRequirements - Array of available payment requirements
   * @param paymentPayload - The payment payload
   * @returns Matching payment requirements or undefined
   */
  /**
   * Validates optional client extension echoes against server-advertised extension info.
   * When the client omits extensions entirely, validation passes.
   *
   * @param paymentRequired - Server payment required response used for matching
   * @param paymentPayload - Client payment payload
   * @returns Whether echoed extension info preserves server-advertised values
   */
  validateExtensions(paymentRequired, paymentPayload) {
    if (paymentPayload.x402Version !== 2) {
      return { valid: true };
    }
    const serverExtensions = paymentRequired.extensions;
    if (!serverExtensions || Object.keys(serverExtensions).length === 0) {
      return { valid: true };
    }
    const clientExtensions = paymentPayload.extensions;
    if (!clientExtensions || Object.keys(clientExtensions).length === 0) {
      return { valid: true };
    }
    for (const [key, echoedValue] of Object.entries(clientExtensions)) {
      if (!Object.prototype.hasOwnProperty.call(serverExtensions, key)) {
        continue;
      }
      const advertisedInfo = getExtensionInfo(serverExtensions[key]);
      const echoedInfo = getExtensionInfo(echoedValue);
      const dynamicFields = this.registeredExtensions.get(key)?.dynamicInfoFields;
      if (!extensionInfoMatchesAdvertised(
        omitFields(advertisedInfo, dynamicFields),
        omitFields(echoedInfo, dynamicFields)
      )) {
        return {
          valid: false,
          invalidReason: "extension_echo_mismatch",
          extensionKey: key
        };
      }
    }
    return { valid: true };
  }
  /**
   * Finds the server-advertised requirement that matches a client payment payload.
   *
   * @param availableRequirements - Payment requirements advertised for the resource.
   * @param paymentPayload - Signed payment payload from the client.
   * @returns The matching requirement, or undefined when none match.
   */
  findMatchingRequirements(availableRequirements, paymentPayload) {
    switch (paymentPayload.x402Version) {
      case 2:
        return availableRequirements.find(
          (paymentRequirements) => paymentRequirementsMatchAccepted(paymentRequirements, paymentPayload.accepted)
        );
      case 1:
        return availableRequirements.find(
          (req) => req.scheme === paymentPayload.accepted.scheme && req.network === paymentPayload.accepted.network
        );
      default:
        throw new Error(
          `Unsupported x402 version: ${paymentPayload.x402Version}`
        );
    }
  }
  /**
   * Logs a warning when a manual or extension adapter lifecycle hook throws.
   *
   * @param phase - Lifecycle phase name (e.g. `beforeVerify`)
   * @param label - Hook source label from {@link getLabeledHooks} (manual index or extension key)
   * @param error - Thrown value or rejection reason
   */
  warnResourceServerHookFailure(phase, label, error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[x402] Resource server ${phase} hook threw (${label}): ${detail}`);
  }
  /**
   * Logs a warning when a registered extension enrichment hook throws.
   *
   * @param extensionKey - Registered extension identifier
   * @param hookName - Hook method name (e.g. `enrichDeclaration`)
   * @param error - Thrown value or rejection reason
   */
  warnExtensionHookFailure(extensionKey, hookName, error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[x402] extension "${extensionKey}" ${hookName} threw: ${detail}`);
  }
  /**
   * Executes after-verify hooks for facilitator and hook-provided verify results.
   *
   * @param verifyResult - Verify response passed to after-verify hooks.
   * @param context - Verify context shared with before-verify hooks.
   * @param extensionKeysInUse - Declared extension keys for this request.
   * @param matchedScheme - Scheme/network selected for this payment.
   * @param matchedScheme.network - Matched payment network.
   * @param matchedScheme.scheme - Matched payment scheme.
   * @returns Verify response with any in-process skip handler directive.
   */
  async runAfterVerifyHooks(verifyResult, context, extensionKeysInUse, matchedScheme) {
    const resultContext = {
      ...context,
      result: verifyResult
    };
    let skipHandler;
    for (const { label, hook } of this.getLabeledHooks(
      "afterVerify",
      extensionKeysInUse,
      matchedScheme
    )) {
      try {
        const directive = await hook(resultContext);
        if (directive && "skipHandler" in directive && directive.skipHandler) {
          skipHandler = directive.response ?? {};
        }
      } catch (error) {
        this.warnResourceServerHookFailure("afterVerify", label, error);
      }
    }
    return skipHandler ? { ...verifyResult, skipHandler } : verifyResult;
  }
  /**
   * Runs response enrichment after settlement lifecycle hooks complete.
   *
   * @param settleResult - Mutable settlement result being returned to the caller
   * @param context - Read-only hook context for enrichment callbacks
   * @param declaredExtensions - Extension declarations present on this payment
   * @param matchedScheme - Scheme/network selected for this settlement
   * @param matchedScheme.network - Matched payment network
   * @param matchedScheme.scheme - Matched payment scheme
   */
  async enrichSettlementResponse(settleResult, context, declaredExtensions, matchedScheme) {
    if (Object.keys(declaredExtensions).length > 0) {
      const settleCoreSnapshot = snapshotSettleResponseCore(settleResult);
      for (const [key, declaration] of Object.entries(declaredExtensions)) {
        const extension = this.registeredExtensions.get(key);
        if (!extension?.enrichSettlementResponse) continue;
        try {
          const extensionData = await extension.enrichSettlementResponse(declaration, context);
          if (extensionData !== void 0) {
            if (!settleResult.extensions) {
              settleResult.extensions = {};
            }
            settleResult.extensions[key] = extensionData;
          }
        } catch (error) {
          this.warnExtensionHookFailure(key, "enrichSettlementResponse", error);
        }
        assertSettleResponseCoreUnchanged(settleCoreSnapshot, settleResult, key);
      }
    }
    const scheme = findByNetworkAndScheme(
      this.registeredServerSchemes,
      matchedScheme.scheme,
      matchedScheme.network
    );
    const hook = scheme?.enrichSettlementResponse;
    if (!hook) return;
    const label = `scheme "${matchedScheme.scheme}" enrichSettlementResponse`;
    try {
      const enrichment = await hook(context);
      if (enrichment === void 0) return;
      assertAdditiveSettlementExtra(settleResult.extra ?? {}, enrichment, label);
      settleResult.extra = mergeAdditiveSettlementExtra(settleResult.extra ?? {}, enrichment);
    } catch (error) {
      this.warnResourceServerHookFailure("enrichSettlementResponse", label, error);
    }
  }
  /**
   * Notify hooks that verified work ended before settlement.
   *
   * @param paymentPayload - Signed payment payload from the client
   * @param requirements - Requirements matched to the payload
   * @param declaredExtensions - Optional per-extension declarations for the request
   * @param options - Cancellation reason and optional diagnostics
   * @param fallbackTransportContext - Optional transport-specific context
   */
  async dispatchVerifiedPaymentCanceled(paymentPayload, requirements, declaredExtensions, options, fallbackTransportContext) {
    const extensionKeysInUse = Object.keys(declaredExtensions);
    const matchedScheme = {
      network: requirements.network,
      scheme: requirements.scheme
    };
    const context = {
      paymentPayload,
      requirements,
      declaredExtensions,
      transportContext: fallbackTransportContext,
      reason: options.reason,
      error: options.error,
      responseStatus: options.responseStatus
    };
    for (const { label, hook } of this.getLabeledHooks(
      "onVerifiedPaymentCanceled",
      extensionKeysInUse,
      matchedScheme
    )) {
      try {
        await hook(context);
      } catch (error) {
        this.warnResourceServerHookFailure("onVerifiedPaymentCanceled", label, error);
      }
    }
  }
  /**
   * Manual hooks first, then the matched scheme adapter, then extension adapters for keys in use.
   * Each entry carries a stable label for logging when a hook throws.
   *
   * @param phase - Hook slot (e.g. `beforeVerify`)
   * @param extensionKeysInUse - Declared extension keys for this request
   * @param matchedScheme - Scheme/network selected for this payment
   * @param matchedScheme.network - Matched payment network
   * @param matchedScheme.scheme - Matched payment scheme
   * @returns Hooks in invocation order with source labels
   */
  getLabeledHooks(phase, extensionKeysInUse, matchedScheme) {
    const manualKey = `${phase}Hooks`;
    const manual = this[manualKey];
    const out = [];
    manual.forEach((hook, index) => {
      out.push({ label: `manual ${phase} hook #${index}`, hook });
    });
    if (matchedScheme) {
      const schemeHandles = findByNetworkAndScheme(
        this.schemeHookAdapters,
        matchedScheme.scheme,
        matchedScheme.network
      );
      const hook = schemeHandles?.[phase];
      if (hook !== void 0) {
        out.push({
          label: `scheme "${matchedScheme.scheme}" ${phase}`,
          hook
        });
      }
    }
    const inUse = new Set(extensionKeysInUse);
    for (const [extensionKey, adapterHandles] of this.extensionHookAdapters.entries()) {
      if (!inUse.has(extensionKey)) continue;
      const hook = adapterHandles[phase];
      if (hook !== void 0) {
        out.push({ label: `extension "${extensionKey}" ${phase}`, hook });
      }
    }
    return out;
  }
  /**
   * Get facilitator client for a specific version, network, and scheme
   *
   * @param x402Version - The x402 version
   * @param network - The network identifier
   * @param scheme - The payment scheme
   * @returns The facilitator client or undefined if not found
   */
  getFacilitatorClient(x402Version2, network, scheme) {
    const versionMap = this.facilitatorClientsMap.get(x402Version2);
    if (!versionMap) return void 0;
    return findByNetworkAndScheme(versionMap, scheme, network);
  }
};
function getExtensionInfo(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "info")) {
    return value.info;
  }
  return value;
}
function omitFields(value, fields) {
  if (!fields || fields.length === 0) {
    return value;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const copy = { ...value };
  for (const field of fields) {
    delete copy[field];
  }
  return copy;
}
function extensionInfoMatchesAdvertised(advertised, echoed) {
  return objectContainsSubset(advertised, echoed);
}
function paymentRequirementsMatchAccepted(required, accepted) {
  const { extra: requiredExtra, ...requiredCore } = required;
  const { extra: acceptedExtra, ...acceptedCore } = accepted;
  if (!deepEqual(requiredCore, acceptedCore)) {
    return false;
  }
  if (requiredExtra === void 0) {
    return true;
  }
  return objectContainsSubset(requiredExtra, acceptedExtra);
}
function objectContainsSubset(expected, actual) {
  if (expected === null || typeof expected !== "object" || Array.isArray(expected)) {
    return deepEqual(expected, actual);
  }
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }
  const actualRecord = actual;
  return Object.entries(expected).every(([key, value]) => {
    const hasActualKey = Object.prototype.hasOwnProperty.call(actualRecord, key);
    if (!hasActualKey) {
      return value === void 0;
    }
    return objectContainsSubset(value, actualRecord[key]);
  });
}

// src/http/index.ts
function decodePaymentSignatureHeader(paymentSignatureHeader) {
  if (!Base64EncodedRegex.test(paymentSignatureHeader)) {
    throw new Error("Invalid payment signature header");
  }
  return JSON.parse(safeBase64Decode(paymentSignatureHeader));
}
function encodePaymentRequiredHeader(paymentRequired) {
  return safeBase64Encode(JSON.stringify(paymentRequired));
}
function encodePaymentResponseHeader(paymentResponse) {
  return safeBase64Encode(JSON.stringify(paymentResponse));
}

// src/http/x402HTTPResourceServer.ts
var SETTLEMENT_OVERRIDES_HEADER = "Settlement-Overrides";
function checkIfBazaarNeeded(routes) {
  if ("accepts" in routes) {
    return !!(routes.extensions && "bazaar" in routes.extensions);
  }
  return Object.values(routes).some((routeConfig) => {
    return !!(routeConfig.extensions && "bazaar" in routeConfig.extensions);
  });
}
var RouteConfigurationError = class extends Error {
  /**
   * Creates a new RouteConfigurationError with the given validation errors.
   *
   * @param errors - The validation errors that caused this exception.
   */
  constructor(errors) {
    const message = `x402 Route Configuration Errors:
${errors.map((e) => `  - ${e.message}`).join("\n")}`;
    super(message);
    this.name = "RouteConfigurationError";
    this.errors = errors;
  }
};
var FALLBACK_PAYWALL_HTML = `<!DOCTYPE html>
<html>
  <head>
    <title>Payment Required</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body>
    <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
      <h1>Payment Required</h1>
      <p>This resource is protected by the x402 payment protocol.</p>
      <p style="margin-top: 2rem; padding: 1rem; background: #fef3c7; border-radius: 0.5rem;">
        <strong>Note to developers:</strong> install <code>@x402/paywall</code> to enable
        the in-browser wallet connection and payment UI. Programmatic clients should read
        the payment requirements from the 402 response headers and JSON body.
      </p>
    </div>
  </body>
</html>`;
var x402HTTPResourceServer = class {
  /**
   * Creates a new x402HTTPResourceServer instance.
   *
   * @param ResourceServer - The core x402ResourceServer instance to use
   * @param routes - Route configuration for payment-protected endpoints
   */
  constructor(ResourceServer, routes) {
    this.compiledRoutes = [];
    this.protectedRequestHooks = [];
    this.ResourceServer = ResourceServer;
    this.routesConfig = routes;
    const normalizedRoutes = typeof routes === "object" && !("accepts" in routes) ? routes : { "*": routes };
    for (const [pattern, config] of Object.entries(normalizedRoutes)) {
      const parsed = this.parseRoutePattern(pattern);
      this.compiledRoutes.push({
        verb: parsed.verb,
        regex: parsed.regex,
        config,
        pattern: parsed.path
      });
    }
  }
  /**
   * Get the underlying x402ResourceServer instance.
   *
   * @returns The underlying x402ResourceServer instance
   */
  get server() {
    return this.ResourceServer;
  }
  /**
   * Get the routes configuration.
   *
   * @returns The routes configuration
   */
  get routes() {
    return this.routesConfig;
  }
  /**
   * Initialize the HTTP resource server.
   *
   * This method initializes the underlying resource server (fetching facilitator support)
   * and then validates that all route payment configurations have corresponding
   * registered schemes and facilitator support.
   *
   * @throws RouteConfigurationError if any route's payment options don't have
   *         corresponding registered schemes or facilitator support
   *
   * @example
   * ```typescript
   * const httpServer = new x402HTTPResourceServer(server, routes);
   * await httpServer.initialize();
   * ```
   */
  async initialize() {
    await this.ResourceServer.initialize();
    const errors = this.validateRouteConfiguration();
    if (errors.length > 0) {
      throw new RouteConfigurationError(errors);
    }
  }
  /**
   * Register a custom paywall provider for generating HTML
   *
   * @param provider - PaywallProvider instance
   * @returns This service instance for chaining
   */
  registerPaywallProvider(provider) {
    this.paywallProvider = provider;
    return this;
  }
  /**
   * Register a hook that runs on every request to a protected route, before payment processing.
   * Hooks are executed in order of registration. The first hook to return a non-void result wins.
   *
   * @param hook - The request hook function
   * @returns The x402HTTPResourceServer instance for chaining
   */
  onProtectedRequest(hook) {
    this.protectedRequestHooks.push(hook);
    return this;
  }
  /**
   * Process HTTP request and return response instructions
   * This is the main entry point for framework middleware
   *
   * @param context - HTTP request context
   * @param paywallConfig - Optional paywall configuration
   * @returns Process result indicating next action for middleware
   */
  async processHTTPRequest(context, paywallConfig) {
    const method = context.method || context.adapter.getMethod();
    context = { ...context, method };
    const { adapter, path } = context;
    const routeMatch = this.getRouteConfig(path, method);
    if (!routeMatch) {
      return { type: "no-payment-required" };
    }
    const { config: routeConfig, pattern: routePattern } = routeMatch;
    const enrichedContext = { ...context, routePattern };
    for (const hook of this.getProtectedRequestHooks(routeConfig)) {
      const result = await hook(enrichedContext, routeConfig);
      if (result && "grantAccess" in result) {
        return { type: "no-payment-required" };
      }
      if (result && "abort" in result) {
        return {
          type: "payment-error",
          response: {
            status: 403,
            headers: { "Content-Type": "application/json" },
            body: { error: result.reason }
          }
        };
      }
    }
    const paymentOptions = this.normalizePaymentOptions(routeConfig);
    const paymentPayload = this.extractPayment(adapter);
    const resourceInfo = {
      url: routeConfig.resource || enrichedContext.adapter.getUrl(),
      description: routeConfig.description || "",
      mimeType: routeConfig.mimeType || "",
      ...routeConfig.serviceName !== void 0 && { serviceName: routeConfig.serviceName },
      ...routeConfig.tags !== void 0 && { tags: routeConfig.tags },
      ...routeConfig.iconUrl !== void 0 && { iconUrl: routeConfig.iconUrl }
    };
    let requirements = await this.ResourceServer.buildPaymentRequirementsFromOptions(
      paymentOptions,
      enrichedContext
    );
    let extensions = routeConfig.extensions;
    if (extensions) {
      extensions = this.ResourceServer.enrichExtensions(extensions, enrichedContext);
    }
    const transportContext = { request: enrichedContext };
    const paymentRequired = await this.ResourceServer.createPaymentRequiredResponse(
      requirements,
      resourceInfo,
      !paymentPayload ? "Payment required" : void 0,
      extensions,
      transportContext
    );
    if (!paymentPayload) {
      const unpaidBody = routeConfig.unpaidResponseBody ? await routeConfig.unpaidResponseBody(enrichedContext) : void 0;
      return {
        type: "payment-error",
        response: this.createHTTPResponse(
          paymentRequired,
          this.isWebBrowser(adapter),
          paywallConfig,
          routeConfig.customPaywallHtml,
          unpaidBody
        )
      };
    }
    try {
      const matchingRequirements = this.ResourceServer.findMatchingRequirements(
        paymentRequired.accepts,
        paymentPayload
      );
      if (!matchingRequirements) {
        const errorResponse = await this.ResourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          "No matching payment requirements",
          extensions,
          transportContext
        );
        return {
          type: "payment-error",
          response: this.createHTTPResponse(errorResponse, false, paywallConfig)
        };
      }
      const extensionResult = this.ResourceServer.validateExtensions(
        paymentRequired,
        paymentPayload
      );
      if (!extensionResult.valid) {
        const errorResponse = await this.ResourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          extensionResult.invalidReason,
          extensions,
          transportContext,
          paymentPayload
        );
        return {
          type: "payment-error",
          response: this.createHTTPResponse(errorResponse, false, paywallConfig)
        };
      }
      const verifyResult = await this.ResourceServer.verifyPayment(
        paymentPayload,
        matchingRequirements,
        extensions,
        transportContext
      );
      if (!verifyResult.isValid) {
        const errorResponse = await this.ResourceServer.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          verifyResult.invalidReason,
          extensions,
          transportContext,
          paymentPayload
        );
        return {
          type: "payment-error",
          response: this.createHTTPResponse(errorResponse, false, paywallConfig)
        };
      }
      if (verifyResult.skipHandler) {
        return await this.processSkipHandlerSettlement(
          paymentPayload,
          matchingRequirements,
          extensions,
          transportContext,
          verifyResult.skipHandler
        );
      }
      const cancellationDispatcher = this.ResourceServer.createPaymentCancellationDispatcher(
        paymentPayload,
        matchingRequirements,
        extensions,
        transportContext
      );
      return {
        type: "payment-verified",
        cancellationDispatcher,
        paymentPayload,
        paymentRequirements: matchingRequirements,
        declaredExtensions: extensions
      };
    } catch (error) {
      if (error instanceof FacilitatorResponseError) {
        throw error;
      }
      const errorResponse = await this.ResourceServer.createPaymentRequiredResponse(
        requirements,
        resourceInfo,
        error instanceof Error ? error.message : "Payment verification failed",
        extensions,
        transportContext
      );
      return {
        type: "payment-error",
        response: this.createHTTPResponse(errorResponse, false, paywallConfig)
      };
    }
  }
  /**
   * Process settlement after successful response
   *
   * @param paymentPayload - The verified payment payload
   * @param requirements - The matching payment requirements
   * @param declaredExtensions - Optional declared extensions (for per-key enrichment)
   * @param transportContext - Optional HTTP transport context
   * @param settlementOverrides - Optional settlement overrides (e.g., partial settlement amount)
   * @returns ProcessSettleResultResponse - SettleResponse with headers if success or errorReason if failure
   */
  async processSettlement(paymentPayload, requirements, declaredExtensions, transportContext, settlementOverrides) {
    if (transportContext?.request && !transportContext.request.method) {
      transportContext = {
        ...transportContext,
        request: {
          ...transportContext.request,
          method: transportContext.request.adapter.getMethod()
        }
      };
    }
    try {
      let resolvedOverrides = settlementOverrides;
      if (!resolvedOverrides && transportContext?.responseHeaders) {
        const overridesKey = SETTLEMENT_OVERRIDES_HEADER.toLowerCase();
        const rawValue = Object.entries(transportContext.responseHeaders).find(
          ([key]) => key.toLowerCase() === overridesKey
        )?.[1];
        if (rawValue) {
          try {
            resolvedOverrides = JSON.parse(rawValue);
          } catch {
          }
        }
      }
      const settleResponse = await this.ResourceServer.settlePayment(
        paymentPayload,
        requirements,
        declaredExtensions,
        transportContext,
        resolvedOverrides
      );
      if (!settleResponse.success) {
        const failure = {
          ...settleResponse,
          success: false,
          errorReason: settleResponse.errorReason || "Settlement failed",
          errorMessage: settleResponse.errorMessage || settleResponse.errorReason || "Settlement failed",
          headers: this.createSettlementHeaders(settleResponse)
        };
        const response = await this.buildSettlementFailureResponse(failure, transportContext);
        return { ...failure, response };
      }
      return {
        ...settleResponse,
        success: true,
        headers: this.createSettlementHeaders(settleResponse),
        requirements
      };
    } catch (error) {
      if (error instanceof FacilitatorResponseError) {
        throw error;
      }
      if (error instanceof SettleError) {
        const errorReason2 = error.errorReason || error.message;
        const settleResponse2 = {
          success: false,
          errorReason: errorReason2,
          errorMessage: error.errorMessage || errorReason2,
          payer: error.payer,
          network: error.network,
          transaction: error.transaction
        };
        const failure2 = {
          ...settleResponse2,
          success: false,
          errorReason: errorReason2,
          headers: this.createSettlementHeaders(settleResponse2)
        };
        const response2 = await this.buildSettlementFailureResponse(failure2, transportContext);
        return { ...failure2, response: response2 };
      }
      const errorReason = error instanceof Error ? error.message : "Settlement failed";
      const settleResponse = {
        success: false,
        errorReason,
        errorMessage: errorReason,
        network: requirements.network,
        transaction: ""
      };
      const failure = {
        ...settleResponse,
        success: false,
        errorReason,
        headers: this.createSettlementHeaders(settleResponse)
      };
      const response = await this.buildSettlementFailureResponse(failure, transportContext);
      return { ...failure, response };
    }
  }
  /**
   * Check if a request requires payment based on route configuration
   *
   * @param context - HTTP request context
   * @returns True if the route requires payment, false otherwise
   */
  requiresPayment(context) {
    const method = context.method || context.adapter.getMethod();
    return this.getRouteConfig(context.path, method) !== void 0;
  }
  /**
   * Settle a verified payment that requested `skipHandler`, packaging the
   * result as a `payment-error` HTTPProcessResult so framework adapters can
   * write the response without invoking the route handler.
   *
   * - On success: status 200 + PAYMENT-RESPONSE header + configured body.
   * - On failure: the standard 402 settlement-failure response.
   *
   * @param paymentPayload - Verified payment payload.
   * @param requirements - Matched payment requirements.
   * @param declaredExtensions - Optional declared extensions for the route.
   * @param transportContext - Optional HTTP transport context.
   * @param skipHandlerResponse - Optional content type + body to return on success.
   * @returns A `payment-error` HTTPProcessResult carrying the final response.
   */
  async processSkipHandlerSettlement(paymentPayload, requirements, declaredExtensions, transportContext, skipHandlerResponse) {
    const settleResult = await this.processSettlement(
      paymentPayload,
      requirements,
      declaredExtensions,
      transportContext
    );
    if (!settleResult.success) {
      return { type: "payment-error", response: settleResult.response };
    }
    const contentType = skipHandlerResponse?.contentType ?? "application/json";
    const body = skipHandlerResponse?.body ?? {};
    return {
      type: "payment-error",
      response: {
        status: 200,
        headers: {
          "Content-Type": contentType,
          ...settleResult.headers
        },
        body,
        isHtml: contentType.includes("text/html")
      }
    };
  }
  /**
   * Build HTTPResponseInstructions for settlement failure.
   * Uses settlementFailedResponseBody hook if configured, otherwise defaults to empty body.
   *
   * @param failure - Settlement failure result with headers
   * @param transportContext - Optional HTTP transport context for the request
   * @returns HTTP response instructions for the 402 settlement failure response
   */
  async buildSettlementFailureResponse(failure, transportContext) {
    const settlementHeaders = failure.headers;
    const routeConfig = transportContext ? this.getRouteConfig(transportContext.request.path, transportContext.request.method) : void 0;
    const customBody = routeConfig?.config.settlementFailedResponseBody ? await routeConfig.config.settlementFailedResponseBody(transportContext.request, failure) : void 0;
    const contentType = customBody ? customBody.contentType : "application/json";
    const body = customBody ? customBody.body : {};
    return {
      status: 402,
      headers: {
        "Content-Type": contentType,
        ...settlementHeaders
      },
      body,
      isHtml: contentType.includes("text/html")
    };
  }
  /**
   * Normalizes a RouteConfig's accepts field into an array of PaymentOptions
   * Handles both single PaymentOption and array formats
   *
   * @param routeConfig - Route configuration
   * @returns Array of payment options
   */
  normalizePaymentOptions(routeConfig) {
    return Array.isArray(routeConfig.accepts) ? routeConfig.accepts : [routeConfig.accepts];
  }
  /**
   * Manual request hooks run before extension transport hooks for declared extensions.
   *
   * @param routeConfig - Route configuration for the matched request
   * @returns Hooks in invocation order
   */
  getProtectedRequestHooks(routeConfig) {
    const hooks = [...this.protectedRequestHooks];
    const declaredExtensions = routeConfig.extensions;
    if (!declaredExtensions) return hooks;
    for (const extension of this.ResourceServer.getExtensions()) {
      const hook = extension.transportHooks?.http?.onProtectedRequest;
      if (!hook || !(extension.key in declaredExtensions)) continue;
      hooks.push(
        (context, routeConfig2) => hook(declaredExtensions[extension.key], context, routeConfig2)
      );
    }
    return hooks;
  }
  /**
   * Validates that all payment options in routes have corresponding registered schemes
   * and facilitator support.
   *
   * @returns Array of validation errors (empty if all routes are valid)
   */
  validateRouteConfiguration() {
    const errors = [];
    const normalizedRoutes = typeof this.routesConfig === "object" && !("accepts" in this.routesConfig) ? Object.entries(this.routesConfig) : [["*", this.routesConfig]];
    for (const [pattern, config] of normalizedRoutes) {
      const pathPart = pattern.includes(" ") ? pattern.split(/\s+/)[1] : pattern;
      if (pathPart && pathPart.includes("*") && config.extensions && "bazaar" in config.extensions) {
        console.warn(
          `[x402] Route "${pattern}": Wildcard (*) patterns with bazaar discovery extensions will auto-generate parameter names (var1, var2, ...). Consider using named parameters instead (e.g. /weather/:city) for better discovery metadata.`
        );
      }
      const paymentOptions = this.normalizePaymentOptions(config);
      for (const option of paymentOptions) {
        if (!this.ResourceServer.hasRegisteredScheme(option.network, option.scheme)) {
          errors.push({
            routePattern: pattern,
            scheme: option.scheme,
            network: option.network,
            reason: "missing_scheme",
            message: `Route "${pattern}": No scheme implementation registered for "${option.scheme}" on network "${option.network}"`
          });
          continue;
        }
        const supportedKind = this.ResourceServer.getSupportedKind(
          x402Version,
          option.network,
          option.scheme
        );
        if (!supportedKind) {
          errors.push({
            routePattern: pattern,
            scheme: option.scheme,
            network: option.network,
            reason: "missing_facilitator",
            message: `Route "${pattern}": Facilitator does not support scheme "${option.scheme}" on network "${option.network}"`
          });
        }
      }
    }
    return errors;
  }
  /**
   * Get route configuration for a request
   *
   * @param path - Request path
   * @param method - HTTP method
   * @returns Route configuration and pattern, or undefined if no match
   */
  getRouteConfig(path, method) {
    const normalizedPath = this.normalizePath(path);
    const upperMethod = method.toUpperCase();
    const matchingRoute = this.compiledRoutes.find(
      (route) => route.regex.test(normalizedPath) && (route.verb === "*" || route.verb === upperMethod)
    );
    if (!matchingRoute) return void 0;
    return { config: matchingRoute.config, pattern: matchingRoute.pattern };
  }
  /**
   * Extract payment from HTTP headers (handles v1 and v2)
   *
   * @param adapter - HTTP adapter
   * @returns Decoded payment payload or null
   */
  extractPayment(adapter) {
    const header = adapter.getHeader("payment-signature") || adapter.getHeader("PAYMENT-SIGNATURE");
    if (header) {
      try {
        return decodePaymentSignatureHeader(header);
      } catch (error) {
        console.warn("Failed to decode PAYMENT-SIGNATURE header:", error);
      }
    }
    return null;
  }
  /**
   * Check if request is from a web browser
   *
   * @param adapter - HTTP adapter
   * @returns True if request appears to be from a browser
   */
  isWebBrowser(adapter) {
    const accept = adapter.getAcceptHeader();
    const userAgent = adapter.getUserAgent();
    return accept.includes("text/html") && userAgent.includes("Mozilla");
  }
  /**
   * Create HTTP response instructions from payment required
   *
   * @param paymentRequired - Payment requirements
   * @param isWebBrowser - Whether request is from browser
   * @param paywallConfig - Paywall configuration
   * @param customHtml - Custom HTML template
   * @param unpaidResponse - Optional custom response (content type and body) for unpaid API requests
   * @returns Response instructions
   */
  createHTTPResponse(paymentRequired, isWebBrowser, paywallConfig, customHtml, unpaidResponse) {
    const status = paymentRequired.error === "permit2_allowance_required" ? 412 : 402;
    const response = this.createHTTPPaymentRequiredResponse(paymentRequired);
    if (isWebBrowser) {
      const html = this.generatePaywallHTML(paymentRequired, paywallConfig, customHtml);
      return {
        status,
        headers: {
          "Content-Type": "text/html",
          ...response.headers
        },
        body: html,
        isHtml: true
      };
    }
    const contentType = unpaidResponse ? unpaidResponse.contentType : "application/json";
    const body = unpaidResponse ? unpaidResponse.body : {};
    return {
      status,
      headers: {
        "Content-Type": contentType,
        ...response.headers
      },
      body
    };
  }
  /**
   * Create HTTP payment required response (v1 puts in body, v2 puts in header)
   *
   * @param paymentRequired - Payment required object
   * @returns Headers and body for the HTTP response
   */
  createHTTPPaymentRequiredResponse(paymentRequired) {
    return {
      headers: {
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired)
      }
    };
  }
  /**
   * Create settlement response headers
   *
   * @param settleResponse - Settlement response
   * @returns Headers to add to response
   */
  createSettlementHeaders(settleResponse) {
    const encoded = encodePaymentResponseHeader(settleResponse);
    return { "PAYMENT-RESPONSE": encoded };
  }
  /**
   * Parse route pattern into verb and regex
   *
   * @param pattern - Route pattern like "GET /api/*", "/api/[id]", or "/api/:id"
   * @returns Parsed pattern with verb and regex
   */
  parseRoutePattern(pattern) {
    const [verb, path] = pattern.includes(" ") ? pattern.split(/\s+/) : ["*", pattern];
    const regex = new RegExp(
      `^${path.replace(/\\/g, "\\\\").replace(/[$()+.?^{|}]/g, "\\$&").replace(/\*/g, ".*?").replace(/\[([^\]]+)\]/g, "[^/]+").replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "[^/]+").replace(/\//g, "\\/")}$`,
      "i"
    );
    return { verb: verb.toUpperCase(), regex, path };
  }
  /**
   * Normalize path for matching
   *
   * @param path - Raw path from request
   * @returns Normalized path
   */
  normalizePath(path) {
    const pathWithoutQuery = path.split(/[?#]/)[0];
    const parts = pathWithoutQuery.split(/(%2[fF]|%5[cC])/);
    const decoded = parts.map((part, i) => {
      if (i % 2 === 1) return part;
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    }).join("");
    return decoded.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/(.+?)\/+$/, "$1");
  }
  /**
   * Generate paywall HTML for browser requests
   *
   * @param paymentRequired - Payment required response
   * @param paywallConfig - Optional paywall configuration
   * @param customHtml - Optional custom HTML template
   * @returns HTML string
   */
  generatePaywallHTML(paymentRequired, paywallConfig, customHtml) {
    if (customHtml) {
      return customHtml;
    }
    if (this.paywallProvider) {
      return this.paywallProvider.generateHtml(paymentRequired, paywallConfig);
    }
    try {
      const paywall = require("@x402/paywall");
      const displayAmount = this.getDisplayAmount(paymentRequired);
      const resource = paymentRequired.resource;
      return paywall.getPaywallHtml({
        amount: displayAmount,
        paymentRequired,
        currentUrl: resource?.url || paywallConfig?.currentUrl || "",
        testnet: paywallConfig?.testnet ?? true,
        appName: paywallConfig?.appName,
        appLogo: paywallConfig?.appLogo,
        sessionTokenEndpoint: paywallConfig?.sessionTokenEndpoint
      });
    } catch {
    }
    return FALLBACK_PAYWALL_HTML;
  }
  /**
   * Extract display amount from payment requirements.
   * Uses the registered scheme's decimal precision for the asset, falling back to 6.
   *
   * @param paymentRequired - The payment required object
   * @returns The display amount in decimal format
   */
  getDisplayAmount(paymentRequired) {
    const accepts = paymentRequired.accepts;
    if (accepts && accepts.length > 0) {
      const firstReq = accepts[0];
      if ("amount" in firstReq) {
        const decimals = this.ResourceServer.getAssetDecimalsForRequirements(firstReq);
        return parseFloat(firstReq.amount) / 10 ** decimals;
      }
    }
    return 0;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FacilitatorResponseError,
  HTTPFacilitatorClient,
  RouteConfigurationError,
  SETTLEMENT_OVERRIDES_HEADER,
  assertAcceptsAdditiveExtraAfterSchemeEnrich,
  assertAcceptsAllowlistedAfterExtensionEnrich,
  assertAdditivePayloadEnrichment,
  assertAdditiveSettlementExtra,
  assertSettleResponseCoreUnchanged,
  checkIfBazaarNeeded,
  getFacilitatorResponseError,
  isVacantStringField,
  snapshotPaymentRequirementsList,
  snapshotSettleResponseCore,
  x402HTTPResourceServer,
  x402ResourceServer
});
//# sourceMappingURL=index.js.map