type PaymentRequirementsV1 = {
    scheme: string;
    network: Network;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    outputSchema: Record<string, unknown>;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    extra: Record<string, unknown>;
};
type PaymentRequiredV1 = {
    x402Version: 1;
    error?: string;
    accepts: PaymentRequirementsV1[];
};
type PaymentPayloadV1 = {
    x402Version: 1;
    scheme: string;
    network: Network;
    payload: Record<string, unknown>;
};
type VerifyRequestV1 = {
    x402Version: number;
    paymentPayload: PaymentPayloadV1;
    paymentRequirements: PaymentRequirementsV1;
};
type SettleRequestV1 = {
    x402Version: number;
    paymentPayload: PaymentPayloadV1;
    paymentRequirements: PaymentRequirementsV1;
};
type SettleResponseV1 = {
    success: boolean;
    errorReason?: string;
    errorMessage?: string;
    payer?: string;
    transaction: string;
    network: Network;
};
type SupportedResponseV1 = {
    kinds: {
        x402Version: number;
        scheme: string;
        network: Network;
        extra?: Record<string, unknown>;
    }[];
};

/**
 * Recursive readonly for hook contexts so accidental in-place mutation is visible at compile time.
 * (Runtime mutation is still possible via other references; see extension enrich validation.)
 */
type DeepReadonly<T> = T extends (infer U)[] ? ReadonlyArray<DeepReadonly<U>> : T extends object ? {
    readonly [K in keyof T]: DeepReadonly<T[K]>;
} : T;

interface FacilitatorConfig {
    url?: string;
    createAuthHeaders?: () => Promise<{
        verify: Record<string, string>;
        settle: Record<string, string>;
        supported: Record<string, string>;
        bazaar?: Record<string, string>;
    }>;
}
/**
 * Interface for facilitator clients
 * Can be implemented for HTTP-based or local facilitators
 */
interface FacilitatorClient {
    /**
     * Verify a payment with the facilitator
     *
     * @param paymentPayload - The payment to verify
     * @param paymentRequirements - The requirements to verify against
     * @returns Verification response
     */
    verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse>;
    /**
     * Settle a payment with the facilitator
     *
     * @param paymentPayload - The payment to settle
     * @param paymentRequirements - The requirements for settlement
     * @returns Settlement response
     */
    settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse>;
    /**
     * Get supported payment kinds and extensions from the facilitator
     *
     * @returns Supported payment kinds and extensions
     */
    getSupported(): Promise<SupportedResponse>;
}
/**
 * HTTP-based client for interacting with x402 facilitator services
 * Handles HTTP communication with facilitator endpoints
 */
declare class HTTPFacilitatorClient implements FacilitatorClient {
    readonly url: string;
    private readonly _createAuthHeaders?;
    /**
     * Creates a new HTTPFacilitatorClient instance.
     *
     * @param config - Configuration options for the facilitator client
     */
    constructor(config?: FacilitatorConfig);
    /**
     * Verify a payment with the facilitator
     *
     * @param paymentPayload - The payment to verify
     * @param paymentRequirements - The requirements to verify against
     * @returns Verification response
     */
    verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse>;
    /**
     * Settle a payment with the facilitator
     *
     * @param paymentPayload - The payment to settle
     * @param paymentRequirements - The requirements for settlement
     * @returns Settlement response
     */
    settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse>;
    /**
     * Get supported payment kinds and extensions from the facilitator.
     * Retries with exponential backoff on 429 rate limit errors.
     *
     * @returns Supported payment kinds and extensions
     */
    getSupported(): Promise<SupportedResponse>;
    /**
     * Creates authentication headers for a specific path.
     *
     * @param path - The path to create authentication headers for (e.g., "verify", "settle", "supported")
     * @returns An object containing the authentication headers for the specified path
     */
    createAuthHeaders(path: string): Promise<{
        headers: Record<string, string>;
    }>;
    /**
     * Helper to convert objects to JSON-safe format.
     * Handles BigInt and other non-JSON types.
     *
     * @param obj - The object to convert
     * @returns The JSON-safe representation of the object
     */
    private toJsonSafe;
}

/**
 * Configuration for a protected resource
 * Only contains payment-specific configuration, not resource metadata
 */
interface ResourceConfig {
    scheme: string;
    /**
     * Payment recipient. Use a **vacant** value (`""` or whitespace-only) when an extension must
     * fill `payTo` during `enrichPaymentRequiredResponse`; non-vacant values are **immutable** there
     * so extensions cannot redirect funds to an arbitrary address.
     */
    payTo: string;
    price: Price;
    network: Network;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
}
/**
 * Context for `enrichPaymentRequiredResponse`. Extensions may merge extension payload via the
 * return value. In-place edits to `paymentRequiredResponse.accepts` are **allowlisted** only
 * (see {@link assertAcceptsAllowlistedAfterExtensionEnrich}): `scheme`, `network`, and
 * `maxTimeoutSeconds` are immutable; `payTo`, `amount`, and `asset` may change only when the
 * baseline value was vacant; `extra` may add keys but must not change or remove baseline keys.
 */
interface PaymentRequiredContext {
    requirements: PaymentRequirements[];
    resourceInfo: ResourceInfo;
    error?: string;
    paymentRequiredResponse: PaymentRequired;
    transportContext?: unknown;
}
/**
 * Verify / settle lifecycle hook context: treat as **read-only** for core protocol fields.
 * Control flow uses **abort** / **recover** return values only, not in-place mutation.
 */
interface VerifyContext {
    paymentPayload: DeepReadonly<PaymentPayload>;
    requirements: DeepReadonly<PaymentRequirements>;
    declaredExtensions: DeepReadonly<Record<string, unknown>>;
    transportContext?: unknown;
}
interface VerifyResultContext extends VerifyContext {
    result: DeepReadonly<VerifyResponse>;
}
/**
 * Optional acknowledgement body returned to the caller when an `AfterVerifyHook`
 * requests that the resource handler be skipped for a self-contained operation
 * (e.g. cooperative refund). Travels in-process only — never on the facilitator wire.
 */
interface SkipHandlerDirective {
    contentType?: string;
    body?: unknown;
}
type ResourceVerifyRespone = VerifyResponse & {
    skipHandler?: SkipHandlerDirective;
};
interface VerifyFailureContext extends VerifyContext {
    error: Error;
}
interface SettleContext {
    paymentPayload: DeepReadonly<PaymentPayload>;
    requirements: DeepReadonly<PaymentRequirements>;
    declaredExtensions: DeepReadonly<Record<string, unknown>>;
    transportContext?: unknown;
}
interface SettleResultContext extends SettleContext {
    result: DeepReadonly<SettleResponse>;
}
interface SettleFailureContext extends SettleContext {
    error: Error;
}
type VerifiedPaymentCancellationReason = "handler_threw" | "handler_failed";
interface VerifiedPaymentCanceledContext extends SettleContext {
    reason: VerifiedPaymentCancellationReason;
    error?: unknown;
    responseStatus?: number;
}
interface VerifiedPaymentCancelOptions {
    reason: VerifiedPaymentCancellationReason;
    error?: unknown;
    responseStatus?: number;
}
interface PaymentCancellationDispatcher {
    cancel(options: VerifiedPaymentCancelOptions): Promise<void>;
}
type BeforeVerifyHook = (context: VerifyContext) => Promise<void | {
    abort: true;
    reason: string;
    message?: string;
} | {
    skip: true;
    result: VerifyResponse;
}>;
type AfterVerifyHook = (context: VerifyResultContext) => Promise<void | {
    skipHandler: true;
    response?: SkipHandlerDirective;
}>;
type OnVerifyFailureHook = (context: VerifyFailureContext) => Promise<void | {
    recovered: true;
    result: VerifyResponse;
}>;
type BeforeSettleHook = (context: SettleContext) => Promise<void | {
    abort: true;
    reason: string;
    message?: string;
} | {
    skip: true;
    result: SettleResponse;
}>;
type AfterSettleHook = (context: SettleResultContext) => Promise<void>;
type OnSettleFailureHook = (context: SettleFailureContext) => Promise<void | {
    recovered: true;
    result: SettleResponse;
}>;
type OnVerifiedPaymentCanceledHook = (context: VerifiedPaymentCanceledContext) => Promise<void>;
/**
 * Optional overrides for settlement parameters.
 * Used to support partial settlement (e.g., upto scheme billing by actual usage).
 *
 * Note: Overriding the amount to a value different from the agreed-upon
 * `PaymentRequirements.amount` is only valid in schemes that explicitly support
 * partial settlement, such as the `upto` scheme. Using this with standard
 * x402 schemes (e.g., `exact`) will likely cause settlement verification to fail.
 */
