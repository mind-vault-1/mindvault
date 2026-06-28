import { FacilitatorExtension, ResourceServerExtension, ResourceInfo, PaymentPayload, PaymentRequirements, PaymentRequirementsV1 } from '@x402/core/types';
import { QueryParamMethods, BodyMethods, HTTPFacilitatorClient } from '@x402/core/http';
import { RoutesConfig } from '@x402/core/server';

/**
 * Shared type utilities for x402 extensions
 */
/**
 * Type utility to merge extensions properly when chaining.
 * If T already has extensions, merge them; otherwise add new extensions.
 *
 * @example
 * ```ts
 * // Chaining multiple extensions preserves all types:
 * const client = withBazaar(withOtherExtension(new HTTPFacilitatorClient()));
 * // Type: HTTPFacilitatorClient & { extensions: OtherExtension & BazaarExtension }
 * ```
 */
type WithExtensions<T, E> = T extends {
    extensions: infer Existing;
} ? Omit<T, "extensions"> & {
    extensions: Existing & E;
} : T & {
    extensions: E;
};

/**
 * HTTP-specific type definitions for the Bazaar Discovery Extension
 */

/** Shared schema definition for an object-typed parameter map (queryParams, pathParams, etc.) */
interface ParamMapSchemaProperty {
    type: "object";
    properties?: Record<string, unknown>;
    additionalProperties?: boolean;
}
/**
 * Discovery info for query parameter methods (GET, HEAD, DELETE)
 */
interface QueryDiscoveryInfo {
    input: {
        type: "http";
        /** Absent at declaration time; set by bazaarResourceServerExtension.enrichDeclaration */
        method?: QueryParamMethods;
        queryParams?: Record<string, unknown>;
        pathParams?: Record<string, unknown>;
        headers?: Record<string, string>;
    };
    output?: {
        type?: string;
        format?: string;
        example?: unknown;
    };
}
/**
 * Discovery info for body methods (POST, PUT, PATCH)
 */
interface BodyDiscoveryInfo {
    input: {
        type: "http";
        /** Absent at declaration time; set by bazaarResourceServerExtension.enrichDeclaration */
        method?: BodyMethods;
        bodyType: "json" | "form-data" | "text";
        body: Record<string, unknown>;
        queryParams?: Record<string, unknown>;
        pathParams?: Record<string, unknown>;
        headers?: Record<string, string>;
    };
    output?: {
        type?: string;
        format?: string;
        example?: unknown;
    };
}
/**
 * Discovery extension for query parameter methods (GET, HEAD, DELETE)
 */
interface QueryDiscoveryExtension {
    info: QueryDiscoveryInfo;
    routeTemplate?: string;
    schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema";
        type: "object";
        properties: {
            input: {
                type: "object";
                properties: {
                    type: {
                        type: "string";
                        const: "http";
                    };
                    method: {
                        type: "string";
                        enum: QueryParamMethods[];
                    };
                    queryParams?: ParamMapSchemaProperty & {
                        required?: string[];
                    };
                    pathParams?: ParamMapSchemaProperty;
                    headers?: {
                        type: "object";
                        additionalProperties: {
                            type: "string";
                        };
                    };
                };
                required: ("type" | "method")[];
                additionalProperties?: boolean;
            };
            output?: {
                type: "object";
                properties?: Record<string, unknown>;
                required?: readonly string[];
                additionalProperties?: boolean;
            };
        };
        required: ["input"];
    };
}
/**
 * Discovery extension for body methods (POST, PUT, PATCH)
 */
