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

// src/client/index.ts
var client_exports = {};
__export(client_exports, {
  x402Client: () => x402Client,
  x402HTTPClient: () => x402HTTPClient
});
module.exports = __toCommonJS(client_exports);

// src/index.ts
var x402Version = 2;

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

// src/client/x402Client.ts
var x402Client = class _x402Client {
  /**
   * Creates a new x402Client instance.
   *
   * @param paymentRequirementsSelector - Function to select payment requirements from available options
   */
  constructor(paymentRequirementsSelector) {
    this.registeredClientSchemes = /* @__PURE__ */ new Map();
    this.schemeClientHookAdapters = /* @__PURE__ */ new Map();
    this.policies = [];
    this.registeredExtensions = /* @__PURE__ */ new Map();
    this.beforePaymentCreationHooks = [];
    this.afterPaymentCreationHooks = [];
    this.onPaymentCreationFailureHooks = [];
    this.paymentResponseHooks = [];
    this.paymentRequirementsSelector = paymentRequirementsSelector || ((x402Version2, accepts) => accepts[0]);
  }
  /**
   * Creates a new x402Client instance from a configuration object.
   *
   * @param config - The client configuration including schemes, policies, and payment requirements selector
   * @returns A configured x402Client instance
   */
  static fromConfig(config) {
    const client = new _x402Client(config.paymentRequirementsSelector);
    config.schemes.forEach((scheme) => {
      if (scheme.x402Version === 1) {
        client.registerV1(scheme.network, scheme.client);
      } else {
        client.register(scheme.network, scheme.client);
      }
    });
    config.policies?.forEach((policy) => {
      client.registerPolicy(policy);
    });
    return client;
  }
  /**
   * Registers a scheme client for the current x402 version.
   *
   * @param network - The network to register the client for
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  register(network, client) {
    return this._registerScheme(x402Version, network, client);
  }
  /**
   * Registers a scheme client for x402 version 1.
   *
   * @param network - The v1 network identifier (e.g., 'base-sepolia', 'solana-devnet')
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  registerV1(network, client) {
    return this._registerScheme(1, network, client);
  }
  /**
   * Registers a policy to filter or transform payment requirements.
   *
   * Policies are applied in order after filtering by registered schemes
   * and before the selector chooses the final payment requirement.
   *
   * @param policy - Function to filter/transform payment requirements
   * @returns The x402Client instance for chaining
   *
   * @example
   * ```typescript
   * // Prefer cheaper options
   * client.registerPolicy((version, reqs) =>
   *   reqs.filter(r => BigInt(r.value) < BigInt('1000000'))
   * );
   *
   * // Prefer specific networks
   * client.registerPolicy((version, reqs) =>
   *   reqs.filter(r => r.network.startsWith('eip155:'))
   * );
   * ```
   */
  registerPolicy(policy) {
    this.policies.push(policy);
    return this;
  }
  /**
   * Registers a client extension that can enrich payment payloads.
   *
   * Extensions are invoked after the scheme creates the base payload and the
   * payload is wrapped with extensions/resource/accepted data. If the extension's
   * key is present in `paymentRequired.extensions`, the extension's
   * `enrichPaymentPayload` hook is called to modify the payload.
   *
   * @param extension - The client extension to register
   * @returns The x402Client instance for chaining
   */
  registerExtension(extension) {
    this.registeredExtensions.set(extension.key, extension);
    return this;
  }
  /**
   * Get all registered client extensions.
   *
   * @returns Array of registered extensions
   */
  getExtensions() {
    return Array.from(this.registeredExtensions.values());
  }
  /**
   * Register a hook to execute before payment payload creation.
   * Can abort creation by returning { abort: true, reason: string }
   *
   * @param hook - The hook function to register
   * @returns The x402Client instance for chaining
   */
  onBeforePaymentCreation(hook) {
    this.beforePaymentCreationHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute after successful payment payload creation.
   *
   * @param hook - The hook function to register
   * @returns The x402Client instance for chaining
   */
  onAfterPaymentCreation(hook) {
    this.afterPaymentCreationHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute when payment payload creation fails.
   * Can recover from failure by returning { recovered: true, payload: PaymentPayload }
   *
   * @param hook - The hook function to register
   * @returns The x402Client instance for chaining
   */
  onPaymentCreationFailure(hook) {
    this.onPaymentCreationFailureHooks.push(hook);
    return this;
  }
  /**
   * Register a hook to execute after a paid request completes.
   * Can signal recovery by returning { recovered: true }, causing the transport to retry.
   *
   * @param hook - The hook function to register
   * @returns The x402Client instance for chaining
   */
  onPaymentResponse(hook) {
    this.paymentResponseHooks.push(hook);
    return this;
  }
  /**
   * Fires all registered payment response hooks in order.
   * Returns `{ recovered: true }` if any hook signals recovery (first wins).
   *
   * @param ctx - The payment response context
   * @returns Recovery signal or undefined
   */
  async handlePaymentResponse(ctx) {
    for (const hook of this.getLabeledHooks(
      "onPaymentResponse",
      ctx.paymentPayload.x402Version,
      ctx.requirements,
      ctx.paymentRequired?.extensions ?? ctx.paymentPayload.extensions
    )) {
      const result = await hook(ctx);
      if (result && "recovered" in result && result.recovered) {
        return { recovered: true };
      }
    }
    return void 0;
  }
  /**
   * Creates a payment payload based on a PaymentRequired response.
   *
   * Automatically extracts x402Version, resource, and extensions from the PaymentRequired
   * response and constructs a complete PaymentPayload with the accepted requirements.
   *
   * @param paymentRequired - The PaymentRequired response from the server
   * @returns Promise resolving to the complete payment payload
   */
  async createPaymentPayload(paymentRequired) {
    const clientSchemesByNetwork = this.registeredClientSchemes.get(paymentRequired.x402Version);
    if (!clientSchemesByNetwork) {
      throw new Error(`No client registered for x402 version: ${paymentRequired.x402Version}`);
    }
    const requirements = this.selectPaymentRequirements(paymentRequired.x402Version, paymentRequired.accepts);
    const context = {
      paymentRequired,
      selectedRequirements: requirements
    };
    for (const hook of this.getLabeledHooks(
      "beforePaymentCreation",
      paymentRequired.x402Version,
      requirements,
      paymentRequired.extensions
    )) {
      const result = await hook(context);
      if (result && "abort" in result && result.abort) {
        throw new Error(`Payment creation aborted: ${result.reason}`);
      }
    }
    try {
      const schemeNetworkClient = findByNetworkAndScheme(clientSchemesByNetwork, requirements.scheme, requirements.network);
      if (!schemeNetworkClient) {
        throw new Error(`No client registered for scheme: ${requirements.scheme} and network: ${requirements.network}`);
      }
      const partialPayload = await schemeNetworkClient.createPaymentPayload(
        paymentRequired.x402Version,
        requirements,
        { extensions: paymentRequired.extensions }
      );
      let paymentPayload;
      if (partialPayload.x402Version == 1) {
        paymentPayload = partialPayload;
      } else {
        const mergedExtensions = this.mergeExtensions(
          paymentRequired.extensions,
          partialPayload.extensions
        );
        paymentPayload = {
          x402Version: partialPayload.x402Version,
          payload: partialPayload.payload,
          extensions: mergedExtensions,
          resource: paymentRequired.resource,
          accepted: requirements
        };
      }
      paymentPayload = await this.enrichPaymentPayloadWithExtensions(paymentPayload, paymentRequired);
      const createdContext = {
        ...context,
        paymentPayload
      };
      for (const hook of this.getLabeledHooks(
        "afterPaymentCreation",
        paymentRequired.x402Version,
        requirements,
        paymentRequired.extensions
      )) {
        await hook(createdContext);
      }
      return paymentPayload;
    } catch (error) {
      const failureContext = {
        ...context,
        error
      };
      for (const hook of this.getLabeledHooks(
        "onPaymentCreationFailure",
        paymentRequired.x402Version,
        requirements,
        paymentRequired.extensions
      )) {
        const result = await hook(failureContext);
        if (result && "recovered" in result && result.recovered) {
          return result.payload;
        }
      }
      throw error;
    }
  }
  /**
   * Merges server-declared extensions with client extension echoes.
   * Client extension data may add fields, but server-declared fields remain intact.
   *
   * @param serverExtensions - Extensions declared by the server in the 402 response
   * @param clientExtensions - Extensions provided by the client or scheme
   * @returns The merged extensions object, or undefined if both inputs are undefined
   */
  mergeExtensions(serverExtensions, clientExtensions) {
    if (!clientExtensions) return serverExtensions;
    if (!serverExtensions) return clientExtensions;
    const merged = { ...serverExtensions };
    for (const [key, clientValue] of Object.entries(clientExtensions)) {
      const serverValue = merged[key];
      if (serverValue === null || typeof serverValue !== "object" || Array.isArray(serverValue) || clientValue === null || typeof clientValue !== "object" || Array.isArray(clientValue)) {
        merged[key] = clientValue;
        continue;
      }
      const serverRecord = serverValue;
      const clientRecord = clientValue;
      const extensionValue = { ...serverRecord };
      const pending = [{ target: extensionValue, source: clientRecord }];
      for (const item of pending) {
        for (const [fieldKey, clientFieldValue] of Object.entries(item.source)) {
          const serverFieldValue = item.target[fieldKey];
          if (serverFieldValue !== null && typeof serverFieldValue === "object" && !Array.isArray(serverFieldValue) && clientFieldValue !== null && typeof clientFieldValue === "object" && !Array.isArray(clientFieldValue)) {
            const nestedValue = { ...serverFieldValue };
            item.target[fieldKey] = nestedValue;
            pending.push({
              target: nestedValue,
              source: clientFieldValue
            });
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(item.target, fieldKey)) {
            item.target[fieldKey] = clientFieldValue;
          }
        }
      }
      merged[key] = extensionValue;
    }
    return merged;
  }
  /**
   * Enriches a payment payload by calling registered extension hooks.
   * For each extension key present in the PaymentRequired response,
   * invokes the corresponding extension's enrichPaymentPayload callback.
   *
   * @param paymentPayload - The payment payload to enrich with extension data
   * @param paymentRequired - The PaymentRequired response containing extension declarations
   * @returns The enriched payment payload with extension data applied
   */
  async enrichPaymentPayloadWithExtensions(paymentPayload, paymentRequired) {
    if (!paymentRequired.extensions || this.registeredExtensions.size === 0) {
      return paymentPayload;
    }
    let enriched = paymentPayload;
    for (const [key, extension] of this.registeredExtensions) {
      if (key in paymentRequired.extensions && extension.enrichPaymentPayload) {
        enriched = await extension.enrichPaymentPayload(enriched, paymentRequired);
      }
    }
    return {
      ...enriched,
      extensions: this.mergeExtensions(paymentRequired.extensions, enriched.extensions)
    };
  }
  /**
   * Selects appropriate payment requirements based on registered clients and policies.
   *
   * Selection process:
   * 1. Filter by registered schemes (network + scheme support)
   * 2. Apply all registered policies in order
   * 3. Use selector to choose final requirement
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - Array of available payment requirements
   * @returns The selected payment requirements
   */
  selectPaymentRequirements(x402Version2, paymentRequirements) {
    const clientSchemesByNetwork = this.registeredClientSchemes.get(x402Version2);
    if (!clientSchemesByNetwork) {
      throw new Error(`No client registered for x402 version: ${x402Version2}`);
    }
    const supportedPaymentRequirements = paymentRequirements.filter((requirement) => {
      let clientSchemes = findSchemesByNetwork(clientSchemesByNetwork, requirement.network);
      if (!clientSchemes) {
        return false;
      }
      return clientSchemes.has(requirement.scheme);
    });
    if (supportedPaymentRequirements.length === 0) {
      throw new Error(`No network/scheme registered for x402 version: ${x402Version2} which comply with the payment requirements. ${JSON.stringify({
        x402Version: x402Version2,
        paymentRequirements,
        x402Versions: Array.from(this.registeredClientSchemes.keys()),
        networks: Array.from(clientSchemesByNetwork.keys()),
        schemes: Array.from(clientSchemesByNetwork.values()).map((schemes) => Array.from(schemes.keys())).flat()
      })}`);
    }
    let filteredRequirements = supportedPaymentRequirements;
    for (const policy of this.policies) {
      filteredRequirements = policy(x402Version2, filteredRequirements);
      if (filteredRequirements.length === 0) {
        throw new Error(`All payment requirements were filtered out by policies for x402 version: ${x402Version2}`);
      }
    }
    return this.paymentRequirementsSelector(x402Version2, filteredRequirements);
  }
  /**
   * Internal method to register a scheme client.
   *
   * @param x402Version - The x402 protocol version
   * @param network - The network to register the client for
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  _registerScheme(x402Version2, network, client) {
    if (!this.registeredClientSchemes.has(x402Version2)) {
      this.registeredClientSchemes.set(x402Version2, /* @__PURE__ */ new Map());
    }
    const clientSchemesByNetwork = this.registeredClientSchemes.get(x402Version2);
    if (!clientSchemesByNetwork.has(network)) {
      clientSchemesByNetwork.set(network, /* @__PURE__ */ new Map());
    }
    const clientByScheme = clientSchemesByNetwork.get(network);
    clientByScheme.set(client.scheme, client);
    if (!this.schemeClientHookAdapters.has(x402Version2)) {
      this.schemeClientHookAdapters.set(x402Version2, /* @__PURE__ */ new Map());
    }
    const adaptersByNetwork = this.schemeClientHookAdapters.get(x402Version2);
    if (!adaptersByNetwork.has(network)) {
      adaptersByNetwork.set(network, /* @__PURE__ */ new Map());
    }
    const adaptersByScheme = adaptersByNetwork.get(network);
    const hooks = client.schemeHooks;
    if (!hooks) {
      adaptersByScheme.delete(client.scheme);
      return this;
    }
    const handles = {};
    if (hooks.onBeforePaymentCreation) {
      handles.beforePaymentCreation = hooks.onBeforePaymentCreation;
    }
    if (hooks.onAfterPaymentCreation) {
      handles.afterPaymentCreation = hooks.onAfterPaymentCreation;
    }
    if (hooks.onPaymentCreationFailure) {
      handles.onPaymentCreationFailure = hooks.onPaymentCreationFailure;
    }
    if (hooks.onPaymentResponse) {
      handles.onPaymentResponse = hooks.onPaymentResponse;
    }
    if (Object.keys(handles).length > 0) {
      adaptersByScheme.set(client.scheme, handles);
    } else {
      adaptersByScheme.delete(client.scheme);
    }
    return this;
  }
  /**
   * Returns manual hooks followed by the selected scheme hook and declared extension hooks.
   *
   * @param phase - Hook slot to collect
   * @param x402Version - Protocol version for the selected requirement
   * @param requirements - Selected payment requirement
   * @param declaredExtensions - Extension declarations that scope extension hooks
   * @returns Hooks in invocation order
   */
  getLabeledHooks(phase, x402Version2, requirements, declaredExtensions) {
    let manual;
    switch (phase) {
      case "beforePaymentCreation":
        manual = this.beforePaymentCreationHooks;
        break;
      case "afterPaymentCreation":
        manual = this.afterPaymentCreationHooks;
        break;
      case "onPaymentCreationFailure":
        manual = this.onPaymentCreationFailureHooks;
        break;
      case "onPaymentResponse":
        manual = this.paymentResponseHooks;
        break;
    }
    const out = [...manual];
    const adaptersByNetwork = this.schemeClientHookAdapters.get(x402Version2);
    const schemeAdapter = adaptersByNetwork ? findByNetworkAndScheme(adaptersByNetwork, requirements.scheme, requirements.network) : void 0;
    const hook = schemeAdapter?.[phase];
    if (hook !== void 0) {
      out.push(hook);
    }
    if (!declaredExtensions) {
      return out;
    }
    const extensionHookKey = this.getClientExtensionHookKey(phase);
    for (const [extensionKey, extension] of this.registeredExtensions) {
      if (!(extensionKey in declaredExtensions)) continue;
      const extensionHook = extension.hooks?.[extensionHookKey];
      if (!extensionHook) continue;
      out.push((async (ctx) => {
        return extensionHook(declaredExtensions[extensionKey], ctx);
      }));
    }
    return out;
  }
  /**
   * Maps internal hook phases to extension hook names.
   *
   * @param phase - Internal hook phase
   * @returns Extension hook key for the phase
   */
  getClientExtensionHookKey(phase) {
    switch (phase) {
      case "beforePaymentCreation":
        return "onBeforePaymentCreation";
      case "afterPaymentCreation":
        return "onAfterPaymentCreation";
      case "onPaymentCreationFailure":
        return "onPaymentCreationFailure";
      case "onPaymentResponse":
        return "onPaymentResponse";
    }
  }
};

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

