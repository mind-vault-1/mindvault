/**
 * Base64 encoding/decoding utilities
 */
/**
 * Safely decode a base64 string
 */
declare function safeBase64Decode(str: string): string;
/**
 * Safely encode a string to base64
 */
declare function safeBase64Encode(str: string): string;
/**
 * Encode an object to a base64 JSON string
 */
declare function encodePaymentHeader(payload: unknown): string;
/**
 * Decode a base64 JSON string to an object
 */
declare function decodePaymentHeader<T>(header: string): T;

/**
 * JSON utilities for safe serialization
 */
/**
 * Convert BigInt values to strings for JSON serialization
 */
declare function toJsonSafe<T>(obj: T): T;

export { decodePaymentHeader, encodePaymentHeader, safeBase64Decode, safeBase64Encode, toJsonSafe };