interface BodyDiscoveryExtension {
    info: BodyDiscoveryInfo;
    routeTemplate?: string;
    schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema";
        type: "object";
        properties: {
            input: {
                type: "object";
                properties: {
                    type: {
                        type: "string";
                        const: "http";
                    };
                    method: {
                        type: "string";
                        enum: BodyMethods[];
                    };
                    bodyType: {
                        type: "string";
                        enum: ["json", "form-data", "text"];
                    };
                    body: Record<string, unknown>;
                    queryParams?: ParamMapSchemaProperty & {
                        required?: string[];
                    };
                    pathParams?: ParamMapSchemaProperty;
                    headers?: {
                        type: "object";
                        additionalProperties: {
                            type: "string";
                        };
                    };
                };
                required: ("type" | "method" | "bodyType" | "body")[];
                additionalProperties?: boolean;
            };
            output?: {
                type: "object";
                properties?: Record<string, unknown>;
                required?: readonly string[];
                additionalProperties?: boolean;
            };
        };
        required: ["input"];
    };
}
interface DeclareQueryDiscoveryExtensionConfig {
    method?: QueryParamMethods;
    input?: Record<string, unknown>;
    inputSchema?: Record<string, unknown>;
    pathParams?: Record<string, unknown>;
    pathParamsSchema?: Record<string, unknown>;
    output?: {
        example?: unknown;
        schema?: Record<string, unknown>;
    };
}
interface DeclareBodyDiscoveryExtensionConfig {
    method?: BodyMethods;
    input?: Record<string, unknown>;
    inputSchema?: Record<string, unknown>;
    pathParams?: Record<string, unknown>;
    pathParamsSchema?: Record<string, unknown>;
    bodyType: "json" | "form-data" | "text";
    output?: {
        example?: unknown;
        schema?: Record<string, unknown>;
    };
}
interface DiscoveredHTTPResource {
    resourceUrl: string;
    description?: string;
    mimeType?: string;
    /** Sanitized service metadata. See `sanitizeResourceServiceMetadata` for rules. */
    serviceName?: string;
    tags?: string[];
    iconUrl?: string;
    /** Present after server extension enrichment; may be absent for pre-enrichment data */
    method?: string;
    routeTemplate?: string;
    x402Version: number;
    discoveryInfo: DiscoveryInfo;
    /** Extension payloads for catalog echo (v2: payload.extensions; v1: synthesized extensions.bazaar) */
    extensions?: Record<string, unknown>;
}
declare const isQueryExtensionConfig: (config: DeclareQueryDiscoveryExtensionConfig | DeclareBodyDiscoveryExtensionConfig) => config is DeclareQueryDiscoveryExtensionConfig;
declare const isBodyExtensionConfig: (config: DeclareQueryDiscoveryExtensionConfig | DeclareBodyDiscoveryExtensionConfig) => config is DeclareBodyDiscoveryExtensionConfig;

/**
 * MCP-specific type definitions for the Bazaar Discovery Extension
 */

/**
 * Discovery info for MCP tools
 */
interface McpDiscoveryInfo {
    input: {
        type: "mcp";
        toolName: string;
        description?: string;
        transport?: string;
        inputSchema: Record<string, unknown>;
        example?: Record<string, unknown>;
    };
    output?: {
        type?: string;
        format?: string;
        example?: unknown;
    };
}
/**
 * Discovery extension for MCP tools
 */
interface McpDiscoveryExtension {
    info: McpDiscoveryInfo;
    schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema";
        type: "object";
        properties: {
            input: {
                type: "object";
                properties: {
                    type: {
                        type: "string";
                        const: "mcp";
                    };
                    toolName: {
                        type: "string";
                    };
                    description?: {
                        type: "string";
                    };
                    transport?: {
                        type: "string";
                        enum?: string[];
                    };
                    inputSchema: Record<string, unknown>;
                    example?: Record<string, unknown>;
                };
                required: ("type" | "toolName" | "inputSchema")[];
                additionalProperties?: boolean;
            };
            output?: {
                type: "object";
                properties?: Record<string, unknown>;
                required?: readonly string[];
                additionalProperties?: boolean;
            };
        };
        required: ["input"];
    };
}
interface DeclareMcpDiscoveryExtensionConfig {
    toolName: string;
    description?: string;
    transport?: string;
    inputSchema: Record<string, unknown>;
    example?: Record<string, unknown>;
    output?: {
        example?: unknown;
        schema?: Record<string, unknown>;
    };
}
interface DiscoveredMCPResource {
    resourceUrl: string;
    description?: string;
    mimeType?: string;
    /** Sanitized service metadata. See `sanitizeResourceServiceMetadata` for rules. */
    serviceName?: string;
    tags?: string[];
    iconUrl?: string;
    toolName: string;
    x402Version: number;
    discoveryInfo: DiscoveryInfo;
    /** Extension payloads for catalog echo (v2: payload.extensions; v1: synthesized extensions.bazaar) */
    extensions?: Record<string, unknown>;
}
declare const isMcpExtensionConfig: (config: DeclareMcpDiscoveryExtensionConfig | Record<string, unknown>) => config is DeclareMcpDiscoveryExtensionConfig;

