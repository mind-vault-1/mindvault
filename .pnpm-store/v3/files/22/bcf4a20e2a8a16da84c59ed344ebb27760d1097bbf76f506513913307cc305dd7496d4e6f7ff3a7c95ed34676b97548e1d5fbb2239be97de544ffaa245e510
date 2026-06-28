import { I as FacilitatorConfig, r as PaymentPayload, p as PaymentRequirements, t as VerifyResponse, u as SettleResponse, w as SupportedPaymentKindsResponse, A as ListDiscoveryResourcesRequest, E as ListDiscoveryResourcesResponse } from '../facilitator-BXSOGqIL.js';
import 'zod';

/**
 * Facilitator Client
 *
 * HTTP client for interacting with a Stellar x402 facilitator service.
 * Following Coinbase's useFacilitator pattern.
 */

/**
 * Creates a facilitator client for interacting with the Stellar x402 payment facilitator service
 *
 * @param facilitator - Optional facilitator config. If not provided, uses default facilitator.
 * @returns An object containing verify, settle, and supported functions
 *
 * @example
 * ```typescript
 * const { verify, settle, supported } = useFacilitator({
 *   url: "http://localhost:4022"
 * });
 *
 * // Verify a payment
 * const verifyResult = await verify(paymentPayload, paymentRequirements);
 *
 * // Settle a payment
 * const settleResult = await settle(paymentPayload, paymentRequirements);
 *
 * // Get supported payment kinds
 * const supportedKinds = await supported();
 * ```
 */
declare function useFacilitator(facilitator?: FacilitatorConfig): {
    verify: (payload: PaymentPayload, paymentRequirements: PaymentRequirements) => Promise<VerifyResponse>;
    settle: (payload: PaymentPayload, paymentRequirements: PaymentRequirements) => Promise<SettleResponse>;
    supported: () => Promise<SupportedPaymentKindsResponse>;
    list: (config?: ListDiscoveryResourcesRequest) => Promise<ListDiscoveryResourcesResponse>;
};
declare const verify: (payload: PaymentPayload, paymentRequirements: PaymentRequirements) => Promise<VerifyResponse>;
declare const settle: (payload: PaymentPayload, paymentRequirements: PaymentRequirements) => Promise<SettleResponse>;
declare const supported: () => Promise<SupportedPaymentKindsResponse>;
declare const list: (config?: ListDiscoveryResourcesRequest) => Promise<ListDiscoveryResourcesResponse>;

export { list, settle, supported, useFacilitator, verify };