type ExtensionValidationResult = {
    valid: true;
} | {
    valid: false;
    invalidReason: "extension_echo_mismatch";
    extensionKey: string;
};
interface SettlementOverrides {
    /**
     * Amount to settle. Supports three formats:
     *
     * - **Raw atomic units** — e.g., `"1000"` settles exactly 1000 atomic units.
     * - **Percent** — e.g., `"50%"` settles 50% of `PaymentRequirements.amount`.
     *   Supports up to two decimal places (e.g., `"33.33%"`). The result is floored
     *   to the nearest atomic unit.
     * - **Dollar price** — e.g., `"$0.05"` converts a USD-denominated price to
     *   atomic units. Decimals are determined from the registered scheme's
     *   `getAssetDecimals` method, falling back to 6 (standard for USDC stablecoins).
     *   The result is rounded to the nearest atomic unit.
     *
     * The resolved amount must be <= the authorized maximum in `PaymentRequirements`.
     *
     * Note: Setting this to an amount other than `PaymentRequirements.amount` is
     * only valid in schemes that support partial settlement, such as `upto`.
     */
    amount?: string;
}
/**
 * Core x402 protocol server for resource protection
 * Transport-agnostic implementation of the x402 payment protocol
 */
declare class x402ResourceServer {
    private facilitatorClients;
    private registeredServerSchemes;
    private schemeHookAdapters;
    private supportedResponsesMap;
    private facilitatorClientsMap;
    private registeredExtensions;
    private extensionHookAdapters;
    private beforeVerifyHooks;
    private afterVerifyHooks;
    private onVerifyFailureHooks;
    private beforeSettleHooks;
    private afterSettleHooks;
    private onSettleFailureHooks;
    private onVerifiedPaymentCanceledHooks;
    /**
     * Creates a new x402ResourceServer instance.
     *
     * @param facilitatorClients - Optional facilitator client(s) for payment processing
     */
    constructor(facilitatorClients?: FacilitatorClient | FacilitatorClient[]);
    /**
     * Register a scheme/network server implementation.
     *
     * @param network - The network identifier
     * @param server - The scheme/network server implementation
     * @returns The x402ResourceServer instance for chaining
     */
    register(network: Network, server: SchemeNetworkServer): x402ResourceServer;
    /**
     * Check if a scheme is registered for a given network.
     *
     * @param network - The network identifier
     * @param scheme - The payment scheme name
     * @returns True if the scheme is registered for the network, false otherwise
     */
    hasRegisteredScheme(network: Network, scheme: string): boolean;
    /**
     * Returns the decimal precision for the asset specified in the given payment requirements.
     * Looks up the registered scheme for the network and delegates to its getAssetDecimals
     * method if available. Falls back to 6 (standard for USDC stablecoins) when the scheme
     * does not implement getAssetDecimals or is not registered.
     *
     * @param requirements - The payment requirements containing scheme, network, and asset
     * @returns The number of decimal places for the asset
     */
    getAssetDecimalsForRequirements(requirements: PaymentRequirements): number;
    /**
     * Registers a resource server extension (enrichment and optional verify/settle hooks).
     * Re-registering the same key overwrites; omitting `hooks` removes adapter handles for that key.
     *
     * @param extension - Extension definition including `key` and optional `hooks`
     * @returns This server instance for chaining
     */
    registerExtension(extension: ResourceServerExtension): this;
    /**
     * Check if an extension is registered.
     *
     * @param key - The extension key
     * @returns True if the extension is registered
     */
    hasExtension(key: string): boolean;
    /**
     * Get all registered extensions.
     *
     * @returns Array of registered extensions
     */
    getExtensions(): ResourceServerExtension[];
    /**
     * Enriches declared extensions using registered extension hooks.
     *
     * @param declaredExtensions - Extensions declared on the route
     * @param transportContext - Transport-specific context (HTTP, A2A, MCP, etc.)
     * @returns Enriched extensions map
     */
    enrichExtensions(declaredExtensions: Record<string, unknown>, transportContext: unknown): Record<string, unknown>;
    /**
     * Register a hook to execute before payment verification.
     * Can abort verification by returning { abort: true, reason: string }
     *
     * @param hook - The hook function to register
     * @returns The x402ResourceServer instance for chaining
     */
    onBeforeVerify(hook: BeforeVerifyHook): x402ResourceServer;
    /**
     * Register a hook to execute after successful payment verification.
     *
     * @param hook - The hook function to register
     * @returns The x402ResourceServer instance for chaining
     */
    onAfterVerify(hook: AfterVerifyHook): x402ResourceServer;
    /**
     * Register a hook to execute when payment verification fails.
     * Can recover from failure by returning { recovered: true, result: VerifyResponse }
     *
     * @param hook - The hook function to register
     * @returns The x402ResourceServer instance for chaining
     */
    onVerifyFailure(hook: OnVerifyFailureHook): x402ResourceServer;
    /**
     * Register a hook to execute before payment settlement.
     * Can abort settlement by returning { abort: true, reason: string }
     *
     * @param hook - The hook function to register
     * @returns The x402ResourceServer instance for chaining
     */
    onBeforeSettle(hook: BeforeSettleHook): x402ResourceServer;
    /**
     * Register a hook to execute after successful payment settlement.
     *
     * @param hook - The hook function to register
     * @returns The x402ResourceServer instance for chaining
     */
    onAfterSettle(hook: AfterSettleHook): x402ResourceServer;
    /**
     * Register a hook to execute when payment settlement fails.
     * Can recover from failure by returning { recovered: true, result: SettleResponse }
     *
     * @param hook - The hook function to register
     * @returns The x402ResourceServer instance for chaining
     */
    onSettleFailure(hook: OnSettleFailureHook): x402ResourceServer;
    /**
     * Register a hook to execute when verified payment work is canceled before settlement.
     *
     * @param hook - The hook function to register
     * @returns The x402ResourceServer instance for chaining
     */
    onVerifiedPaymentCanceled(hook: OnVerifiedPaymentCanceledHook): x402ResourceServer;
    /**
     * Initialize by fetching supported kinds from all facilitators
     * Creates mappings for supported responses and facilitator clients
     * Earlier facilitators in the array get precedence
     */
    initialize(): Promise<void>;
    /**
     * Get supported kind for a specific version, network, and scheme
     *
     * @param x402Version - The x402 version
     * @param network - The network identifier
     * @param scheme - The payment scheme
     * @returns The supported kind or undefined if not found
     */
    getSupportedKind(x402Version: number, network: Network, scheme: string): SupportedKind | undefined;
    /**
     * Get facilitator extensions for a specific version, network, and scheme
     *
     * @param x402Version - The x402 version
     * @param network - The network identifier
     * @param scheme - The payment scheme
     * @returns The facilitator extensions or empty array if not found
     */
    getFacilitatorExtensions(x402Version: number, network: Network, scheme: string): string[];
    /**
     * Build payment requirements for a protected resource
     *
     * @param resourceConfig - Configuration for the protected resource
     * @returns Array of payment requirements
     */
    buildPaymentRequirements(resourceConfig: ResourceConfig): Promise<PaymentRequirements[]>;
    /**
     * Build payment requirements from multiple payment options
     * This method handles resolving dynamic payTo/price functions and builds requirements for each option
     *
     * @param paymentOptions - Array of payment options to convert
     * @param context - HTTP request context for resolving dynamic functions
     * @returns Array of payment requirements (one per option)
     */
    buildPaymentRequirementsFromOptions<TContext = unknown>(paymentOptions: Array<{
        scheme: string;
        payTo: string | ((context: TContext) => string | Promise<string>);
        price: Price | ((context: TContext) => Price | Promise<Price>);
        network: Network;
        maxTimeoutSeconds?: number;
        extra?: Record<string, unknown>;
    }>, context: TContext): Promise<PaymentRequirements[]>;
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
    createPaymentRequiredResponse(requirements: PaymentRequirements[], resourceInfo: ResourceInfo, error?: string, extensions?: Record<string, unknown>, transportContext?: unknown, paymentPayload?: PaymentPayload): Promise<PaymentRequired>;
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
    verifyPayment(paymentPayload: PaymentPayload, requirements: PaymentRequirements, declaredExtensions?: Record<string, unknown>, transportContext?: unknown): Promise<ResourceVerifyRespone>;
    /**
     * Create cancellation controls for a verified payment attempt.
     *
     * @param paymentPayload - Signed payment payload from the client
     * @param requirements - Requirements matched to the payload
     * @param declaredExtensions - Optional per-extension declarations for the request
     * @param transportContext - Optional transport-specific context
     * @returns Cancellation controls for the verified payment attempt
     */
    createPaymentCancellationDispatcher(paymentPayload: PaymentPayload, requirements: PaymentRequirements, declaredExtensions?: Record<string, unknown>, transportContext?: unknown): PaymentCancellationDispatcher;
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
    settlePayment(paymentPayload: PaymentPayload, requirements: PaymentRequirements, declaredExtensions?: Record<string, unknown>, transportContext?: unknown, settlementOverrides?: SettlementOverrides): Promise<SettleResponse>;
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
    validateExtensions(paymentRequired: PaymentRequired, paymentPayload: PaymentPayload): ExtensionValidationResult;
    /**
     * Finds the server-advertised requirement that matches a client payment payload.
     *
     * @param availableRequirements - Payment requirements advertised for the resource.
     * @param paymentPayload - Signed payment payload from the client.
     * @returns The matching requirement, or undefined when none match.
     */
    findMatchingRequirements(availableRequirements: PaymentRequirements[], paymentPayload: PaymentPayload): PaymentRequirements | undefined;
    /**
     * Logs a warning when a manual or extension adapter lifecycle hook throws.
     *
     * @param phase - Lifecycle phase name (e.g. `beforeVerify`)
     * @param label - Hook source label from {@link getLabeledHooks} (manual index or extension key)
     * @param error - Thrown value or rejection reason
     */
    private warnResourceServerHookFailure;
    /**
     * Logs a warning when a registered extension enrichment hook throws.
     *
     * @param extensionKey - Registered extension identifier
     * @param hookName - Hook method name (e.g. `enrichDeclaration`)
     * @param error - Thrown value or rejection reason
     */
    private warnExtensionHookFailure;
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
    private runAfterVerifyHooks;
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
    private enrichSettlementResponse;
    /**
     * Notify hooks that verified work ended before settlement.
     *
     * @param paymentPayload - Signed payment payload from the client
     * @param requirements - Requirements matched to the payload
     * @param declaredExtensions - Optional per-extension declarations for the request
     * @param options - Cancellation reason and optional diagnostics
     * @param fallbackTransportContext - Optional transport-specific context
     */
    private dispatchVerifiedPaymentCanceled;
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
    private getLabeledHooks;
    /**
     * Get facilitator client for a specific version, network, and scheme
     *
     * @param x402Version - The x402 version
     * @param network - The network identifier
     * @param scheme - The payment scheme
     * @returns The facilitator client or undefined if not found
     */
    private getFacilitatorClient;
}

