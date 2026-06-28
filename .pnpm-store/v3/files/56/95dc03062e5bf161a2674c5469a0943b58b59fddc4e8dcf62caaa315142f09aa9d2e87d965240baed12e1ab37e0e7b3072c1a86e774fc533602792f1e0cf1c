import { PaymentPayload, PaymentRequirements, ResourceServerExtension, PaymentRequired, FacilitatorExtension } from '@x402/core/types';
import { Hex } from 'viem';
import { ClientExtension } from '@x402/core/client';

/**
 * Type definitions for the Builder Code Extension (ERC-8021)
 *
 * Enables attribution tracking for x402 payments by appending
 * ERC-8021 Schema 2 builder codes to settlement transaction calldata.
 */

/**
 * Extension identifier constant
 */
declare const BUILDER_CODE = "builder-code";
/**
 * ERC-8021 marker bytes (16 bytes) appended at the end of every suffix
 */
declare const ERC_8021_MARKER = "80218021802180218021802180218021";
/**
 * Schema 2 identifier byte
 */
declare const SCHEMA_2_ID = 2;
/**
 * Pattern for valid builder codes (lowercase alphanumeric + underscore, 1-32 chars)
 */
declare const BUILDER_CODE_PATTERN: RegExp;
/**
 * Builder code extension data as it appears in PaymentRequired/PaymentPayload extensions.
 *
 * Maps to ERC-8021 Schema 2 fields:
 * - a: app code (the x402 service that exposed the endpoint)
 * - w: wallet code (the facilitator that settled the payment on-chain)
 * - s: service codes array (related on-chain services the app depends on)
 */
interface BuilderCodeExtensionData {
    /**
     * App builder code — the x402 service that exposed the paid endpoint.
     * Maps to the "a" field in ERC-8021 Schema 2.
     * Set by the service in the 402 response.
     */
    a?: string;
    /**
     * Wallet builder code — the facilitator that settled the payment on-chain.
     * Maps to the "w" field in ERC-8021 Schema 2.
     * Set by the facilitator at settlement time.
     */
    w?: string;
    /**
     * Service builder codes — client-provided attribution codes.
     * Maps to the "s" field in ERC-8021 Schema 2 (encoded as an array on wire).
     * Accepts a single string or an array of strings; normalized to an array internally.
     */
    s?: string | string[];
}
/**
 * Configuration for the builder code facilitator extension.
 */
interface BuilderCodeFacilitatorConfig {
    /**
     * The facilitator's own builder code, set as the "w" field at settlement when provided.
     */
    builderCode?: string;
}
interface DataSuffixContext {
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
}

/**
 * ERC-8021 Schema 2 CBOR encoding for builder code suffixes.
 *
 * Schema 2 suffix format:
 *   [cbor_data (variable)] [suffix_data_length (2 bytes)] [schema_id = 0x02 (1 byte)] [ERC-8021 marker (16 bytes)]
 *
 * CBOR payload uses single-letter keys:
 *   "a" — app builder code (string)
 *   "w" — wallet/facilitator builder code (string)
 *   "s" — service codes (string array)
 */

/**
 * Builds a complete ERC-8021 Schema 2 data suffix from builder code data.
 *
 * Format: [cbor_data][suffix_data_length (2 bytes)][schema_id (1 byte)][marker (16 bytes)]
 *
 * The suffix_data_length covers the cbor_data only (not itself, schema_id, or marker).
 *
 * @param data - Builder code extension data with "a" and/or "s" fields
 * @returns Hex-encoded suffix bytes (without 0x prefix) ready to append to calldata
 */
declare function encodeBuilderCodeSuffix(data: BuilderCodeExtensionData): Hex;
/**
 * Parses ERC-8021 Schema 2 builder code attribution from settlement calldata.
 *
 * @param calldata - Full transaction input data
 * @returns Decoded builder code fields, or undefined if no valid suffix is present
 */
declare function parseBuilderCodeSuffixFromCalldata(calldata: Hex): BuilderCodeExtensionData | undefined;

/**
 * Resource Server utilities for the Builder Code Extension.
 */