/**
 * Shared type definitions for the Bazaar Discovery Extension
 *
 * Protocol-specific types live in their own directories (http/, mcp/).
 * This file defines the shared unions, constants, and utility types,
 * and re-exports all protocol-specific types for backwards compatibility.
 */

/**
 * Extension identifier for the Bazaar discovery extension.
 */
declare const BAZAAR: FacilitatorExtension;
/**
 * Combined discovery info type
 */
type DiscoveryInfo = QueryDiscoveryInfo | BodyDiscoveryInfo | McpDiscoveryInfo;
/**
 * Combined discovery extension type
 */
type DiscoveryExtension = QueryDiscoveryExtension | BodyDiscoveryExtension | McpDiscoveryExtension;
type DeclareDiscoveryExtensionConfig = DeclareQueryDiscoveryExtensionConfig | DeclareBodyDiscoveryExtensionConfig | DeclareMcpDiscoveryExtensionConfig;
/**
 * Distributive Omit - properly distributes Omit over union types.
 *
 * Standard `Omit<A | B, K>` collapses to common properties only,
 * losing discriminant properties like `bodyType`.
 *
 * This type uses conditional type distribution to preserve the union:
 * `DistributiveOmit<A | B, K>` = `Omit<A, K> | Omit<B, K>`
 */
type DistributiveOmit<T, K extends keyof T> = T extends T ? Omit<T, K> : never;
/**
 * Config type for declareDiscoveryExtension function.
 * Uses DistributiveOmit to preserve bodyType discriminant in the union for HTTP configs.
 * MCP config has no `method` field so it's included directly.
 */
type DeclareDiscoveryExtensionInput = DistributiveOmit<DeclareQueryDiscoveryExtensionConfig, "method"> | DistributiveOmit<DeclareBodyDiscoveryExtensionConfig, "method"> | DeclareMcpDiscoveryExtensionConfig;

/**
 * Resource Service entry point for creating Bazaar discovery extensions
 *
 * This module provides the unified `declareDiscoveryExtension` function that
 * routes to protocol-specific builders in http/ and mcp/.
 */

/**
 * Create a discovery extension for any HTTP method or MCP tool
 *
 * This function helps servers declare how their endpoint should be called,
 * including the expected input parameters/body and output format.
 *
 * @param config - Configuration object for the discovery extension
 * @returns A discovery extension object with both info and schema
 *
 * @example
 * ```typescript
 * // For a GET endpoint with no input
 * const getExtension = declareDiscoveryExtension({
 *   method: "GET",
 *   output: {
 *     example: { message: "Success", timestamp: "2024-01-01T00:00:00Z" }
 *   }
 * });
 *
 * // For a GET endpoint with query params
 * const getWithParams = declareDiscoveryExtension({
 *   method: "GET",
 *   input: { query: "example" },
 *   inputSchema: {
 *     properties: {
 *       query: { type: "string" }
 *     },
 *     required: ["query"]
 *   }
 * });
 *
 * // For a POST endpoint with JSON body
 * const postExtension = declareDiscoveryExtension({
 *   method: "POST",
 *   input: { name: "John", age: 30 },
 *   inputSchema: {
 *     properties: {
 *       name: { type: "string" },
 *       age: { type: "number" }
 *     },
 *     required: ["name"]
 *   },
 *   bodyType: "json",
 *   output: {
 *     example: { success: true, id: "123" }
 *   }
 * });
 *
 * // For an MCP tool
 * const mcpExtension = declareDiscoveryExtension({
 *   toolName: "financial_analysis",
 *   description: "Analyze financial data for a given ticker",
 *   inputSchema: {
 *     type: "object",
 *     properties: {
 *       ticker: { type: "string" },
 *     },
 *     required: ["ticker"],
 *   },
 *   output: {
 *     example: { pe_ratio: 28.5, recommendation: "hold" }
 *   }
 * });
 * ```
 */