declare const SETTLEMENT_OVERRIDES_HEADER = "Settlement-Overrides";
/**
 * Framework-agnostic HTTP adapter interface
 * Implementations provide framework-specific HTTP operations
 */
interface HTTPAdapter {
    getHeader(name: string): string | undefined;
    getMethod(): string;
    getPath(): string;
    getUrl(): string;
    getAcceptHeader(): string;
    getUserAgent(): string;
    /**
     * Get query parameters from the request URL
     *
     * @returns Record of query parameter key-value pairs
     */
    getQueryParams?(): Record<string, string | string[]>;
    /**
     * Get a specific query parameter by name
     *
     * @param name - The query parameter name
     * @returns The query parameter value(s) or undefined
     */
    getQueryParam?(name: string): string | string[] | undefined;
    /**
     * Get the parsed request body
     * Framework adapters should parse JSON/form data appropriately
     *
     * @returns The parsed request body
     */
    getBody?(): unknown;
}
/**
 * Paywall configuration for HTML responses
 */
interface PaywallConfig {
    appName?: string;
    appLogo?: string;
    sessionTokenEndpoint?: string;
    currentUrl?: string;
    testnet?: boolean;
}
/**
 * Paywall provider interface for generating HTML
 */
interface PaywallProvider {
    generateHtml(paymentRequired: PaymentRequired, config?: PaywallConfig): string;
}
/**
 * Dynamic payTo function that receives HTTP request context
 */
type DynamicPayTo = (context: HTTPRequestContext) => string | Promise<string>;
/**
 * Dynamic price function that receives HTTP request context
 */
type DynamicPrice = (context: HTTPRequestContext) => Price | Promise<Price>;
/**
 * Result of response body callbacks containing content type and body.
 */
interface HTTPResponseBody {
    /**
     * The content type for the response (e.g., 'application/json', 'text/plain').
     */
    contentType: string;
    /**
     * The response body to include in the 402 response.
     */
    body: unknown;
}
/**
 * Dynamic function to generate a custom response for unpaid requests.
 * Receives the HTTP request context and returns the content type and body to include in the 402 response.
 */
type UnpaidResponseBody = (context: HTTPRequestContext) => HTTPResponseBody | Promise<HTTPResponseBody>;
/**
 * Dynamic function to generate a custom response for settlement failures.
 * Receives the HTTP request context and settle failure result, returns the content type and body.
 */
type SettlementFailedResponseBody = (context: HTTPRequestContext, settleResult: Omit<ProcessSettleFailureResponse, "response">) => HTTPResponseBody | Promise<HTTPResponseBody>;
/**
 * A single payment option for a route
 * Represents one way a client can pay for access to the resource
 */
interface PaymentOption {
    scheme: string;
    payTo: string | DynamicPayTo;
    price: Price | DynamicPrice;
    network: Network;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
}
/**
 * Route configuration for HTTP endpoints
 *
 * The 'accepts' field defines payment options for the route.
 * Can be a single PaymentOption or an array of PaymentOptions for multiple payment methods.
 */
