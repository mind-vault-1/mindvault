import { P as PaymentPayload, c as PaymentRequired, S as SettleResponse } from '../x402Client-DYQEW6Y8.js';
export { C as CompiledRoute, D as DynamicPayTo, l as DynamicPrice, y as FacilitatorClient, z as FacilitatorConfig, A as FacilitatorResponseError, H as HTTPAdapter, w as HTTPFacilitatorClient, g as HTTPProcessResult, d as HTTPRequestContext, u as HTTPResourceServerExtensionHooks, m as HTTPResponseBody, f as HTTPResponseInstructions, e as HTTPTransportContext, j as PaymentOption, h as PaywallConfig, i as PaywallProvider, q as ProcessSettleFailureResponse, o as ProcessSettleResultResponse, p as ProcessSettleSuccessResponse, t as ProtectedRequestHook, v as ResourceServerTransportExtensionHooks, R as RouteConfig, s as RouteConfigurationError, r as RouteValidationError, k as RoutesConfig, n as SettlementFailedResponseBody, U as UnpaidResponseBody, B as getFacilitatorResponseError, x as x402HTTPResourceServer } from '../x402Client-DYQEW6Y8.js';
export { HTTPClientExtensionHooks, HTTPPaymentStatus, HTTPResourceResponse, PaymentRequiredContext, PaymentRequiredHook, x402HTTPClient } from '../client/index.js';

type QueryParamMethods = "GET" | "HEAD" | "DELETE";
type BodyMethods = "POST" | "PUT" | "PATCH";
/**
 * Encodes a payment payload as a base64 header value.
 *
 * @param paymentPayload - The payment payload to encode
 * @returns Base64 encoded string representation of the payment payload
 */
declare function encodePaymentSignatureHeader(paymentPayload: PaymentPayload): string;
/**
 * Decodes a base64 payment signature header into a payment payload.
 *
 * @param paymentSignatureHeader - The base64 encoded payment signature header
 * @returns The decoded payment payload
 */
declare function decodePaymentSignatureHeader(paymentSignatureHeader: string): PaymentPayload;
/**
 * Encodes a payment required object as a base64 header value.
 *
 * @param paymentRequired - The payment required object to encode
 * @returns Base64 encoded string representation of the payment required object
 */
declare function encodePaymentRequiredHeader(paymentRequired: PaymentRequired): string;
/**
 * Decodes a base64 payment required header into a payment required object.
 *
 * @param paymentRequiredHeader - The base64 encoded payment required header
 * @returns The decoded payment required object
 */
declare function decodePaymentRequiredHeader(paymentRequiredHeader: string): PaymentRequired;
/**
 * Encodes a payment response as a base64 header value.
 *
 * @param paymentResponse - The payment response to encode
 * @returns Base64 encoded string representation of the payment response
 */
declare function encodePaymentResponseHeader(paymentResponse: SettleResponse): string;
/**
 * Decodes a base64 payment response header into a settle response.
 *
 * @param paymentResponseHeader - The base64 encoded payment response header
 * @returns The decoded settle response
 */
declare function decodePaymentResponseHeader(paymentResponseHeader: string): SettleResponse;

export { type BodyMethods, type QueryParamMethods, decodePaymentRequiredHeader, decodePaymentResponseHeader, decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader, encodePaymentSignatureHeader };
