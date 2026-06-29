export { B as Base64EncodedRegex, z as DiscoveredResource, D as DiscoveredResourceSchema, C as DiscoveryPagination, n as DiscoveryPaginationSchema, I as FacilitatorConfig, F as FacilitatorRequestSchema, A as ListDiscoveryResourcesRequest, L as ListDiscoveryResourcesRequestSchema, E as ListDiscoveryResourcesResponse, o as ListDiscoveryResourcesResponseSchema, r as PaymentPayload, g as PaymentPayloadSchema, p as PaymentRequirements, P as PaymentRequirementsSchema, J as SUPPORTED_NETWORKS, h as SettleRequestSchema, u as SettleResponse, j as SettleResponseSchema, S as StellarAddressRegex, c as StellarAssetRegex, b as StellarContractRegex, H as StellarErrorReason, G as StellarErrorReasons, e as StellarNetwork, d as StellarNetworkSchema, q as StellarPayload, f as StellarPayloadSchema, K as SupportedNetwork, v as SupportedPaymentKind, k as SupportedPaymentKindSchema, w as SupportedPaymentKindsResponse, l as SupportedPaymentKindsResponseSchema, V as VerifyRequestSchema, t as VerifyResponse, i as VerifyResponseSchema, s as schemes, a as stellarNetworks, y as x402Response, m as x402ResponseSchema, x as x402Versions } from '../facilitator-BXSOGqIL.js';
import 'zod';

/**
 * Stellar Network Configuration
 */
declare const STELLAR_NETWORKS: {
    readonly "stellar-testnet": {
        readonly horizonUrl: "https://horizon-testnet.stellar.org";
        readonly sorobanRpcUrl: "https://soroban-testnet.stellar.org";
        readonly networkPassphrase: "Test SDF Network ; September 2015";
    };
    readonly stellar: {
        readonly horizonUrl: "https://horizon.stellar.org";
        readonly sorobanRpcUrl: "https://soroban.stellar.org";
        readonly networkPassphrase: "Public Global Stellar Network ; September 2015";
    };
};
type StellarNetworkId = keyof typeof STELLAR_NETWORKS;
type StellarNetworkConfig = (typeof STELLAR_NETWORKS)[StellarNetworkId];

/**
 * Well-Known Stellar Token Catalog
 *
 * Registry of verified SAC token addresses for USDC and other tokens.
 * Addresses from Coinbase x402 token catalog for compatibility.
 */

/**
 * Token metadata
 */
interface StellarToken {
    /** SAC contract address (C...) */
    address: `C${string}`;
    /** Number of decimal places */
    decimals: number;
    /** Token symbol (e.g., "USDC") */
    symbol: string;
    /** Human-readable name */
    name: string;
}
/**
 * Well-known token catalog per network
 */
declare const STELLAR_TOKENS: Record<StellarNetworkId, Record<string, StellarToken>>;
/**
 * Get token info by address
 */
declare function getTokenByAddress(network: StellarNetworkId, address: string): StellarToken | undefined;
/**
 * Get token info by symbol
 */
declare function getTokenBySymbol(network: StellarNetworkId, symbol: string): StellarToken | undefined;
/**
 * Check if an asset is a SAC token (C...)
 */
declare function isSacToken(asset: string): boolean;
/**
 * Check if an asset is native XLM
 */
declare function isNativeAsset(asset: string): boolean;

export { STELLAR_NETWORKS, STELLAR_TOKENS, type StellarNetworkConfig, type StellarNetworkId, type StellarToken, getTokenByAddress, getTokenBySymbol, isNativeAsset, isSacToken };