interface RouteConfig {
    accepts: PaymentOption | PaymentOption[];
    resource?: string;
    description?: string;
    mimeType?: string;
    serviceName?: string;
    tags?: string[];
    iconUrl?: string;
    customPaywallHtml?: string;
    /**
     * Optional callback to generate a custom response for unpaid API requests.
     * This allows servers to return preview data, error messages, or other content
     * when a request lacks payment.
     *
     * For browser requests (Accept: text/html), the paywall HTML takes precedence.
     * This callback is only used for API clients.
     *
     * If not provided, defaults to { contentType: 'application/json', body: {} }.
     *
     * @param context - The HTTP request context
     * @returns An object containing both contentType and body for the 402 response
     */
    unpaidResponseBody?: UnpaidResponseBody;
    /**
     * Optional callback to generate a custom response for settlement failures.
     * If not provided, defaults to { contentType: 'application/json', body: {} }.
     *
     * @param context - The HTTP request context
     * @param settleResult - The settlement failure result
     * @returns An object containing both contentType and body for the 402 response
     */
    settlementFailedResponseBody?: SettlementFailedResponseBody;
    extensions?: Record<string, unknown>;
}
/**
 * Routes configuration - maps path patterns to route configs
 */
type RoutesConfig = Record<string, RouteConfig> | RouteConfig;
/**
 * Check if any routes in the configuration declare bazaar extensions.
 *
 * @param routes - Route configuration
 * @returns True if any route has extensions.bazaar defined
 */
declare function checkIfBazaarNeeded(routes: RoutesConfig): boolean;
/**
 * Hook that runs on every request to a protected route, before payment processing.
 * Can grant access without payment, deny the request, or continue to payment flow.
 *
 * @returns
 * - `void` - Continue to payment processing (default behavior)
 * - `{ grantAccess: true }` - Grant access without requiring payment
 * - `{ abort: true; reason: string }` - Deny the request (returns 403)
 */
type ProtectedRequestHook = (context: HTTPRequestContext, routeConfig: RouteConfig) => Promise<void | {
    grantAccess: true;
} | {
    abort: true;
    reason: string;
}>;
interface HTTPResourceServerExtensionHooks {
    onProtectedRequest?: (declaration: unknown, context: HTTPRequestContext, routeConfig: RouteConfig) => Promise<void | {
        grantAccess: true;
    } | {
        abort: true;
        reason: string;
    }>;
}
interface ResourceServerTransportExtensionHooks {
    http?: HTTPResourceServerExtensionHooks;
}
/**
 * Compiled route for efficient matching
 */
interface CompiledRoute {
    verb: string;
    regex: RegExp;
    config: RouteConfig;
    pattern: string;
}
/**
 * HTTP request context that encapsulates all request data
 */
interface HTTPRequestContext {
    adapter: HTTPAdapter;
    path: string;
    method: string;
    paymentHeader?: string;
    routePattern?: string;
}
/**
 * HTTP transport context contains both request context and optional response data.
 */
interface HTTPTransportContext {
    /** The HTTP request context */
    request: HTTPRequestContext;
    /** The response body buffer */
    responseBody?: Buffer;
    /** Response headers set by the route handler (used for settlement overrides) */
    responseHeaders?: Record<string, string>;
}
/**
 * HTTP response instructions for the framework middleware
 */
interface HTTPResponseInstructions {
    status: number;
    headers: Record<string, string>;
    body?: unknown;
    isHtml?: boolean;
}
/**
 * Result of processing an HTTP request for payment
 */
type HTTPProcessResult = {
    type: "no-payment-required";
} | {
    type: "payment-verified";
    cancellationDispatcher: PaymentCancellationDispatcher;
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
    declaredExtensions?: Record<string, unknown>;
} | {
    type: "payment-error";
    response: HTTPResponseInstructions;
};
/**
 * Result of processSettlement
 */
type ProcessSettleSuccessResponse = SettleResponse & {
    success: true;
    headers: Record<string, string>;
    requirements: PaymentRequirements;
};
type ProcessSettleFailureResponse = SettleResponse & {
    success: false;
    errorReason: string;
    errorMessage?: string;
    headers: Record<string, string>;
    response: HTTPResponseInstructions;
};
type ProcessSettleResultResponse = ProcessSettleSuccessResponse | ProcessSettleFailureResponse;
/**
 * Represents a validation error for a specific route's payment configuration.
 */
interface RouteValidationError {
    /** The route pattern (e.g., "GET /api/weather") */
    routePattern: string;
    /** The payment scheme that failed validation */
    scheme: string;
    /** The network that failed validation */
    network: Network;
    /** The type of validation failure */
    reason: "missing_scheme" | "missing_facilitator";
    /** Human-readable error message */
    message: string;
}
/**
 * Error thrown when route configuration validation fails.
 */
declare class RouteConfigurationError extends Error {
    /** The validation errors that caused this exception */
    readonly errors: RouteValidationError[];
    /**
     * Creates a new RouteConfigurationError with the given validation errors.
     *
     * @param errors - The validation errors that caused this exception.
     */
    constructor(errors: RouteValidationError[]);
}
/**
 * HTTP-enhanced x402 resource server
 * Provides framework-agnostic HTTP protocol handling
 */
