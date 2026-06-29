import { isValidISO8601Date } from '@signinwithethereum/siwe-parser';
import { SiweParseError } from '@signinwithethereum/siwe-parser';

/**
 * Thrown by adapter chain-ID validation so the caller can match
 * on type instead of fragile string checks.
 */
export declare class ChainIdMismatchError extends Error {
    constructor(message: string);
}

/**
 * This method calls the EIP-1271 method for Smart Contract wallets
 * via the provided SiweConfig.
 * @param message The EIP-4361 parsed message
 * @param signature The signature to verify
 * @param config SiweConfig with checkContractWalletSignature support
 * @returns {Promise<boolean>} Whether the signature is valid for the contract wallet.
 */
export declare const checkContractWalletSignature: (message: SiweMessage, signature: string, config?: SiweConfig) => Promise<boolean>;

export declare const checkInvalidKeys: <T>(obj: T, keys: (keyof T)[]) => (keyof T)[];

/**
 * Set the global SIWE verification config.
 * Used as the default when no config is passed to verify().
 *
 * @example
 * ```ts
 * // With ethers
 * import { configure, createEthersConfig } from '@signinwithethereum/ts';
 * configure(createEthersConfig(provider));
 *
 * // With viem
 * import { configure, createViemConfig } from '@signinwithethereum/ts';
 * configure(await createViemConfig({ publicClient }));
 * ```
 */
export declare function configure(config: SiweConfig): void;

/**
 * Create a SiweConfig from a plain RPC URL.
 * Auto-detects whether viem or ethers is installed and creates
 * the appropriate config with full EIP-1271 support.
 *
 * @param rpcUrl - JSON-RPC endpoint URL (e.g. 'https://eth.llamarpc.com')
 *
 * @example
 * ```ts
 * import { createConfig, configure } from '@signinwithethereum/siwe';
 *
 * configure(await createConfig('https://eth.llamarpc.com'));
 * ```
 */
export declare function createConfig(rpcUrl: string): Promise<SiweConfig>;

/**
 * Create a SiweConfig using ethers.js (v5 or v6).
 * Auto-detects the installed ethers version.
 *
 * @param provider - ethers Provider for EIP-1271 contract wallet verification (optional)
 *
 * @example
 * ```ts
 * import { createEthersConfig, configure } from '@signinwithethereum/siwe';
 * import { ethers } from 'ethers';
 *
 * const provider = new ethers.JsonRpcProvider('https://...');
 * configure(await createEthersConfig(provider));
 * ```
 */
export declare function createEthersConfig(provider?: any): Promise<SiweConfig>;

/**
 * Create a SiweConfig using viem.
 * Requires viem to be installed as a peer dependency.
 *
 * @example
 * ```ts
 * import { createViemConfig, configure } from '@signinwithethereum/ts';
 * import { createPublicClient, http } from 'viem';
 * import { mainnet } from 'viem/chains';
 *
 * const publicClient = createPublicClient({ chain: mainnet, transport: http() });
 * configure(await createViemConfig({ publicClient }));
 * ```
 */
export declare function createViemConfig(opts?: ViemConfigOpts): Promise<SiweConfig>;

/** EIP-1271 magic value returned by isValidSignature for valid signatures */
export declare const EIP1271_MAGICVALUE = "0x1626ba7e";

/** 32-byte magic suffix appended to EIP-6492 wrapped signatures */
export declare const EIP6492_MAGIC_SUFFIX = "6492649264926492649264926492649264926492649264926492649264926492";

/**
 * This method leverages a native CSPRNG with support for both browser and Node.js
 * environments in order generate a cryptographically secure nonce for use in the
 * SiweMessage in order to prevent replay attacks.
 *
 * 96 bits has been chosen as a number to sufficiently balance size and security considerations
 * relative to the lifespan of it's usage.
 *
 * @returns cryptographically generated random nonce with 96 bits of entropy encoded with
 * an alphanumeric character set.
 */
export declare const generateNonce: () => string;

/** Get the current global config, or null if not set. */
export declare function getGlobalConfig(): SiweConfig | null;

/** Check if a hex-encoded signature ends with the EIP-6492 magic suffix */
export declare function isEIP6492Signature(signature: string): boolean;

export { isValidISO8601Date }

/**
 * Provider-agnostic configuration for SIWE verification.
 * Implement this interface to use any Ethereum library (ethers, viem, etc.).
 */
export declare interface SiweConfig {
    /** Recover the signer address from an EIP-191 signed message */
    verifyMessage: (message: string, signature: string) => string | Promise<string>;
    /** Hash a message per EIP-191 personal_sign */
    hashMessage: (message: string) => string;
    /** Normalize an address to EIP-55 checksum format */
    getAddress: (address: string) => string;
    /**
     * Check EIP-1271 smart contract wallet signature.
     * Optional — required only for contract wallet support.
     * @param address - The wallet contract address
     * @param message - The raw message string (adapter should hash it)
     * @param signature - The signature bytes
     */
    checkContractWalletSignature?: (address: string, message: string, signature: string, chainId: number) => Promise<boolean>;
}