// src/http/index.ts
function encodePaymentSignatureHeader(paymentPayload) {
  return safeBase64Encode(JSON.stringify(paymentPayload));
}
function decodePaymentRequiredHeader(paymentRequiredHeader) {
  if (!Base64EncodedRegex.test(paymentRequiredHeader)) {
    throw new Error("Invalid payment required header");
  }
  return JSON.parse(safeBase64Decode(paymentRequiredHeader));
}
function decodePaymentResponseHeader(paymentResponseHeader) {
  if (!Base64EncodedRegex.test(paymentResponseHeader)) {
    throw new Error("Invalid payment response header");
  }
  return JSON.parse(safeBase64Decode(paymentResponseHeader));
}

// src/http/x402HTTPClient.ts
var x402HTTPClient = class {
  /**
   * Creates a new x402HTTPClient instance.
   *
   * @param client - The underlying x402Client for payment logic
   */
  constructor(client) {
    this.client = client;
    this.paymentRequiredHooks = [];
  }
  /**
   * Register a hook to handle 402 responses before payment.
   * Hooks run in order; first to return headers wins.
   *
   * @param hook - The hook function to register
   * @returns This instance for chaining
   */
  onPaymentRequired(hook) {
    this.paymentRequiredHooks.push(hook);
    return this;
  }
  /**
   * Run hooks and return headers if any hook provides them.
   *
   * @param paymentRequired - The payment required response from the server
   * @returns Headers to use for retry, or null to proceed to payment
   */
  async handlePaymentRequired(paymentRequired) {
    for (const hook of this.getPaymentRequiredHooks(paymentRequired)) {
      const result = await hook({ paymentRequired });
      if (result?.headers) {
        return result.headers;
      }
    }
    return null;
  }
  /**
   * Encodes a payment payload into appropriate HTTP headers based on version.
   *
   * @param paymentPayload - The payment payload to encode
   * @returns HTTP headers containing the encoded payment signature
   */
  encodePaymentSignatureHeader(paymentPayload) {
    switch (paymentPayload.x402Version) {
      case 2:
        return {
          "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(paymentPayload)
        };
      case 1:
        return {
          "X-PAYMENT": encodePaymentSignatureHeader(paymentPayload)
        };
      default:
        throw new Error(
          `Unsupported x402 version: ${paymentPayload.x402Version}`
        );
    }
  }
  /**
   * Extracts payment required information from HTTP response.
   *
   * @param getHeader - Function to retrieve header value by name (case-insensitive)
   * @param body - Optional response body for v1 compatibility
   * @returns The payment required object
   */
  getPaymentRequiredResponse(getHeader, body) {
    const paymentRequired = getHeader("PAYMENT-REQUIRED");
    if (paymentRequired) {
      return decodePaymentRequiredHeader(paymentRequired);
    }
    if (body && body instanceof Object && "x402Version" in body && body.x402Version === 1) {
      return body;
    }
    throw new Error("Invalid payment required response");
  }
  /**
   * Extracts payment settlement response from HTTP headers.
   *
   * @param getHeader - Function to retrieve header value by name (case-insensitive)
   * @returns The settlement response object
   */
  getPaymentSettleResponse(getHeader) {
    const paymentResponse = getHeader("PAYMENT-RESPONSE");
    if (paymentResponse) {
      return decodePaymentResponseHeader(paymentResponse);
    }
    const xPaymentResponse = getHeader("X-PAYMENT-RESPONSE");
    if (xPaymentResponse) {
      return decodePaymentResponseHeader(xPaymentResponse);
    }
    throw new Error("Payment response header not found");
  }
  /**
   * Creates a payment payload for the given payment requirements.
   * Delegates to the underlying x402Client.
   *
   * @param paymentRequired - The payment required response from the server
   * @returns Promise resolving to the payment payload
   */
  async createPaymentPayload(paymentRequired) {
    return this.client.createPaymentPayload(paymentRequired);
  }
  /**
   * Parses response headers into protocol types, fires payment response hooks (v2 only),
   * and returns whether a hook signaled recovery.
   *
   * Called by transport wrappers (fetch, axios) after the paid request completes.
   *
   * @param paymentPayload - The payload that was sent with the request
   * @param getHeader - Function to retrieve a response header by name
   * @param status - The HTTP status code of the response
   * @returns Whether a hook recovered and the parsed settle response (if any)
   */
  async processPaymentResult(paymentPayload, getHeader, status) {
    let settleResponse;
    try {
      settleResponse = this.getPaymentSettleResponse(getHeader);
    } catch {
    }
    if (paymentPayload.x402Version === 1) {
      return { recovered: false, settleResponse };
    }
    let paymentRequired;
    if (!settleResponse && status === 402) {
      try {
        paymentRequired = this.getPaymentRequiredResponse(getHeader);
      } catch {
      }
    }
    const requirements = paymentPayload.accepted;
    if (!requirements) {
      throw new Error("Invalid x402 v2 payment payload: missing `accepted`");
    }
    const ctx = {
      paymentPayload,
      requirements,
      ...settleResponse ? { settleResponse } : {},
      ...paymentRequired ? { paymentRequired } : {}
    };
    const result = await this.client.handlePaymentResponse(ctx);
    return { recovered: result?.recovered === true, settleResponse };
  }
  /**
   * Parses HTTP status, headers, and body into an `HTTPResourceResponse`.
   *
   * Decodes the x402 payment header into `header`: the `PAYMENT-RESPONSE`
   * settlement if present, otherwise the `PAYMENT-REQUIRED` declaration on
   * 402 responses (whose `error` field carries the server's failure reason).
   *
   * @param args - Normalized response inputs from any HTTP transport
   * @param args.status - HTTP response status code
   * @param args.getHeader - Callback to read response headers by name
   * @param args.body - Response body payload
   * @returns The parsed status, body, and decoded payment header
   */
  parsePaymentResult(args) {
    const { status, getHeader, body } = args;
    let header;
    try {
      header = this.getPaymentSettleResponse(getHeader);
    } catch {
      if (status === 402) {
        try {
          header = this.getPaymentRequiredResponse(getHeader, body);
        } catch {
        }
      }
    }
    let paymentStatus = "none";
    if (header && !("success" in header)) {
      paymentStatus = "payment_required";
    }
    if (header && "success" in header) {
      paymentStatus = header.success ? "settled" : "settle_failed";
    }
    return { status, paymentStatus, body, header };
  }
  /**
   * Parses a fetch Response into an `HTTPResourceResponse` for app-level convenience.
   *
   * @param response - The fetch Response to process
   * @returns The parsed status, body, and decoded payment header
   */
  async processResponse(response) {
    const getHeader = (name) => response.headers.get(name);
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return this.parsePaymentResult({ status: response.status, getHeader, body });
  }
  /**
   * Manual HTTP hooks run before extension hooks scoped to the 402 response.
   *
   * @param paymentRequired - The payment required response from the server
   * @returns Hooks in invocation order
   */
  getPaymentRequiredHooks(paymentRequired) {
    const hooks = [...this.paymentRequiredHooks];
    const declaredExtensions = paymentRequired.extensions;
    if (!declaredExtensions) return hooks;
    for (const extension of this.client.getExtensions()) {
      const httpExtension = extension;
      const hook = httpExtension.transportHooks?.http?.onPaymentRequired;
      if (!hook || !(extension.key in declaredExtensions)) continue;
      hooks.push((context) => hook(declaredExtensions[extension.key], context));
    }
    return hooks;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  x402Client,
  x402HTTPClient
});
//# sourceMappingURL=index.js.map