declare class x402HTTPResourceServer {
    private ResourceServer;
    private compiledRoutes;
    private routesConfig;
    private paywallProvider?;
    private protectedRequestHooks;
    /**
     * Creates a new x402HTTPResourceServer instance.
     *
     * @param ResourceServer - The core x402ResourceServer instance to use
     * @param routes - Route configuration for payment-protected endpoints
     */
    constructor(ResourceServer: x402ResourceServer, routes: RoutesConfig);
    /**
     * Get the underlying x402ResourceServer instance.
     *
     * @returns The underlying x402ResourceServer instance
     */
    get server(): x402ResourceServer;
    /**
     * Get the routes configuration.
     *
     * @returns The routes configuration
     */
    get routes(): RoutesConfig;
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
    initialize(): Promise<void>;
    /**
     * Register a custom paywall provider for generating HTML
     *
     * @param provider - PaywallProvider instance
     * @returns This service instance for chaining
     */
    registerPaywallProvider(provider: PaywallProvider): this;
    /**
     * Register a hook that runs on every request to a protected route, before payment processing.
     * Hooks are executed in order of registration. The first hook to return a non-void result wins.
     *
     * @param hook - The request hook function
     * @returns The x402HTTPResourceServer instance for chaining
     */
    onProtectedRequest(hook: ProtectedRequestHook): this;
    /**
     * Process HTTP request and return response instructions
     * This is the main entry point for framework middleware
     *
     * @param context - HTTP request context
     * @param paywallConfig - Optional paywall configuration
     * @returns Process result indicating next action for middleware
     */
    processHTTPRequest(context: HTTPRequestContext, paywallConfig?: PaywallConfig): Promise<HTTPProcessResult>;
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
    processSettlement(paymentPayload: PaymentPayload, requirements: PaymentRequirements, declaredExtensions?: Record<string, unknown>, transportContext?: HTTPTransportContext, settlementOverrides?: SettlementOverrides): Promise<ProcessSettleResultResponse>;
    /**
     * Check if a request requires payment based on route configuration
     *
     * @param context - HTTP request context
     * @returns True if the route requires payment, false otherwise
     */
    requiresPayment(context: HTTPRequestContext): boolean;
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
    private processSkipHandlerSettlement;
    /**
     * Build HTTPResponseInstructions for settlement failure.
     * Uses settlementFailedResponseBody hook if configured, otherwise defaults to empty body.
     *
     * @param failure - Settlement failure result with headers
     * @param transportContext - Optional HTTP transport context for the request
     * @returns HTTP response instructions for the 402 settlement failure response
     */
    private buildSettlementFailureResponse;
    /**
     * Normalizes a RouteConfig's accepts field into an array of PaymentOptions
     * Handles both single PaymentOption and array formats
     *
     * @param routeConfig - Route configuration
     * @returns Array of payment options
     */
    private normalizePaymentOptions;
    /**
     * Manual request hooks run before extension transport hooks for declared extensions.
     *
     * @param routeConfig - Route configuration for the matched request
     * @returns Hooks in invocation order
     */
    private getProtectedRequestHooks;
    /**
     * Validates that all payment options in routes have corresponding registered schemes
     * and facilitator support.
     *
     * @returns Array of validation errors (empty if all routes are valid)
     */
    private validateRouteConfiguration;
    /**
     * Get route configuration for a request
     *
     * @param path - Request path
     * @param method - HTTP method
     * @returns Route configuration and pattern, or undefined if no match
     */
    private getRouteConfig;
    /**
     * Extract payment from HTTP headers (handles v1 and v2)
     *
     * @param adapter - HTTP adapter
     * @returns Decoded payment payload or null
     */
    private extractPayment;
    /**
     * Check if request is from a web browser
     *
     * @param adapter - HTTP adapter
     * @returns True if request appears to be from a browser
     */
    private isWebBrowser;
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
    private createHTTPResponse;
    /**
     * Create HTTP payment required response (v1 puts in body, v2 puts in header)
     *
     * @param paymentRequired - Payment required object
     * @returns Headers and body for the HTTP response
     */
    private createHTTPPaymentRequiredResponse;
    /**
     * Create settlement response headers
     *
     * @param settleResponse - Settlement response
     * @returns Headers to add to response
     */
    private createSettlementHeaders;
    /**
     * Parse route pattern into verb and regex
     *
     * @param pattern - Route pattern like "GET /api/*", "/api/[id]", or "/api/:id"
     * @returns Parsed pattern with verb and regex
     */
    private parseRoutePattern;
    /**
     * Normalize path for matching
     *
     * @param path - Raw path from request
     * @returns Normalized path
     */
    private normalizePath;
    /**
     * Generate paywall HTML for browser requests
     *
     * @param paymentRequired - Payment required response
     * @param paywallConfig - Optional paywall configuration
     * @param customHtml - Optional custom HTML template
     * @returns HTML string
     */
    private generatePaywallHTML;
    /**
     * Extract display amount from payment requirements.
     * Uses the registered scheme's decimal precision for the asset, falling back to 6.
     *
     * @param paymentRequired - The payment required object
     * @returns The display amount in decimal format
     */
    private getDisplayAmount;
}

interface FacilitatorExtension {
    key: string;
}
/**
 * Per-extension verify/settle hooks. Contexts are **read-only** for core protocol fields; use
 * **abort** / **recover** return values instead of mutating `paymentPayload`, `requirements`, etc.
 */
interface ResourceServerExtensionHooks {
    onBeforeVerify?: (declaration: unknown, context: VerifyContext) => Promise<void | {
        abort: true;
        reason: string;
        message?: string;
    } | {
        skip: true;
        result: VerifyResponse;
    }>;
    onAfterVerify?: (declaration: unknown, context: VerifyResultContext) => Promise<void>;
    onVerifyFailure?: (declaration: unknown, context: VerifyFailureContext) => Promise<void | {
        recovered: true;
        result: VerifyResponse;
    }>;
    onBeforeSettle?: (declaration: unknown, context: SettleContext) => Promise<void | {
        abort: true;
        reason: string;
        message?: string;
    } | {
        skip: true;
        result: SettleResponse;
    }>;
    onAfterSettle?: (declaration: unknown, context: SettleResultContext) => Promise<void>;
    onSettleFailure?: (declaration: unknown, context: SettleFailureContext) => Promise<void | {
        recovered: true;
        result: SettleResponse;
    }>;
    onVerifiedPaymentCanceled?: (declaration: unknown, context: VerifiedPaymentCanceledContext) => Promise<void>;
}
interface ResourceServerExtension {
    key: string;
    /**
     * Names of fields under the extension's `info` that are dynamic - regenerated
     * on every PaymentRequired response (e.g. nonces, timestamps) - rather than
     * static committed terms. Dynamic fields are excluded from client echo
     * validation. Defaults to none (all info fields treated as static / strict).
     */
    dynamicInfoFields?: string[];
    enrichDeclaration?: (declaration: unknown, transportContext: unknown) => unknown;
    /**
     * Return value merges into `extensions[key]`. In-place edits to `accepts` are allowlisted only
     * (see server `assertAcceptsAllowlistedAfterExtensionEnrich`): vacant `payTo` / `amount` / `asset`
     * may be filled; locked values and `scheme` / `network` / `maxTimeoutSeconds` / baseline `extra`
     * entries are immutable.
     */
    enrichPaymentRequiredResponse?: (declaration: unknown, context: PaymentRequiredContext) => Promise<unknown>;
    /**
     * Return value merges into `settleResult.extensions[key]`. Facilitator fields (`success`,
     * `transaction`, `network`, etc.) must not be changed; only `extensions` is merged from the hook.
     */
    enrichSettlementResponse?: (declaration: unknown, context: SettleResultContext) => Promise<unknown>;
    /** Installed on `registerExtension`; runs only when `declaredExtensions[key]` is defined. */
    hooks?: ResourceServerExtensionHooks;
    /** Transport-specific hooks scoped to declared extension keys. */
    transportHooks?: ResourceServerTransportExtensionHooks;
}

type Network = `${string}:${string}`;
type Money = string | number;
type AssetAmount = {
    asset: string;
    amount: string;
    extra?: Record<string, unknown>;
};
type Price = Money | AssetAmount;

interface ResourceInfo {
    url: string;
    description?: string;
    mimeType?: string;
    serviceName?: string;
    tags?: string[];
    iconUrl?: string;
}
type PaymentRequirements = {
    scheme: string;
    network: Network;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
};
type PaymentRequired = {
    x402Version: number;
    error?: string;
    resource: ResourceInfo;
    accepts: PaymentRequirements[];
    extensions?: Record<string, unknown>;
};
type PaymentPayload = {
    x402Version: number;
    resource?: ResourceInfo;
    accepted: PaymentRequirements;
    payload: Record<string, unknown>;
    extensions?: Record<string, unknown>;
};

type VerifyRequest = {
    x402Version: number;
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
};
type VerifyResponse = {
    isValid: boolean;
    invalidReason?: string;
    invalidMessage?: string;
    payer?: string;
    extensions?: Record<string, unknown>;
    extra?: Record<string, unknown>;
};
type SettleRequest = {
    x402Version: number;
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
};
type SettleResponse = {
    success: boolean;
    errorReason?: string;
    errorMessage?: string;
    payer?: string;
    transaction: string;
    network: Network;
    /** Actual amount settled in atomic token units. Present for schemes like `upto` where settlement amount may differ from the authorized maximum. */
    amount?: string;
    extensions?: Record<string, unknown>;
    extra?: Record<string, unknown>;
};
type SupportedKind = {
    x402Version: number;
    scheme: string;
    network: Network;
    extra?: Record<string, unknown>;
};
type SupportedResponse = {
    kinds: SupportedKind[];
    extensions: string[];
    signers: Record<string, string[]>;
};
/**
 * Error thrown when payment verification fails.
 */
declare class VerifyError extends Error {
    readonly invalidReason?: string;
    readonly invalidMessage?: string;
    readonly payer?: string;
    readonly statusCode: number;
    /**
     * Creates a VerifyError from a failed verification response.
     *
     * @param statusCode - HTTP status code from the facilitator
     * @param response - The verify response containing failure details
     */
    constructor(statusCode: number, response: VerifyResponse);
}
/**
 * Error thrown when payment settlement fails.
 */