/**
 * Structured error for SIWE verification and validation failures.
 * Extends Error so it works with instanceof, stack traces, and error reporting tools.
 */
export declare class SiweError extends Error {
    /** Structured error type for programmatic matching. */
    readonly type: SiweErrorType;
    /** Expected value or condition to pass. */
    readonly expected?: string;
    /** Received value that caused the failure. */
    readonly received?: string;
    constructor(type: SiweErrorType, expected?: string, received?: string);
}

/**
 * Possible message error types.
 */
export declare enum SiweErrorType {
    /** `expirationTime` is present and in the past. */
    EXPIRED_MESSAGE = "Expired message.",
    /** `domain` is not a valid authority or is empty. */
    INVALID_DOMAIN = "Invalid domain.",
    /** `scheme` don't match the scheme provided for verification. */
    SCHEME_MISMATCH = "Scheme does not match provided scheme for verification.",
    /** `domain` don't match the domain provided for verification. */
    DOMAIN_MISMATCH = "Domain does not match provided domain for verification.",
    /** `nonce` don't match the nonce provided for verification. */
    NONCE_MISMATCH = "Nonce does not match provided nonce for verification.",
    /** `uri` does not match the URI provided for verification. */
    URI_MISMATCH = "URI does not match provided URI for verification.",
    /** `chainId` does not match the chain ID provided for verification. */
    CHAIN_ID_MISMATCH = "Chain ID does not match provided chain ID for verification.",
    /** `requestId` does not match the request ID provided for verification. */
    REQUEST_ID_MISMATCH = "Request ID does not match provided request ID for verification.",
    /** `address` does not conform to EIP-55 or is not a valid address. */
    INVALID_ADDRESS = "Invalid address.",
    /** `uri` does not conform to RFC 3986. */
    INVALID_URI = "URI does not conform to RFC 3986.",
    /** `nonce` is smaller then 8 characters or is not alphanumeric */
    INVALID_NONCE = "Nonce size smaller then 8 characters or is not alphanumeric.",
    /** `notBefore` is present and in the future. */
    NOT_YET_VALID_MESSAGE = "Message is not valid yet.",
    /** Signature doesn't match the address of the message. */
    INVALID_SIGNATURE = "Signature does not match address of the message.",
    /** EIP-1271 verification was attempted with a provider/client on the wrong chain. */
    INVALID_SIGNATURE_CHAIN_ID = "Contract wallet verification provider chain does not match message chain ID.",
    /** `expirationTime`, `notBefore` or `issuedAt` not compliant to ISO-8601. */
    INVALID_TIME_FORMAT = "Invalid time format.",
    /** `version` is not 1. */
    INVALID_MESSAGE_VERSION = "Invalid message version.",
    /** Thrown when some required field is missing. */
    UNABLE_TO_PARSE = "Unable to parse the message.",
    /** `domain` was not provided for verification. */
    MISSING_DOMAIN = "Domain is required for verification.",
    /** `nonce` was not provided for verification. */
    MISSING_NONCE = "Nonce is required for verification.",
    /** `uri` was not provided in strict mode. */
    MISSING_URI = "URI is required in strict mode.",
    /** `chainId` was not provided in strict mode. */
    MISSING_CHAIN_ID = "Chain ID is required in strict mode.",
    /** No verification config found (no global config, no opts.config, no auto-detect). */
    MISSING_CONFIG = "No verification configuration found.",
    /** Required provider library (viem or ethers) is not installed. */
    MISSING_PROVIDER_LIBRARY = "Required provider library is not installed.",
    /** Nonce generation failed. */
    NONCE_GENERATION_FAILED = "Nonce generation failed.",
    /** Invalid parameters or options passed to verify(). */
    INVALID_PARAMS = "Invalid parameters passed to verify.",
    /** Message could not be prepared for signing. */
    MALFORMED_MESSAGE = "Message could not be prepared for signing."
}