declare function declareDiscoveryExtension(config: DeclareDiscoveryExtensionInput): Record<string, DiscoveryExtension>;

declare const bazaarResourceServerExtension: ResourceServerExtension;

/**
 * Facilitator functions for validating and extracting Bazaar discovery extensions
 *
 * These functions help facilitators validate extension data against schemas
 * and extract the discovery information for cataloging in the Bazaar.
 *
 * Supports both v2 (extensions in PaymentRequired) and v1 (outputSchema in PaymentRequirements).
 */

/**
 * Checks whether a routeTemplate value is structurally valid.
 *
 * Expected format: "/:param" segments using colon-prefixed identifiers
 * (e.g. "/users/:userId", "/weather/:country/:city").
 *
 * The facilitator is a trust boundary: clients control the payment payload and
 * can modify routeTemplate before submission. A malicious value could cause the
 * facilitator to catalog the payment under an arbitrary URL (catalog poisoning).
 * This function enforces minimal structural requirements:
 * - Must be a non-empty string starting with "/"
 * - Must match the safe URL path character set (alphanumeric, _, :, /, ., -, ~, %)
 * - Must not contain ".." (path traversal)
 * - Must not contain "://" (URL injection)
 *
 * @param value - The raw routeTemplate string from the client payload
 * @returns true if the value is a valid routeTemplate, false otherwise
 *
 * @internal Exported for facilitator use.
 */
declare function isValidRouteTemplate(value: string | undefined): value is string;
/**
 * Validates a routeTemplate and returns it if valid, undefined otherwise.
 *
 * @param value - The raw routeTemplate string to validate
 * @returns The validated value, or undefined if invalid
 * @deprecated Use `isValidRouteTemplate` instead.
 */
declare function validateRouteTemplate(value: string | undefined): string | undefined;
/**
 * Checks whether a serviceName value is structurally valid for the bazaar
 * `resource.serviceName` field. Non-empty string of printable ASCII
 * (U+0020–U+007E), length ≤ 32.
 *
 * The ASCII restriction matches the `paymentidentifier.id` convention and
 * keeps `len()` semantics identical across TS / Python / Go.
 *
 * Mirrors `_is_valid_service_name` (Python) and `isValidServiceName` (Go).
 * All three implementations must stay in sync.
 *
 * @param value - The raw serviceName string from the resource object
 * @returns true if the value is a valid serviceName, false otherwise
 *
 * @internal Exported for facilitator use.
 */
declare function isValidServiceName(value: string | undefined): value is string;
/**
 * Sanitizes a tags array for the bazaar `resource.tags` field. Drops entries
 * that are not non-empty printable-ASCII strings of at most 32 characters,
 * then truncates to the first 5 valid entries. Returns undefined when no
 * entries survive (so the field can be omitted from the catalog).
 *
 * The ASCII restriction matches the `paymentidentifier.id` convention and
 * keeps `len()` semantics identical across TS / Python / Go.
 *
 * Mirrors `_sanitize_tags` (Python) and `sanitizeTags` (Go).
 * All three implementations must stay in sync.
 *
 * @param value - The raw tags value from the resource object (typed as unknown
 *   because callers pass it directly from a parsed JSON payload)
 * @returns The sanitized tags array, or undefined if no entries survive
 *
 * @internal Exported for facilitator use.
 */
