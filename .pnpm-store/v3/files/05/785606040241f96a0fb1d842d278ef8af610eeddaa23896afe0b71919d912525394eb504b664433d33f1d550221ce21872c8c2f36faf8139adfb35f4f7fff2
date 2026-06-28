import { c as PaymentRequired, ae as x402Client, P as PaymentPayload, S as SettleResponse } from '../x402Client-DYQEW6Y8.mjs';
export { aj as AfterPaymentCreationHook, ai as BeforePaymentCreationHook, aq as ClientExtension, ao as ClientExtensionHooks, ap as ClientTransportExtensionHooks, ak as OnPaymentCreationFailureHook, am as OnPaymentResponseHook, ag as PaymentCreatedContext, af as PaymentCreationContext, ah as PaymentCreationFailureContext, ar as PaymentPolicy, al as PaymentResponseContext, as as SchemeRegistration, an as SelectPaymentRequirements, at as x402ClientConfig } from '../x402Client-DYQEW6Y8.mjs';

/**
 * Context provided to onPaymentRequired hooks.
 */
interface PaymentRequiredContext {
    paymentRequired: PaymentRequired;
}
/**
 * Hook called when a 402 response is received, before payment processing.
 * Return headers to try before payment, or void to proceed directly to payment.
 */
type PaymentRequiredHook = (context: PaymentRequiredContext) => Promise<{
    headers: Record<string, string>;
} | void>;
interface HTTPClientExtensionHooks {
    onPaymentRequired?: (declaration: unknown, context: PaymentRequiredContext) => Promise<{
        headers: Record<string, string>;
    } | void>;
}
/**
 * HTTP-specific client for handling x402 payment protocol over HTTP.
 *
 * Wraps a x402Client to provide HTTP-specific encoding/decoding functionality
 * for payment headers and responses while maintaining the builder pattern.
 */
declare class x402HTTPClient {
    private readonly client;
    private paymentRequiredHooks;
    /**
     * Creates a new x402HTTPClient instance.
     *
     * @param client - The underlying x402Client for payment logic
     */
    constructor(client: x402Client);
    /**
     * Register a hook to handle 402 responses before payment.
     * Hooks run in order; first to return headers wins.
     *
     * @param hook - The hook function to register
     * @returns This instance for chaining
     */
    onPaymentRequired(hook: PaymentRequiredHook): this;
    /**
     * Run hooks and return headers if any hook provides them.
     *
     * @param paymentRequired - The payment required response from the server
     * @returns Headers to use for retry, or null to proceed to payment
     */
    handlePaymentRequired(paymentRequired: PaymentRequired): Promise<Record<string, string> | null>;
    /**
     * Encodes a payment payload into appropriate HTTP headers based on version.
     *
     * @param paymentPayload - The payment payload to encode
     * @returns HTTP headers containing the encoded payment signature
     */
    encodePaymentSignatureHeader(paymentPayload: PaymentPayload): Record<string, string>;
    /**
     * Extracts payment required information from HTTP response.
     *
     * @param getHeader - Function to retrieve header value by name (case-insensitive)
     * @param body - Optional response body for v1 compatibility
     * @returns The payment required object
     */
    getPaymentRequiredResponse(getHeader: (name: string) => string | null | undefined, body?: unknown): PaymentRequired;
    /**
     * Extracts payment settlement response from HTTP headers.
     *
     * @param getHeader - Function to retrieve header value by name (case-insensitive)
     * @returns The settlement response object
     */
    getPaymentSettleResponse(getHeader: (name: string) => string | null | undefined): SettleResponse;
    /**
     * Creates a payment payload for the given payment requirements.
     * Delegates to the underlying x402Client.
     *
     * @param paymentRequired - The payment required response from the server
     * @returns Promise resolving to the payment payload
     */
    createPaymentPayload(paymentRequired: PaymentRequired): Promise<PaymentPayload>;
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
    processPaymentResult(paymentPayload: PaymentPayload, getHeader: (name: string) => string | null | undefined, status: number): Promise<{
        recovered: boolean;
        settleResponse?: SettleResponse;
    }>;
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
    parsePaymentResult(args: {
        status: number;
        getHeader: (name: string) => string | null | undefined;
        body: unknown;
    }): HTTPResourceResponse;
    /**
     * Parses a fetch Response into an `HTTPResourceResponse` for app-level convenience.
     *
     * @param response - The fetch Response to process
     * @returns The parsed status, body, and decoded payment header
     */
    processResponse(response: Response): Promise<HTTPResourceResponse>;
    /**
     * Manual HTTP hooks run before extension hooks scoped to the 402 response.
     *
     * @param paymentRequired - The payment required response from the server
     * @returns Hooks in invocation order
     */
    private getPaymentRequiredHooks;
}
/**
 * Parsed result of an HTTP request to an x402 resource.
 */
type HTTPResourceResponse = {
    /** HTTP status code. */
    status: number;
    /** x402 payment outcome. */
    paymentStatus: HTTPPaymentStatus;
    /** Parsed response body. */
    body: unknown;
    /**
     * Decoded x402 payment header, if present:
     * - SettleResponse  (from PAYMENT-RESPONSE / X-PAYMENT-RESPONSE)
     * - PaymentRequired (from PAYMENT-REQUIRED; its `error` carries the server reason)
     */
    header?: SettleResponse | PaymentRequired;
};
type HTTPPaymentStatus = "settled" | "settle_failed" | "payment_required" | "none";

export { type HTTPClientExtensionHooks, type HTTPPaymentStatus, type HTTPResourceResponse, type PaymentRequiredContext, type PaymentRequiredHook, x402Client, x402HTTPClient };