declare class SettleError extends Error {
    readonly errorReason?: string;
    readonly errorMessage?: string;
    readonly payer?: string;
    readonly transaction: string;
    readonly network: Network;
    readonly statusCode: number;
    /**
     * Creates a SettleError from a failed settlement response.
     *
     * @param statusCode - HTTP status code from the facilitator
     * @param response - The settle response containing error details
     */
    constructor(statusCode: number, response: SettleResponse);
}
/**
 * Error thrown when a facilitator returns malformed success payload data.
 */
declare class FacilitatorResponseError extends Error {
    /**
     * Creates a FacilitatorResponseError for malformed facilitator responses.
     *
     * @param message - The boundary error message
     */
    constructor(message: string);
}
/**
 * Walks an error cause chain to find the first facilitator response error.
 *
 * @param error - The thrown value to inspect
 * @returns The nested facilitator response error, if present
 */
declare function getFacilitatorResponseError(error: unknown): FacilitatorResponseError | null;

/**
 * Money parser function that converts a numeric amount to an AssetAmount
 * Receives the amount as a decimal number (e.g., 1.50 for $1.50)
 * Returns null to indicate "cannot handle this amount", causing fallback to next parser
 * Always returns a Promise for consistency - use async/await
 *
 * @param amount - The decimal amount (e.g., 1.50)
 * @param network - The network identifier for context
 * @returns AssetAmount or null to try next parser
 */
type MoneyParser = (amount: number, network: Network) => Promise<AssetAmount | null>;
/**
 * Result of createPaymentPayload - the core payload fields.
 * Contains the x402 version, scheme-specific payload data, and optional extension data.
 * Schemes may return extensions (e.g., EIP-2612 gas sponsoring) that get merged
 * with server-declared extensions in the final PaymentPayload.
 */
type PaymentPayloadResult = Pick<PaymentPayload, "x402Version" | "payload"> & {
    extensions?: Record<string, unknown>;
};
/**
 * Context passed to scheme's createPaymentPayload for extensions awareness.
 * Contains the server-declared extensions from PaymentRequired so the scheme
 * can check which extensions are advertised and respond accordingly.
 */
interface PaymentPayloadContext {
    extensions?: Record<string, unknown>;
}
interface SchemeClientHooks {
    onBeforePaymentCreation?: BeforePaymentCreationHook;
    onAfterPaymentCreation?: AfterPaymentCreationHook;
    onPaymentCreationFailure?: OnPaymentCreationFailureHook;
    onPaymentResponse?: OnPaymentResponseHook;
}
interface SchemeNetworkClient {
    readonly scheme: string;
    readonly schemeHooks?: SchemeClientHooks;
    createPaymentPayload(x402Version: number, paymentRequirements: PaymentRequirements, context?: PaymentPayloadContext): Promise<PaymentPayloadResult>;
}
/**
 * Context passed to SchemeNetworkFacilitator.verify/settle, providing
 * access to registered facilitator extensions. Mechanism implementations
 * use this to retrieve extension-provided capabilities (e.g., a batch signer).
 */
interface FacilitatorContext {
    getExtension<T extends FacilitatorExtension = FacilitatorExtension>(key: string): T | undefined;
}
interface SchemeNetworkFacilitator {
    readonly scheme: string;
    /**
     * CAIP family pattern that this facilitator supports.
     * Used to group signers by blockchain family in the supported response.
     *
     * @example
     * // EVM facilitators
     * readonly caipFamily = "eip155:*";
     *
     * @example
     * // SVM facilitators
     * readonly caipFamily = "solana:*";
     */
    readonly caipFamily: string;
    /**
     * Get mechanism-specific extra data needed for the supported kinds endpoint.
     * This method is called when building the facilitator's supported response.
     *
     * @param network - The network identifier for context
     * @returns Extra data object or undefined if no extra data is needed
     *
     * @example
     * // EVM schemes return undefined (no extra data needed)
     * getExtra(network: Network): undefined {
     *   return undefined;
     * }
     *
     * @example
     * // SVM schemes return feePayer address
     * getExtra(network: Network): Record<string, unknown> | undefined {
     *   return { feePayer: this.signer.address };
     * }
     */
    getExtra(network: Network): Record<string, unknown> | undefined;
    /**
     * Get signer addresses used by this facilitator for a given network.
     * These are included in the supported response to help clients understand
     * which addresses might sign/pay for transactions.
     *
     * Supports multiple addresses for load balancing, key rotation, and high availability.
     *
     * @param network - The network identifier
     * @returns Array of signer addresses (wallet addresses, fee payer addresses, etc.)
     *
     * @example
     * // EVM facilitator
     * getSigners(network: string): string[] {
     *   return [...this.signer.getAddresses()];
     * }
     *
     * @example
     * // SVM facilitator
     * getSigners(network: string): string[] {
     *   return [...this.signer.getAddresses()];
     * }
     */
    getSigners(network: string): string[];
    verify(payload: PaymentPayload, requirements: PaymentRequirements, context?: FacilitatorContext): Promise<VerifyResponse>;
    settle(payload: PaymentPayload, requirements: PaymentRequirements, context?: FacilitatorContext): Promise<SettleResponse>;
}
interface SchemeServerHooks {
    onBeforeVerify?: BeforeVerifyHook;
    onAfterVerify?: AfterVerifyHook;
    onBeforeSettle?: BeforeSettleHook;
    onAfterSettle?: AfterSettleHook;
    onVerifyFailure?: OnVerifyFailureHook;
    onSettleFailure?: OnSettleFailureHook;
    onVerifiedPaymentCanceled?: OnVerifiedPaymentCanceledHook;
}
type SchemeEnrichSettlementPayloadHook = (ctx: SettleContext) => Promise<Record<string, unknown> | void>;
type SchemeEnrichSettlementResponseHook = (ctx: SettleResultContext) => Promise<Record<string, unknown> | void>;
interface SchemePaymentRequiredContext {
    requirements: PaymentRequirements[];
    paymentPayload?: DeepReadonly<PaymentPayload>;
    resourceInfo: ResourceInfo;
    error?: string;
    paymentRequiredResponse: PaymentRequired;
    transportContext?: unknown;
}
type SchemeEnrichPaymentRequiredResponseHook = (ctx: SchemePaymentRequiredContext) => Promise<PaymentRequirements[] | void>;
interface SchemeNetworkServer {
    readonly scheme: string;
    readonly schemeHooks?: SchemeServerHooks;
    enrichPaymentRequiredResponse?: SchemeEnrichPaymentRequiredResponseHook;
    enrichSettlementPayload?: SchemeEnrichSettlementPayloadHook;
    enrichSettlementResponse?: SchemeEnrichSettlementResponseHook;
    /**
     * Convert a user-friendly price to the scheme's specific amount and asset format
     * Always returns a Promise for consistency
     *
     * @param price - User-friendly price (e.g., "$0.10", "0.10", { amount: "100000", asset: "USDC" })
     * @param network - The network identifier for context
     * @returns Promise that resolves to the converted amount, asset identifier, and any extra metadata
     *
     * @example
     * // For EVM networks with USDC:
     * await parsePrice("$0.10", "eip155:8453") => { amount: "100000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }
     *
     * // For custom schemes:
     * await parsePrice("10 points", "custom:network") => { amount: "10", asset: "points" }
     */
    parsePrice(price: Price, network: Network): Promise<AssetAmount>;
    /**
     * Optional: Return the decimal precision of the asset for a given network.
     * Used by `resolveSettlementOverrideAmount` to convert dollar-format overrides to atomic units.
     * Defaults to 6 when not implemented.
     *
     * @param asset - The asset address or symbol
     * @param network - The network identifier
     * @returns Number of decimal places for the asset
     */
    getAssetDecimals?(asset: string, network: Network): number;
    /**
     * Build payment requirements for this scheme/network combination
     *
     * @param paymentRequirements - Base payment requirements with amount/asset already set
     * @param supportedKind - The supported kind from facilitator's /supported endpoint
     * @param supportedKind.x402Version - The x402 version
     * @param supportedKind.scheme - The payment scheme
     * @param supportedKind.network - The network identifier
     * @param supportedKind.extra - Optional extra metadata
     * @param facilitatorExtensions - Extensions supported by the facilitator
     * @returns Enhanced payment requirements ready to be sent to clients
     */
    enhancePaymentRequirements(paymentRequirements: PaymentRequirements, supportedKind: SupportedKind, facilitatorExtensions: string[]): Promise<PaymentRequirements>;
}