declare function sanitizeTags(value: unknown): string[] | undefined;
/**
 * Checks whether an iconUrl value is structurally safe for the bazaar
 * `resource.iconUrl` field.
 *
 * Rules (see `specs/extensions/bazaar.md` "Service Metadata on `resource`"):
 *   - String of length ≤ 2048
 *   - No ASCII control characters
 *   - Parses as an absolute http:// or https:// URL
 *   - No userinfo (user@host)
 *   - Host is IDN-normalized (UTS #46) before checks, so confusable
 *     full-width / Unicode forms (e.g. `ｌｏｃａｌｈｏｓｔ`) collapse to their
 *     ASCII canonical and get caught by the loopback check
 *   - Host is not an IP literal (v4 or v6), not in the loopback set
 *     (`localhost`, `localhost.localdomain`, `ip6-localhost`, `ip6-loopback`)
 *   - Host is not a decimal IP encoding (e.g. `2130706433` → 127.0.0.1) or
 *     hex literal (e.g. `0x7f000001`) — common SSRF bypass forms
 *
 * Percent-decoding is applied to the hostname before IDN normalization, and
 * IDN normalization runs before the IP / loopback checks (parallel to the
 * routeTemplate decoder).
 *
 * Mirrors `_is_valid_icon_url` (Python) and `isValidIconUrl` (Go).
 * All three implementations must stay in sync.
 *
 * @param value - The raw iconUrl string from the resource object
 * @returns true if the value is a structurally safe iconUrl, false otherwise
 *
 * @internal Exported for facilitator use.
 */
declare function isValidIconUrl(value: string | undefined): value is string;
/**
 * Sanitized service metadata extracted from a `resource` object.
 */
interface SanitizedResourceServiceMetadata {
    serviceName?: string;
    tags?: string[];
    iconUrl?: string;
}
/**
 * Applies the bazaar service-metadata validation rules to a `resource` object
 * and returns only the fields that survive. Missing or invalid fields are
 * dropped silently (soft-drop semantics — see spec).
 *
 * @param resource - The raw `resource` object from a PaymentRequired or
 *   PaymentPayload, or undefined.
 * @returns An object containing only the valid serviceName / tags / iconUrl.
 *
 * @internal Exported for facilitator use.
 */
declare function sanitizeResourceServiceMetadata(resource: ResourceInfo | undefined | null): SanitizedResourceServiceMetadata;
/**
 * Validation result for discovery extensions
 */
interface ValidationResult {
    valid: boolean;
    errors?: string[];
}
/**
 * Validates a discovery extension's info against its schema
 *
 * @param extension - The discovery extension containing info and schema
 * @returns Validation result indicating if the info matches the schema
 *
 * @example
 * ```typescript
 * const extension = declareDiscoveryExtension(...);
 * const result = validateDiscoveryExtension(extension);
 *
 * if (result.valid) {
 *   console.log("Extension is valid");
 * } else {
 *   console.error("Validation errors:", result.errors);
 * }
 * ```
 */
declare function validateDiscoveryExtension(extension: DiscoveryExtension): ValidationResult;
/**
 * Validates a discovery extension against the Bazaar protocol specification.
 *
 * Unlike `validateDiscoveryExtension` which checks internal consistency (info vs schema),
 * this function enforces protocol-level invariants:
 *   - `info.input.type` must be "http" or "mcp"
 *   - HTTP: if `method` is present it must be GET/POST/PUT/PATCH/DELETE/HEAD
 *   - HTTP body methods: `bodyType` must be "json" | "form-data" | "text"
 *   - MCP: `toolName` (string) and `inputSchema` (object) are required
 *   - MCP: if `transport` is present it must be "streamable-http" | "sse"
 *
 * Designed to be safe for pre-enrichment HTTP extensions where `method` may be absent.
 *
 * @param extension - The discovery extension to validate
 * @returns Validation result with spec-level errors
 */
declare function validateDiscoveryExtensionSpec(extension: Record<string, unknown>): ValidationResult;

type DiscoveredResource = DiscoveredHTTPResource | DiscoveredMCPResource;
/**
 * Extracts discovery information from payment payload and requirements.
 * Combines resource URL, HTTP method, version, and discovery info into a single object.
 *
 * @param paymentPayload - The payment payload containing extensions and resource info
 * @param paymentRequirements - The payment requirements to validate against
 * @param validate - Whether to validate the discovery info against the schema (default: true)
 * @returns Discovered resource info with URL, method, version, discovery data, and catalog
 *   extensions echo (v2: `paymentPayload.extensions`; v1: synthesized `extensions.bazaar`
 *   from requirements outputSchema), or null if not found
 */