export declare class SiweMessage {
    /**RFC 3986 URI scheme for the authority that is requesting the signing. */
    scheme?: string;
    /**RFC 4501 dns authority that is requesting the signing. */
    domain: string;
    /**Ethereum address performing the signing conformant to capitalization
     * encoded checksum specified in EIP-55 where applicable. */
    address: string;
    /**Human-readable ASCII assertion that the user will sign, and it must not
     * contain `\n`. */
    statement?: string;
    /**RFC 3986 URI referring to the resource that is the subject of the signing
     *  (as in the __subject__ of a claim). */
    uri: string;
    /**Current version of the message. */
    version: string;
    /**EIP-155 Chain ID to which the session is bound, and the network where
     * Contract Accounts must be resolved. */
    chainId: number;
    /**Randomized token used to prevent replay attacks, at least 8 alphanumeric
     * characters. */
    nonce: string;
    /**ISO 8601 datetime string of the current time. */
    issuedAt?: string;
    /**ISO 8601 datetime string that, if present, indicates when the signed
     * authentication message is no longer valid. */
    expirationTime?: string;
    /**ISO 8601 datetime string that, if present, indicates when the signed
     * authentication message will become valid. */
    notBefore?: string;
    /**System-specific identifier that may be used to uniquely refer to the
     * sign-in request. */
    requestId?: string;
    /**List of information or references to information the user wishes to have
     * resolved as part of authentication by the relying party. They are
     * expressed as RFC 3986 URIs separated by `\n- `. */
    resources?: string[];
    /** Non-fatal warnings from parsing (e.g. unchecksummed address). */
    warnings: string[];
    /**
     * Creates a parsed Sign in with Ethereum Message (EIP-4361) object from a
     * string or an object. If a string is used an ABNF parser is called to
     * validate the parameter, otherwise the fields are attributed.
     * @param param {string | SiweMessage} Sign message as a string or an object.
     */
    constructor(param: string | Partial<SiweMessage>);
    /**
     * This function can be used to retrieve an EIP-4361 formatted message for
     * signature, although you can call it directly it's advised to use
     * [prepareMessage()] instead which will resolve to the correct method based
     * on the [type] attribute of this object, in case of other formats being
     * implemented.
     * @returns {string} EIP-4361 formatted message, ready for EIP-191 signing.
     */
    toMessage(): string;
    /**
     * This method parses all the fields in the object and creates a messaging for signing
     * message according with the type defined.
     * @returns {string} Returns a message ready to be signed according with the
     * type defined in the object.
     */
    prepareMessage(): string;
    /**
     * Verifies the integrity of the object by matching its signature.
     * @param params Parameters to verify the integrity of the message, signature is required.
     * @returns {Promise<SiweMessage>} This object if valid.
     */
    verify(params: VerifyParams, opts?: VerifyOpts): Promise<SiweResponse>;
}

export { SiweParseError }

/**
 * Returned on verifications.
 */
export declare interface SiweResponse {
    /** Boolean representing if the message was verified with success. */
    success: boolean;
    /** If present `success` MUST be false and will provide extra information on the failure reason. */
    error?: SiweError;
    /** Original message that was verified. */
    data: SiweMessage;
}

export declare interface VerifyOpts {
    /**
     * @deprecated Use `config` with a SiweConfig that includes EIP-1271 support instead.
     * ethers provider for EIP-1271 validation.
     */
    provider?: any;
    /**
     * Verification config providing crypto functions.
     * If not set, falls back to the global config (set via `configure()`),
     * then auto-detects ethers if installed.
     */
    config?: SiweConfig;
    /** If the library should reject promises on errors, defaults to false */
    suppressExceptions?: boolean;
    /** Enables a custom verification function that will be ran alongside EIP-1271 check. */
    verificationFallback?: (params: VerifyParams, opts: VerifyOpts, message: SiweMessage, EIP1271Promise: Promise<SiweResponse>) => Promise<SiweResponse>;
    /**
     * When true, requires uri and chainId in addition to the always-required
     * domain and nonce. Use this to enforce full contextual binding.
     */
    strict?: boolean;
}

export declare const VerifyOptsKeys: (keyof VerifyOpts)[];

export declare interface VerifyParams {
    /** Signature of the message signed by the wallet */
    signature: string;
    /** RFC 3986 URI scheme for the authority that is requesting the signing. */
    scheme?: string;
    /** RFC 4501 dns authority that is requesting the signing. Required for origin binding. */
    domain: string;
    /** Randomized token used to prevent replay attacks, at least 8 alphanumeric characters. Required for replay resistance. */
    nonce: string;
    /** RFC 3986 URI referring to the resource that is the subject of the signing. */
    uri?: string;
    /** EIP-155 Chain ID to which the session is bound. */
    chainId?: number;
    /** System-specific identifier referring to the sign-in request. */
    requestId?: string;
    /**ISO 8601 datetime string of the current time. */
    time?: string;
}

export declare const VerifyParamsKeys: (keyof VerifyParams)[];

export declare interface ViemConfigOpts {
    /**
     * viem PublicClient for smart contract wallet verification.
     * If `verifyMessage` is available (viem v2+), EIP-6492 signatures
     * from pre-deployed ERC-4337 wallets are automatically supported.
     * Otherwise, falls back to ERC-1271 only via `readContract`.
     */
    publicClient?: {
        readContract: (args: any) => Promise<any>;
        verifyMessage?: (args: any) => Promise<boolean>;
        getChainId?: () => Promise<number>;
        chain?: {
            id: number;
        };
    };
}

export { }