/**
 * Client Hook Context Interfaces
 */
interface PaymentCreationContext {
    paymentRequired: PaymentRequired;
    selectedRequirements: PaymentRequirements;
}
interface PaymentCreatedContext extends PaymentCreationContext {
    paymentPayload: PaymentPayload;
}
interface PaymentCreationFailureContext extends PaymentCreationContext {
    error: Error;
}
/**
 * Client Hook Type Definitions
 */
type BeforePaymentCreationHook = (context: PaymentCreationContext) => Promise<void | {
    abort: true;
    reason: string;
}>;
type AfterPaymentCreationHook = (context: PaymentCreatedContext) => Promise<void>;
type OnPaymentCreationFailureHook = (context: PaymentCreationFailureContext) => Promise<void | {
    recovered: true;
    payload: PaymentPayload;
}>;
/**
 * Context provided to payment response hooks after the paid request completes.
 *
 * Discriminate by what's present:
 * - `settleResponse` with `success: true` → settle succeeded
 * - `settleResponse` with `success: false` → settle failed
 * - `paymentRequired` (no `settleResponse`) → verify failed
 * - `error` → transport or parse error
 */
interface PaymentResponseContext {
    paymentPayload: PaymentPayload;
    requirements: PaymentRequirements;
    settleResponse?: SettleResponse;
    paymentRequired?: PaymentRequired;
    error?: Error;
}
/**
 * Hook fired after a paid request completes.
 * Return `{ recovered: true }` to signal the transport should retry with a fresh payload.
 */
type OnPaymentResponseHook = (ctx: PaymentResponseContext) => Promise<void | {
    recovered: true;
}>;
type SelectPaymentRequirements = (x402Version: number, paymentRequirements: PaymentRequirements[]) => PaymentRequirements;
interface ClientExtensionHooks {
    onBeforePaymentCreation?: (declaration: unknown, context: PaymentCreationContext) => Promise<void | {
        abort: true;
        reason: string;
    }>;
    onAfterPaymentCreation?: (declaration: unknown, context: PaymentCreatedContext) => Promise<void>;
    onPaymentCreationFailure?: (declaration: unknown, context: PaymentCreationFailureContext) => Promise<void | {
        recovered: true;
        payload: PaymentPayload;
    }>;
    onPaymentResponse?: (declaration: unknown, context: PaymentResponseContext) => Promise<void | {
        recovered: true;
    }>;
}
interface ClientTransportExtensionHooks {
    [transport: string]: unknown;
}
/**
 * Extension that can enrich payment payloads on the client side.
 *
 * Client extensions are invoked after the scheme creates the base payment payload
 * but before it is returned. This allows mechanism-specific logic (e.g., EVM EIP-2612
 * permit signing) to enrich the payload's extensions data.
 */
interface ClientExtension {
    /**
     * Unique key identifying this extension (e.g., "eip2612GasSponsoring").
     * Must match the extension key used in PaymentRequired.extensions.
     */
    key: string;
    /**
     * Called after payload creation when the extension key is present in
     * paymentRequired.extensions. Allows the extension to enrich the payload
     * with extension-specific data (e.g., signing an EIP-2612 permit).
     *
     * @param paymentPayload - The payment payload to enrich
     * @param paymentRequired - The original PaymentRequired response
     * @returns The enriched payment payload
     */
    enrichPaymentPayload?: (paymentPayload: PaymentPayload, paymentRequired: PaymentRequired) => Promise<PaymentPayload>;
    hooks?: ClientExtensionHooks;
    transportHooks?: ClientTransportExtensionHooks;
}
/**
 * A policy function that filters or transforms payment requirements.
 * Policies are applied in order before the selector chooses the final option.
 *
 * @param x402Version - The x402 protocol version
 * @param paymentRequirements - Array of payment requirements to filter/transform
 * @returns Filtered array of payment requirements
 */
type PaymentPolicy = (x402Version: number, paymentRequirements: PaymentRequirements[]) => PaymentRequirements[];
/**
 * Configuration for registering a payment scheme with a specific network
 */
interface SchemeRegistration {
    /**
     * The network identifier (e.g., 'eip155:8453', 'solana:mainnet')
     */
    network: Network;
    /**
     * The scheme client implementation for this network
     */
    client: SchemeNetworkClient;
    /**
     * The x402 protocol version to use for this scheme
     *
     * @default 2
     */
    x402Version?: number;
}
/**
 * Configuration options for the fetch wrapper
 */
interface x402ClientConfig {
    /**
     * Array of scheme registrations defining which payment methods are supported
     */
    schemes: SchemeRegistration[];
    /**
     * Policies to apply to the client
     */
    policies?: PaymentPolicy[];
    /**
     * Custom payment requirements selector function
     * If not provided, uses the default selector (first available option)
     */
    paymentRequirementsSelector?: SelectPaymentRequirements;
}
/**
 * Core client for managing x402 payment schemes and creating payment payloads.
 *
 * Handles registration of payment schemes, policy-based filtering of payment requirements,
 * and creation of payment payloads based on server requirements.
 */