declare function extractDiscoveryInfo(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements | PaymentRequirementsV1, validate?: boolean): DiscoveredResource | null;
/**
 * Extracts discovery info from a v2 extension directly
 *
 * This is a lower-level function for when you already have the extension object.
 * For general use, prefer the main extractDiscoveryInfo function.
 *
 * @param extension - The discovery extension to extract info from
 * @param validate - Whether to validate before extracting (default: true)
 * @returns The discovery info if valid
 * @throws Error if validation fails and validate is true
 */
declare function extractDiscoveryInfoFromExtension(extension: DiscoveryExtension, validate?: boolean): DiscoveryInfo;
/**
 * Validates and extracts discovery info in one step
 *
 * This is a convenience function that combines validation and extraction,
 * returning both the validation result and the info if valid.
 *
 * @param extension - The discovery extension to validate and extract
 * @returns Object containing validation result and info (if valid)
 *
 * @example
 * ```typescript
 * const extension = declareDiscoveryExtension(...);
 * const { valid, info, errors } = validateAndExtract(extension);
 *
 * if (valid && info) {
 *   // Store info in Bazaar catalog
 * } else {
 *   console.error("Validation errors:", errors);
 * }
 * ```
 */
declare function validateAndExtract(extension: DiscoveryExtension): {
    valid: boolean;
    info?: DiscoveryInfo;
    errors?: string[];
};

/**
 * V1 Facilitator functions for extracting Bazaar discovery information
 *
 * In v1, discovery information is stored in the `outputSchema` field
 * of PaymentRequirements, which has a different structure than v2.
 *
 * This module transforms v1 data into v2 DiscoveryInfo format.
 */

/**
 * Extracts discovery info from v1 PaymentRequirements and transforms to v2 format
 *
 * In v1, the discovery information is stored in the `outputSchema` field,
 * which contains both input (endpoint shape) and output (response schema) information.
 *
 * This function makes smart assumptions to normalize v1 data into v2 DiscoveryInfo format:
 * - For GET/HEAD/DELETE: Looks for queryParams, query, or params fields
 * - For POST/PUT/PATCH: Looks for bodyFields, body, or data fields and normalizes bodyType
 * - Extracts optional headers if present
 *
 * @param paymentRequirements - V1 payment requirements
 * @returns Discovery info in v2 format if present and valid, or null if not discoverable
 *
 * @example
 * ```typescript
 * const requirements: PaymentRequirementsV1 = {
 *   scheme: "exact",
 *   network: "eip155:8453",
 *   maxAmountRequired: "100000",
 *   resource: "https://api.example.com/data",
 *   description: "Get data",
 *   mimeType: "application/json",
 *   outputSchema: {
 *     input: {
 *       type: "http",
 *       method: "GET",
 *       discoverable: true,
 *       queryParams: { query: "string" }
 *     },
 *     output: { type: "object" }
 *   },
 *   payTo: "0x...",
 *   maxTimeoutSeconds: 300,
 *   asset: "0x...",
 *   extra: {}
 * };
 *
 * const info = extractDiscoveryInfoV1(requirements);
 * if (info) {
 *   console.log("Endpoint method:", info.input.method);
 * }
 * ```
 */
declare function extractDiscoveryInfoV1(paymentRequirements: PaymentRequirementsV1): DiscoveryInfo | null;
/**
 * Checks if v1 PaymentRequirements contains discoverable information
 *
 * @param paymentRequirements - V1 payment requirements
 * @returns True if the requirements contain valid discovery info
 *
 * @example
 * ```typescript
 * if (isDiscoverableV1(requirements)) {
 *   const info = extractDiscoveryInfoV1(requirements);
 *   // Catalog info in Bazaar
 * }
 * ```
 */
