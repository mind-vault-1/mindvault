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

// src/http/index.ts
var http_exports = {};
__export(http_exports, {
  FacilitatorResponseError: () => FacilitatorResponseError,
  HTTPFacilitatorClient: () => HTTPFacilitatorClient,
  RouteConfigurationError: () => RouteConfigurationError,
  decodePaymentRequiredHeader: () => decodePaymentRequiredHeader,
  decodePaymentResponseHeader: () => decodePaymentResponseHeader,
  decodePaymentSignatureHeader: () => decodePaymentSignatureHeader,
  encodePaymentRequiredHeader: () => encodePaymentRequiredHeader,
  encodePaymentResponseHeader: () => encodePaymentResponseHeader,
  encodePaymentSignatureHeader: () => encodePaymentSignatureHeader,
  getFacilitatorResponseError: () => getFacilitatorResponseError,
  x402HTTPClient: () => x402HTTPClient,
  x402HTTPResourceServer: () => x402HTTPResourceServer
});
module.exports = __toCommonJS(http_exports);

// src/utils/index.ts
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

// src/index.ts
var x402Version = 2;

// src/http/x402HTTPResourceServer.ts
var SETTLEMENT_OVERRIDES_HEADER = "Settlement-Overrides";
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

// src/http/index.ts
function encodePaymentSignatureHeader(paymentPayload) {
  return safeBase64Encode(JSON.stringify(paymentPayload));
}
function decodePaymentSignatureHeader(paymentSignatureHeader) {
  if (!Base64EncodedRegex.test(paymentSignatureHeader)) {
    throw new Error("Invalid payment signature header");
  }
  return JSON.parse(safeBase64Decode(paymentSignatureHeader));
}
function encodePaymentRequiredHeader(paymentRequired) {
  return safeBase64Encode(JSON.stringify(paymentRequired));
}
function decodePaymentRequiredHeader(paymentRequiredHeader) {
  if (!Base64EncodedRegex.test(paymentRequiredHeader)) {
    throw new Error("Invalid payment required header");
  }
  return JSON.parse(safeBase64Decode(paymentRequiredHeader));
}
function encodePaymentResponseHeader(paymentResponse) {
  return safeBase64Encode(JSON.stringify(paymentResponse));
}
function decodePaymentResponseHeader(paymentResponseHeader) {
  if (!Base64EncodedRegex.test(paymentResponseHeader)) {
    throw new Error("Invalid payment response header");
  }
  return JSON.parse(safeBase64Decode(paymentResponseHeader));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FacilitatorResponseError,
  HTTPFacilitatorClient,
  RouteConfigurationError,
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  encodePaymentSignatureHeader,
  getFacilitatorResponseError,
  x402HTTPClient,
  x402HTTPResourceServer
});
//# sourceMappingURL=index.js.map