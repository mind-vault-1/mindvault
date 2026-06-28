import {
  HTTPFacilitatorClient,
  RouteConfigurationError,
  SETTLEMENT_OVERRIDES_HEADER,
  checkIfBazaarNeeded,
  x402HTTPResourceServer
} from "../chunk-YEYZQZNL.mjs";
import "../chunk-FPXAE3OS.mjs";
import {
  x402Version
} from "../chunk-VE37GDG2.mjs";
import {
  FacilitatorResponseError,
  SettleError,
  getFacilitatorResponseError
} from "../chunk-AGOUMC4P.mjs";
import {
  deepEqual,
  findByNetworkAndScheme
} from "../chunk-ABS7D6VX.mjs";
import "../chunk-BJTO5JO5.mjs";

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
export {
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
};
//# sourceMappingURL=index.mjs.map