declare function isDiscoverableV1(paymentRequirements: PaymentRequirementsV1): boolean;
/**
 * Extracts resource metadata from v1 PaymentRequirements
 *
 * In v1, resource information is embedded directly in the payment requirements
 * rather than in a separate resource object.
 *
 * @param paymentRequirements - V1 payment requirements
 * @returns Resource metadata
 *
 * @example
 * ```typescript
 * const metadata = extractResourceMetadataV1(requirements);
 * console.log("Resource URL:", metadata.url);
 * console.log("Description:", metadata.description);
 * ```
 */
declare function extractResourceMetadataV1(paymentRequirements: PaymentRequirementsV1): {
    url: string;
    description: string;
    mimeType: string;
};

/**
 * Shared startup-time validation utilities for bazaar extensions in route configs.
 *
 * Used by middleware packages (Express, Hono, Next) to validate bazaar extensions
 * at server startup without duplicating the iteration and warning logic.
 */

/**
 * Validate bazaar extensions on all routes using JSON-schema validation.
 * Emits console warnings for invalid extensions but does not throw.
 *
 * @param routes - Route configuration to scan for bazaar extensions
 */
declare function validateBazaarRouteExtensions(routes: RoutesConfig): void;

/**
 * Client extensions for querying Bazaar discovery resources
 */

/**
 * Parameters for listing discovery resources.
 * All parameters are optional and used for filtering/pagination.
 */
interface ListDiscoveryResourcesParams {
    /**
     * Filter by protocol type (e.g., "http", "mcp").
     */
    type?: string;
    /**
     * Filter by payment recipient address.
     */
    payTo?: string;
    /**
     * Filter by payment scheme (e.g., "exact").
     */
    scheme?: string;
    /**
     * Filter by payment network (e.g., "eip155:8453").
     */
    network?: string;
    /**
     * Filter by extension key present on the discovered resource.
     */
    extensions?: string;
    /**
     * The number of discovered x402 resources to return per page.
     */
    limit?: number;
    /**
     * The offset of the first discovered x402 resource to return.
     */
    offset?: number;
}
/**
 * Parameters for searching discovery resources.
 */
interface SearchDiscoveryResourcesParams {
    /**
     * Natural-language search query.
     */
    query: string;
    /**
     * Filter by protocol type (e.g., "http", "mcp").
     */
    type?: string;
    /**
     * Filter by payment recipient address.
     */
    payTo?: string;
    /**
     * Filter by payment scheme (e.g., "exact").
     */
    scheme?: string;
    /**
     * Filter by payment network (e.g., "eip155:8453").
     */
    network?: string;
    /**
     * Filter by extension key present on the discovered resource.
     */
    extensions?: string;
    /**
     * Advisory maximum number of results. The server may return fewer or ignore this.
     */
    limit?: number;
    /**
     * Advisory continuation cursor from a previous response. The server may ignore this.
     */
    cursor?: string;
}
/**
 * A discovered x402 resource from the bazaar.
 */
interface DiscoveryResource {
    /** The URL or identifier of the discovered resource */
    resource: string;
    /** The protocol type of the resource (e.g., "http") */
    type: string;
    /** The x402 protocol version supported by this resource */
    x402Version: number;
    /** Array of accepted payment methods for this resource */
    accepts: PaymentRequirements[];
    /** ISO 8601 timestamp of when the resource was last updated */
    lastUpdated: string;
    /** Human-readable description of the resource */
    description?: string;
    /** MIME type of the resource response */
    mimeType?: string;
    /** Human-readable name for the service hosting the resource */
    serviceName?: string;
    /** Short topical tags for discovery search */
    tags?: string[];
    /** Absolute http(s) URL to a service icon */
    iconUrl?: string;
    /** Extension payloads echoed from discovery (e.g. bazaar info/schema) */
    extensions?: Record<string, unknown>;
}
/**
 * Response from listing discovery resources.
 */
interface DiscoveryResourcesResponse {
    /** The x402 protocol version of this response */
    x402Version: number;
    /** The list of discovered resources */
    items: DiscoveryResource[];
    /** Pagination information for the response */
    pagination: {
        /** Maximum number of results returned */
        limit: number;
        /** Number of results skipped */
        offset: number;
        /** Total count of resources matching the query */
        total: number;
    };
}
/**
 * Response from searching discovery resources.
 */