declare class x402Client {
    private readonly paymentRequirementsSelector;
    private readonly registeredClientSchemes;
    private readonly schemeClientHookAdapters;
    private readonly policies;
    private readonly registeredExtensions;
    private beforePaymentCreationHooks;
    private afterPaymentCreationHooks;
    private onPaymentCreationFailureHooks;
    private paymentResponseHooks;
    /**
     * Creates a new x402Client instance.
     *
     * @param paymentRequirementsSelector - Function to select payment requirements from available options
     */
    constructor(paymentRequirementsSelector?: SelectPaymentRequirements);
    /**
     * Creates a new x402Client instance from a configuration object.
     *
     * @param config - The client configuration including schemes, policies, and payment requirements selector
     * @returns A configured x402Client instance
     */
    static fromConfig(config: x402ClientConfig): x402Client;
    /**
     * Registers a scheme client for the current x402 version.
     *
     * @param network - The network to register the client for
     * @param client - The scheme network client to register
     * @returns The x402Client instance for chaining
     */
    register(network: Network, client: SchemeNetworkClient): x402Client;
    /**
     * Registers a scheme client for x402 version 1.
     *
     * @param network - The v1 network identifier (e.g., 'base-sepolia', 'solana-devnet')
     * @param client - The scheme network client to register
     * @returns The x402Client instance for chaining
     */
    registerV1(network: string, client: SchemeNetworkClient): x402Client;
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
    registerPolicy(policy: PaymentPolicy): x402Client;
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
    registerExtension(extension: ClientExtension): x402Client;
    /**
     * Get all registered client extensions.
     *
     * @returns Array of registered extensions
     */
    getExtensions(): ClientExtension[];
    /**
     * Register a hook to execute before payment payload creation.
     * Can abort creation by returning { abort: true, reason: string }
     *
     * @param hook - The hook function to register
     * @returns The x402Client instance for chaining
     */
    onBeforePaymentCreation(hook: BeforePaymentCreationHook): x402Client;
    /**
     * Register a hook to execute after successful payment payload creation.
     *
     * @param hook - The hook function to register
     * @returns The x402Client instance for chaining
     */
    onAfterPaymentCreation(hook: AfterPaymentCreationHook): x402Client;
    /**
     * Register a hook to execute when payment payload creation fails.
     * Can recover from failure by returning { recovered: true, payload: PaymentPayload }
     *
     * @param hook - The hook function to register
     * @returns The x402Client instance for chaining
     */
    onPaymentCreationFailure(hook: OnPaymentCreationFailureHook): x402Client;
    /**
     * Register a hook to execute after a paid request completes.
     * Can signal recovery by returning { recovered: true }, causing the transport to retry.
     *
     * @param hook - The hook function to register
     * @returns The x402Client instance for chaining
     */
    onPaymentResponse(hook: OnPaymentResponseHook): x402Client;
    /**
     * Fires all registered payment response hooks in order.
     * Returns `{ recovered: true }` if any hook signals recovery (first wins).
     *
     * @param ctx - The payment response context
     * @returns Recovery signal or undefined
     */
    handlePaymentResponse(ctx: PaymentResponseContext): Promise<{
        recovered: true;
    } | undefined>;
    /**
     * Creates a payment payload based on a PaymentRequired response.
     *
     * Automatically extracts x402Version, resource, and extensions from the PaymentRequired
     * response and constructs a complete PaymentPayload with the accepted requirements.
     *
     * @param paymentRequired - The PaymentRequired response from the server
     * @returns Promise resolving to the complete payment payload
     */
    createPaymentPayload(paymentRequired: PaymentRequired): Promise<PaymentPayload>;
    /**
     * Merges server-declared extensions with client extension echoes.
     * Client extension data may add fields, but server-declared fields remain intact.
     *
     * @param serverExtensions - Extensions declared by the server in the 402 response
     * @param clientExtensions - Extensions provided by the client or scheme
     * @returns The merged extensions object, or undefined if both inputs are undefined
     */
    private mergeExtensions;
    /**
     * Enriches a payment payload by calling registered extension hooks.
     * For each extension key present in the PaymentRequired response,
     * invokes the corresponding extension's enrichPaymentPayload callback.
     *
     * @param paymentPayload - The payment payload to enrich with extension data
     * @param paymentRequired - The PaymentRequired response containing extension declarations
     * @returns The enriched payment payload with extension data applied
     */
    private enrichPaymentPayloadWithExtensions;
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
    private selectPaymentRequirements;
    /**
     * Internal method to register a scheme client.
     *
     * @param x402Version - The x402 protocol version
     * @param network - The network to register the client for
     * @param client - The scheme network client to register
     * @returns The x402Client instance for chaining
     */
    private _registerScheme;
    /**
     * Returns manual hooks followed by the selected scheme hook and declared extension hooks.
     *
     * @param phase - Hook slot to collect
     * @param x402Version - Protocol version for the selected requirement
     * @param requirements - Selected payment requirement
     * @param declaredExtensions - Extension declarations that scope extension hooks
     * @returns Hooks in invocation order
     */
    private getLabeledHooks;
    /**
     * Maps internal hook phases to extension hook names.
     *
     * @param phase - Internal hook phase
     * @returns Extension hook key for the phase
     */
    private getClientExtensionHookKey;
}

export { type SkipHandlerDirective as $, FacilitatorResponseError as A, getFacilitatorResponseError as B, type CompiledRoute as C, type DynamicPayTo as D, x402ResourceServer as E, type FacilitatorExtension as F, type ResourceConfig as G, type HTTPAdapter as H, type PaymentRequiredContext as I, type VerifyContext as J, type VerifyResultContext as K, type VerifyFailureContext as L, type SettleContext as M, type Network as N, type SettleResultContext as O, type PaymentPayload as P, type SettleFailureContext as Q, type RouteConfig as R, type SettleResponse as S, type VerifiedPaymentCanceledContext as T, type UnpaidResponseBody as U, type VerifyResponse as V, type VerifiedPaymentCancellationReason as W, type VerifiedPaymentCancelOptions as X, type PaymentCancellationDispatcher as Y, type SettlementOverrides as Z, type ExtensionValidationResult as _, type PaymentRequirements as a, type ResourceVerifyRespone as a0, type BeforeVerifyHook as a1, type AfterVerifyHook as a2, type OnVerifyFailureHook as a3, type BeforeSettleHook as a4, type AfterSettleHook as a5, type OnSettleFailureHook as a6, type OnVerifiedPaymentCanceledHook as a7, type SchemeEnrichPaymentRequiredResponseHook as a8, type SchemePaymentRequiredContext as a9, type SupportedResponseV1 as aA, type Money as aB, type AssetAmount as aC, type Price as aD, type VerifyRequest as aE, type SettleRequest as aF, type SupportedResponse as aG, type SupportedKind as aH, VerifyError as aI, SettleError as aJ, type ResourceInfo as aK, type SchemeNetworkClient as aL, type SchemeClientHooks as aM, type SchemeNetworkServer as aN, type SchemeServerHooks as aO, type MoneyParser as aP, type PaymentPayloadResult as aQ, type PaymentPayloadContext as aR, type FacilitatorContext as aS, type ResourceServerExtension as aT, type ResourceServerExtensionHooks as aU, type DeepReadonly as aV, type SchemeEnrichSettlementPayloadHook as aa, type SchemeEnrichSettlementResponseHook as ab, SETTLEMENT_OVERRIDES_HEADER as ac, checkIfBazaarNeeded as ad, x402Client as ae, type PaymentCreationContext as af, type PaymentCreatedContext as ag, type PaymentCreationFailureContext as ah, type BeforePaymentCreationHook as ai, type AfterPaymentCreationHook as aj, type OnPaymentCreationFailureHook as ak, type PaymentResponseContext as al, type OnPaymentResponseHook as am, type SelectPaymentRequirements as an, type ClientExtensionHooks as ao, type ClientTransportExtensionHooks as ap, type ClientExtension as aq, type PaymentPolicy as ar, type SchemeRegistration as as, type x402ClientConfig as at, type PaymentRequirementsV1 as au, type PaymentRequiredV1 as av, type PaymentPayloadV1 as aw, type VerifyRequestV1 as ax, type SettleRequestV1 as ay, type SettleResponseV1 as az, type SchemeNetworkFacilitator as b, type PaymentRequired as c, type HTTPRequestContext as d, type HTTPTransportContext as e, type HTTPResponseInstructions as f, type HTTPProcessResult as g, type PaywallConfig as h, type PaywallProvider as i, type PaymentOption as j, type RoutesConfig as k, type DynamicPrice as l, type HTTPResponseBody as m, type SettlementFailedResponseBody as n, type ProcessSettleResultResponse as o, type ProcessSettleSuccessResponse as p, type ProcessSettleFailureResponse as q, type RouteValidationError as r, RouteConfigurationError as s, type ProtectedRequestHook as t, type HTTPResourceServerExtensionHooks as u, type ResourceServerTransportExtensionHooks as v, HTTPFacilitatorClient as w, x402HTTPResourceServer as x, type FacilitatorClient as y, type FacilitatorConfig as z };