declare const BUILDER_CODE_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly type: "object";
    readonly properties: {
        readonly a: {
            readonly type: "string";
            readonly pattern: "^[a-z0-9_]{1,32}$";
            readonly description: "App builder code";
        };
        readonly w: {
            readonly type: "string";
            readonly pattern: "^[a-z0-9_]{1,32}$";
            readonly description: "Wallet builder code";
        };
        readonly s: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
                readonly pattern: "^[a-z0-9_]{1,32}$";
            };
            readonly description: "Service builder codes";
        };
    };
    readonly additionalProperties: false;
};
interface BuilderCodeRequiredExtension {
    info: BuilderCodeExtensionData;
    schema: typeof BUILDER_CODE_SCHEMA;
}
/**
 * Declares the builder-code extension for inclusion in PaymentRequired.extensions.
 *
 * @param appCode - The service's builder code (e.g., "bc_weather_svc")
 * @returns Extension declaration with info and schema for PaymentRequired.extensions
 */
declare function declareBuilderCodeExtension(appCode: string): BuilderCodeRequiredExtension;
declare const builderCodeResourceServerExtension: ResourceServerExtension;

/**
 * Client-side extension for the Builder Code Extension.
 *
 * Attaches the client's service code (`s`) to the payment payload.
 */

/**
 * Client extension that adds builder-code attribution to payment payloads.
 *
 * @example
 * ```typescript
 * import { BuilderCodeClientExtension } from '@x402/extensions/builder-code';
 *
 * const client = new x402Client();
 * client.registerExtension(new BuilderCodeClientExtension("bc_my_client"));
 * ```
 */
declare class BuilderCodeClientExtension implements ClientExtension {
    readonly key = "builder-code";
    private readonly serviceCodes;
    /**
     * Creates a client extension that attaches the given service code(s) to payments.
     *
     * Accepts a single code or an array of codes so layered clients (e.g. an MCP
     * middleware) can attribute multiple participants. Codes are normalized to an
     * array and sent as the `s` field.
     *
     * @param serviceCodes - Client service code(s) (`s`), each 1-32 lowercase alphanumeric/underscore characters
     */
    constructor(serviceCodes: string | string[]);
    /**
     * Attaches this client's service code(s) (`s`).
     *
     * @param payload - Payment payload to enrich
     * @param _ - Server payment requirements; core merges server extension data
     * @returns Payment payload with builder-code extension data
     */
    enrichPaymentPayload(payload: PaymentPayload, _: PaymentRequired): Promise<PaymentPayload>;
}

/**
 * Facilitator-side extension for the Builder Code Extension.
 *
 * At settlement time, the facilitator encodes its wallet code into the ERC-8021
 * suffix when configured. App code (`a`) and service code (`s`) are read from
 * the client payment payload extensions.
 */

/**
 * Facilitator extension that manages builder code attribution at settlement time.
 *
 * @example
 * ```typescript
 * import { BuilderCodeFacilitatorExtension } from '@x402/extensions/builder-code';
 *
 * const facilitator = new x402Facilitator();
 * facilitator.registerExtension(new BuilderCodeFacilitatorExtension({
 *   builderCode: "bc_my_facilitator", // optional
 * }));
 * ```
 */
declare class BuilderCodeFacilitatorExtension implements FacilitatorExtension {
    readonly key = "builder-code";
    private readonly config;
    /**
     * Creates a facilitator extension that encodes builder-code attribution at settlement.
     *
     * @param config - Optional facilitator builder-code configuration (wallet code `w`)
     */
    constructor(config?: BuilderCodeFacilitatorConfig);
    /**
     * Builds the ERC-8021 Schema 2 calldata suffix for a settlement transaction.
     *
     * - `a` and `s` are read from the client's payment payload extensions.
     * - `w` is the facilitator's own code when configured.
     *
     * @param ctx - Settlement context with payment-payload extensions
     * @returns Hex-encoded ERC-8021 builder-code calldata suffix, or undefined when no attribution is present
     */
    buildDataSuffix(ctx: DataSuffixContext): Hex | undefined;
}

export { BUILDER_CODE, BUILDER_CODE_PATTERN, BUILDER_CODE_SCHEMA, BuilderCodeClientExtension, type BuilderCodeExtensionData, type BuilderCodeFacilitatorConfig, BuilderCodeFacilitatorExtension, type BuilderCodeRequiredExtension, type DataSuffixContext, ERC_8021_MARKER, SCHEMA_2_ID, builderCodeResourceServerExtension, declareBuilderCodeExtension, encodeBuilderCodeSuffix, parseBuilderCodeSuffixFromCalldata };