interface SearchDiscoveryResourcesResponse {
    /** The x402 protocol version of this response */
    x402Version: number;
    /** The list of matching discovered resources */
    resources: DiscoveryResource[];
    /** Whether additional matches were truncated by facilitator */
    partialResults?: boolean;
    /** Optional pagination details when a paginated response is returned */
    pagination?: {
        /** Number of results in this page */
        limit: number;
        /** Continuation cursor for the next page; may be null */
        cursor: string | null;
    } | null;
}
/**
 * Bazaar client extension interface providing discovery query functionality.
 */
interface BazaarClientExtension {
    bazaar: {
        /**
         * List x402 discovery resources from the bazaar.
         *
         * @param params - Optional filtering and pagination parameters
         * @returns A promise resolving to the discovery resources response
         */
        listResources(params?: ListDiscoveryResourcesParams): Promise<DiscoveryResourcesResponse>;
        /**
         * Search x402 discovery resources from the bazaar using a natural-language query.
         *
         * Pagination is optional: facilitators may ignore `limit` and `cursor`, or include
         * `response.pagination` when pagination is used.
         *
         * @param params - Search parameters including the required query string
         * @returns A promise resolving to the search response
         */
        search(params: SearchDiscoveryResourcesParams): Promise<SearchDiscoveryResourcesResponse>;
    };
}
/**
 * Extends a facilitator client with Bazaar discovery query functionality.
 * Preserves and merges with any existing extensions from prior chaining.
 *
 * @param client - The facilitator client to extend
 * @returns The client extended with bazaar discovery capabilities
 *
 * @example
 * ```ts
 * // Basic usage
 * const client = withBazaar(new HTTPFacilitatorClient());
 * const resources = await client.extensions.bazaar.listResources({ type: "http" });
 *
 * // Search
 * const results = await client.extensions.bazaar.search({ query: "weather APIs" });
 *
 * // Chaining with other extensions
 * const client = withBazaar(withOtherExtension(new HTTPFacilitatorClient()));
 * await client.extensions.other.someMethod();
 * await client.extensions.bazaar.listResources();
 * ```
 */
declare function withBazaar<T extends HTTPFacilitatorClient>(client: T): WithExtensions<T, BazaarClientExtension>;

export { type DiscoveredHTTPResource as A, type BodyDiscoveryInfo as B, type DiscoveredMCPResource as C, type DiscoveryInfo as D, type DiscoveredResource as E, extractDiscoveryInfoV1 as F, isDiscoverableV1 as G, extractResourceMetadataV1 as H, validateBazaarRouteExtensions as I, withBazaar as J, type BazaarClientExtension as K, type ListDiscoveryResourcesParams as L, type McpDiscoveryInfo as M, type SearchDiscoveryResourcesParams as N, type DiscoveryResource as O, type DiscoveryResourcesResponse as P, type QueryDiscoveryInfo as Q, type SearchDiscoveryResourcesResponse as R, type SanitizedResourceServiceMetadata as S, type ValidationResult as V, type WithExtensions as W, type QueryDiscoveryExtension as a, bazaarResourceServerExtension as b, type BodyDiscoveryExtension as c, type McpDiscoveryExtension as d, type DiscoveryExtension as e, type DeclareQueryDiscoveryExtensionConfig as f, type DeclareBodyDiscoveryExtensionConfig as g, type DeclareMcpDiscoveryExtensionConfig as h, type DeclareDiscoveryExtensionConfig as i, type DeclareDiscoveryExtensionInput as j, BAZAAR as k, isMcpExtensionConfig as l, isQueryExtensionConfig as m, isBodyExtensionConfig as n, declareDiscoveryExtension as o, isValidRouteTemplate as p, validateRouteTemplate as q, isValidServiceName as r, sanitizeTags as s, isValidIconUrl as t, sanitizeResourceServiceMetadata as u, validateDiscoveryExtension as v, validateDiscoveryExtensionSpec as w, extractDiscoveryInfo as x, extractDiscoveryInfoFromExtension as y, validateAndExtract as z };
