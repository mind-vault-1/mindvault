import { z } from 'zod';

/**
 * Zod Schemas for x402 Protocol - Stellar Implementation
 *
 * These schemas match Coinbase's x402 specification exactly,
 * with Stellar-specific types for the payload.
 */

declare const schemes: readonly ["exact"];
declare const x402Versions: readonly [1];
declare const stellarNetworks: readonly ["stellar-testnet", "stellar"];
declare const StellarAddressRegex: RegExp;
declare const StellarContractRegex: RegExp;
declare const StellarAssetRegex: RegExp;
declare const Base64EncodedRegex: RegExp;
declare const StellarNetworkSchema: z.ZodEnum<["stellar-testnet", "stellar"]>;
type StellarNetwork = z.infer<typeof StellarNetworkSchema>;
declare const PaymentRequirementsSchema: z.ZodObject<{
    scheme: z.ZodEnum<["exact"]>;
    network: z.ZodEnum<["stellar-testnet", "stellar"]>;
    maxAmountRequired: z.ZodEffects<z.ZodString, string, string>;
    resource: z.ZodString;
    description: z.ZodString;
    mimeType: z.ZodString;
    outputSchema: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
    payTo: z.ZodString;
    maxTimeoutSeconds: z.ZodNumber;
    asset: z.ZodString;
    extra: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
}, "strip", z.ZodTypeAny, {
    scheme: "exact";
    network: "stellar-testnet" | "stellar";
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    outputSchema?: Record<string, any> | null | undefined;
    extra?: Record<string, any> | null | undefined;
}, {
    scheme: "exact";
    network: "stellar-testnet" | "stellar";
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    outputSchema?: Record<string, any> | null | undefined;
    extra?: Record<string, any> | null | undefined;
}>;
declare const StellarPayloadSchema: z.ZodObject<{
    signedTxXdr: z.ZodString;
    sourceAccount: z.ZodString;
    amount: z.ZodEffects<z.ZodString, string, string>;
    destination: z.ZodString;
    asset: z.ZodString;
    validUntilLedger: z.ZodNumber;
    nonce: z.ZodString;
}, "strip", z.ZodTypeAny, {
    asset: string;
    signedTxXdr: string;
    sourceAccount: string;
    amount: string;
    destination: string;
    validUntilLedger: number;
    nonce: string;
}, {
    asset: string;
    signedTxXdr: string;
    sourceAccount: string;
    amount: string;
    destination: string;
    validUntilLedger: number;
    nonce: string;
}>;
declare const PaymentPayloadSchema: z.ZodObject<{
    x402Version: z.ZodEffects<z.ZodNumber, number, number>;
    scheme: z.ZodEnum<["exact"]>;
    network: z.ZodEnum<["stellar-testnet", "stellar"]>;
    payload: z.ZodObject<{
        signedTxXdr: z.ZodString;
        sourceAccount: z.ZodString;
        amount: z.ZodEffects<z.ZodString, string, string>;
        destination: z.ZodString;
        asset: z.ZodString;
        validUntilLedger: z.ZodNumber;
        nonce: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        asset: string;
        signedTxXdr: string;
        sourceAccount: string;
        amount: string;
        destination: string;
        validUntilLedger: number;
        nonce: string;
    }, {
        asset: string;
        signedTxXdr: string;
        sourceAccount: string;
        amount: string;
        destination: string;
        validUntilLedger: number;
        nonce: string;
    }>;
}, "strip", z.ZodTypeAny, {
    scheme: "exact";
    network: "stellar-testnet" | "stellar";
    x402Version: number;
    payload: {
        asset: string;
        signedTxXdr: string;
        sourceAccount: string;
        amount: string;
        destination: string;
        validUntilLedger: number;
        nonce: string;
    };
}, {
    scheme: "exact";
    network: "stellar-testnet" | "stellar";
    x402Version: number;
    payload: {
        asset: string;
        signedTxXdr: string;
        sourceAccount: string;
        amount: string;
        destination: string;
        validUntilLedger: number;
        nonce: string;
    };
}>;
declare const FacilitatorRequestSchema: z.ZodEffects<z.ZodObject<{
    x402Version: z.ZodEffects<z.ZodNumber, number, number>;
    paymentHeader: z.ZodOptional<z.ZodString>;
    paymentPayload: z.ZodOptional<z.ZodObject<{
        x402Version: z.ZodEffects<z.ZodNumber, number, number>;
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        payload: z.ZodObject<{
            signedTxXdr: z.ZodString;
            sourceAccount: z.ZodString;
            amount: z.ZodEffects<z.ZodString, string, string>;
            destination: z.ZodString;
            asset: z.ZodString;
            validUntilLedger: z.ZodNumber;
            nonce: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        }, {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    }>>;
    paymentRequirements: z.ZodObject<{
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        maxAmountRequired: z.ZodEffects<z.ZodString, string, string>;
        resource: z.ZodString;
        description: z.ZodString;
        mimeType: z.ZodString;
        outputSchema: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
        payTo: z.ZodString;
        maxTimeoutSeconds: z.ZodNumber;
        asset: z.ZodString;
        extra: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}>, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}>;
declare const VerifyRequestSchema: z.ZodEffects<z.ZodObject<{
    x402Version: z.ZodEffects<z.ZodNumber, number, number>;
    paymentHeader: z.ZodOptional<z.ZodString>;
    paymentPayload: z.ZodOptional<z.ZodObject<{
        x402Version: z.ZodEffects<z.ZodNumber, number, number>;
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        payload: z.ZodObject<{
            signedTxXdr: z.ZodString;
            sourceAccount: z.ZodString;
            amount: z.ZodEffects<z.ZodString, string, string>;
            destination: z.ZodString;
            asset: z.ZodString;
            validUntilLedger: z.ZodNumber;
            nonce: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        }, {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    }>>;
    paymentRequirements: z.ZodObject<{
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        maxAmountRequired: z.ZodEffects<z.ZodString, string, string>;
        resource: z.ZodString;
        description: z.ZodString;
        mimeType: z.ZodString;
        outputSchema: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
        payTo: z.ZodString;
        maxTimeoutSeconds: z.ZodNumber;
        asset: z.ZodString;
        extra: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}>, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}>;
declare const SettleRequestSchema: z.ZodEffects<z.ZodObject<{
    x402Version: z.ZodEffects<z.ZodNumber, number, number>;
    paymentHeader: z.ZodOptional<z.ZodString>;
    paymentPayload: z.ZodOptional<z.ZodObject<{
        x402Version: z.ZodEffects<z.ZodNumber, number, number>;
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        payload: z.ZodObject<{
            signedTxXdr: z.ZodString;
            sourceAccount: z.ZodString;
            amount: z.ZodEffects<z.ZodString, string, string>;
            destination: z.ZodString;
            asset: z.ZodString;
            validUntilLedger: z.ZodNumber;
            nonce: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        }, {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    }>>;
    paymentRequirements: z.ZodObject<{
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        maxAmountRequired: z.ZodEffects<z.ZodString, string, string>;
        resource: z.ZodString;
        description: z.ZodString;
        mimeType: z.ZodString;
        outputSchema: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
        payTo: z.ZodString;
        maxTimeoutSeconds: z.ZodNumber;
        asset: z.ZodString;
        extra: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}>, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}, {
    x402Version: number;
    paymentRequirements: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    };
    paymentHeader?: string | undefined;
    paymentPayload?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        payload: {
            asset: string;
            signedTxXdr: string;
            sourceAccount: string;
            amount: string;
            destination: string;
            validUntilLedger: number;
            nonce: string;
        };
    } | undefined;
}>;
declare const VerifyResponseSchema: z.ZodObject<{
    isValid: z.ZodBoolean;
    invalidReason: z.ZodOptional<z.ZodString>;
    payer: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    isValid: boolean;
    invalidReason?: string | undefined;
    payer?: string | undefined;
}, {
    isValid: boolean;
    invalidReason?: string | undefined;
    payer?: string | undefined;
}>;
declare const SettleResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    errorReason: z.ZodOptional<z.ZodString>;
    payer: z.ZodOptional<z.ZodString>;
    transaction: z.ZodString;
    network: z.ZodString;
}, "strip", z.ZodTypeAny, {
    network: string;
    success: boolean;
    transaction: string;
    payer?: string | undefined;
    errorReason?: string | undefined;
}, {
    network: string;
    success: boolean;
    transaction: string;
    payer?: string | undefined;
    errorReason?: string | undefined;
}>;
declare const SupportedPaymentKindSchema: z.ZodObject<{
    x402Version: z.ZodEffects<z.ZodNumber, number, number>;
    scheme: z.ZodEnum<["exact"]>;
    network: z.ZodEnum<["stellar-testnet", "stellar"]>;
    extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    scheme: "exact";
    network: "stellar-testnet" | "stellar";
    x402Version: number;
    extra?: Record<string, any> | undefined;
}, {
    scheme: "exact";
    network: "stellar-testnet" | "stellar";
    x402Version: number;
    extra?: Record<string, any> | undefined;
}>;
declare const SupportedPaymentKindsResponseSchema: z.ZodObject<{
    kinds: z.ZodArray<z.ZodObject<{
        x402Version: z.ZodEffects<z.ZodNumber, number, number>;
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        extra?: Record<string, any> | undefined;
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        extra?: Record<string, any> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    kinds: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        extra?: Record<string, any> | undefined;
    }[];
}, {
    kinds: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        x402Version: number;
        extra?: Record<string, any> | undefined;
    }[];
}>;
declare const x402ResponseSchema: z.ZodObject<{
    x402Version: z.ZodEffects<z.ZodNumber, number, number>;
    error: z.ZodOptional<z.ZodString>;
    accepts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        maxAmountRequired: z.ZodEffects<z.ZodString, string, string>;
        resource: z.ZodString;
        description: z.ZodString;
        mimeType: z.ZodString;
        outputSchema: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
        payTo: z.ZodString;
        maxTimeoutSeconds: z.ZodNumber;
        asset: z.ZodString;
        extra: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }>, "many">>;
    payer: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    x402Version: number;
    payer?: string | undefined;
    error?: string | undefined;
    accepts?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }[] | undefined;
}, {
    x402Version: number;
    payer?: string | undefined;
    error?: string | undefined;
    accepts?: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }[] | undefined;
}>;
/**
 * A discovered resource in the x402 ecosystem
 */
declare const DiscoveredResourceSchema: z.ZodObject<{
    /** The resource URL being monetized */
    resource: z.ZodString;
    /** Resource type (currently only "http") */
    type: z.ZodEnum<["http"]>;
    /** x402 protocol version */
    x402Version: z.ZodEffects<z.ZodNumber, number, number>;
    /** Payment requirements for this resource */
    accepts: z.ZodArray<z.ZodObject<{
        scheme: z.ZodEnum<["exact"]>;
        network: z.ZodEnum<["stellar-testnet", "stellar"]>;
        maxAmountRequired: z.ZodEffects<z.ZodString, string, string>;
        resource: z.ZodString;
        description: z.ZodString;
        mimeType: z.ZodString;
        outputSchema: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
        payTo: z.ZodString;
        maxTimeoutSeconds: z.ZodNumber;
        asset: z.ZodString;
        extra: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
    }, "strip", z.ZodTypeAny, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }, {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }>, "many">;
    /** Unix timestamp of when the resource was last updated */
    lastUpdated: z.ZodNumber;
    /** Additional metadata about the resource */
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    type: "http";
    resource: string;
    x402Version: number;
    accepts: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }[];
    lastUpdated: number;
    metadata?: Record<string, any> | undefined;
}, {
    type: "http";
    resource: string;
    x402Version: number;
    accepts: {
        scheme: "exact";
        network: "stellar-testnet" | "stellar";
        maxAmountRequired: string;
        resource: string;
        description: string;
        mimeType: string;
        payTo: string;
        maxTimeoutSeconds: number;
        asset: string;
        outputSchema?: Record<string, any> | null | undefined;
        extra?: Record<string, any> | null | undefined;
    }[];
    lastUpdated: number;
    metadata?: Record<string, any> | undefined;
}>;
/**
 * Request parameters for listing discovery resources
 */
declare const ListDiscoveryResourcesRequestSchema: z.ZodObject<{
    /** Filter by resource type */
    type: z.ZodOptional<z.ZodString>;
    /** Maximum number of results to return (1-100) */
    limit: z.ZodOptional<z.ZodNumber>;
    /** Number of results to skip for pagination */
    offset: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}, {
    type?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}>;
/**
 * Pagination info for discovery responses
 */
declare const DiscoveryPaginationSchema: z.ZodObject<{
    limit: z.ZodNumber;
    offset: z.ZodNumber;
    total: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    limit: number;
    offset: number;
    total: number;
}, {
    limit: number;
    offset: number;
    total: number;
}>;
/**
 * Response from the discovery resources endpoint
 */
declare const ListDiscoveryResourcesResponseSchema: z.ZodObject<{
    x402Version: z.ZodEffects<z.ZodNumber, number, number>;
    items: z.ZodArray<z.ZodObject<{
        /** The resource URL being monetized */
        resource: z.ZodString;
        /** Resource type (currently only "http") */
        type: z.ZodEnum<["http"]>;
        /** x402 protocol version */
        x402Version: z.ZodEffects<z.ZodNumber, number, number>;
        /** Payment requirements for this resource */
        accepts: z.ZodArray<z.ZodObject<{
            scheme: z.ZodEnum<["exact"]>;
            network: z.ZodEnum<["stellar-testnet", "stellar"]>;
            maxAmountRequired: z.ZodEffects<z.ZodString, string, string>;
            resource: z.ZodString;
            description: z.ZodString;
            mimeType: z.ZodString;
            outputSchema: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
            payTo: z.ZodString;
            maxTimeoutSeconds: z.ZodNumber;
            asset: z.ZodString;
            extra: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
        }, "strip", z.ZodTypeAny, {
            scheme: "exact";
            network: "stellar-testnet" | "stellar";
            maxAmountRequired: string;
            resource: string;
            description: string;
            mimeType: string;
            payTo: string;
            maxTimeoutSeconds: number;
            asset: string;
            outputSchema?: Record<string, any> | null | undefined;
            extra?: Record<string, any> | null | undefined;
        }, {
            scheme: "exact";
            network: "stellar-testnet" | "stellar";
            maxAmountRequired: string;
            resource: string;
            description: string;
            mimeType: string;
            payTo: string;
            maxTimeoutSeconds: number;
            asset: string;
            outputSchema?: Record<string, any> | null | undefined;
            extra?: Record<string, any> | null | undefined;
        }>, "many">;
        /** Unix timestamp of when the resource was last updated */
        lastUpdated: z.ZodNumber;
        /** Additional metadata about the resource */
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        type: "http";
        resource: string;
        x402Version: number;
        accepts: {
            scheme: "exact";
            network: "stellar-testnet" | "stellar";
            maxAmountRequired: string;
            resource: string;
            description: string;
            mimeType: string;
            payTo: string;
            maxTimeoutSeconds: number;
            asset: string;
            outputSchema?: Record<string, any> | null | undefined;
            extra?: Record<string, any> | null | undefined;
        }[];
        lastUpdated: number;
        metadata?: Record<string, any> | undefined;
    }, {
        type: "http";
        resource: string;
        x402Version: number;
        accepts: {
            scheme: "exact";
            network: "stellar-testnet" | "stellar";
            maxAmountRequired: string;
            resource: string;
            description: string;
            mimeType: string;
            payTo: string;
            maxTimeoutSeconds: number;
            asset: string;
            outputSchema?: Record<string, any> | null | undefined;
            extra?: Record<string, any> | null | undefined;
        }[];
        lastUpdated: number;
        metadata?: Record<string, any> | undefined;
    }>, "many">;
    pagination: z.ZodObject<{
        limit: z.ZodNumber;
        offset: z.ZodNumber;
        total: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        offset: number;
        total: number;
    }, {
        limit: number;
        offset: number;
        total: number;
    }>;
}, "strip", z.ZodTypeAny, {
    x402Version: number;
    items: {
        type: "http";
        resource: string;
        x402Version: number;
        accepts: {
            scheme: "exact";
            network: "stellar-testnet" | "stellar";
            maxAmountRequired: string;
            resource: string;
            description: string;
            mimeType: string;
            payTo: string;
            maxTimeoutSeconds: number;
            asset: string;
            outputSchema?: Record<string, any> | null | undefined;
            extra?: Record<string, any> | null | undefined;
        }[];
        lastUpdated: number;
        metadata?: Record<string, any> | undefined;
    }[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
    };
}, {
    x402Version: number;
    items: {
        type: "http";
        resource: string;
        x402Version: number;
        accepts: {
            scheme: "exact";
            network: "stellar-testnet" | "stellar";
            maxAmountRequired: string;
            resource: string;
            description: string;
            mimeType: string;
            payTo: string;
            maxTimeoutSeconds: number;
            asset: string;
            outputSchema?: Record<string, any> | null | undefined;
            extra?: Record<string, any> | null | undefined;
        }[];
        lastUpdated: number;
        metadata?: Record<string, any> | undefined;
    }[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
    };
}>;
type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;
type StellarPayload = z.infer<typeof StellarPayloadSchema>;
type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;
type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
type SettleResponse = z.infer<typeof SettleResponseSchema>;
type SupportedPaymentKind = z.infer<typeof SupportedPaymentKindSchema>;
type SupportedPaymentKindsResponse = z.infer<typeof SupportedPaymentKindsResponseSchema>;
type x402Response = z.infer<typeof x402ResponseSchema>;
type DiscoveredResource = z.infer<typeof DiscoveredResourceSchema>;
type ListDiscoveryResourcesRequest = z.infer<typeof ListDiscoveryResourcesRequestSchema>;
type DiscoveryPagination = z.infer<typeof DiscoveryPaginationSchema>;
type ListDiscoveryResourcesResponse = z.infer<typeof ListDiscoveryResourcesResponseSchema>;

/**
 * Facilitator Types and Error Codes
 */

declare const StellarErrorReasons: readonly ["insufficient_funds", "invalid_network", "invalid_payload", "invalid_payment_requirements", "invalid_scheme", "invalid_payment", "payment_expired", "unsupported_scheme", "invalid_x402_version", "invalid_transaction_state", "unexpected_settle_error", "unexpected_verify_error", "invalid_exact_stellar_payload_missing_signed_tx_xdr", "invalid_exact_stellar_payload_invalid_xdr", "invalid_exact_stellar_payload_source_account_not_found", "invalid_exact_stellar_payload_insufficient_balance", "invalid_exact_stellar_payload_amount_mismatch", "invalid_exact_stellar_payload_destination_mismatch", "invalid_exact_stellar_payload_asset_mismatch", "invalid_exact_stellar_payload_network_mismatch", "invalid_exact_stellar_payload_missing_required_fields", "invalid_exact_stellar_payload_transaction_expired", "invalid_exact_stellar_payload_transaction_already_used", "settle_exact_stellar_transaction_failed", "settle_exact_stellar_fee_bump_failed"];
type StellarErrorReason = (typeof StellarErrorReasons)[number];
interface FacilitatorConfig {
    url: string;
    createAuthHeaders?: () => Promise<{
        verify: Record<string, string>;
        settle: Record<string, string>;
        supported: Record<string, string>;
        list?: Record<string, string>;
    }>;
}
declare const SUPPORTED_NETWORKS: readonly ["stellar-testnet", "stellar"];
type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

export { type ListDiscoveryResourcesRequest as A, Base64EncodedRegex as B, type DiscoveryPagination as C, DiscoveredResourceSchema as D, type ListDiscoveryResourcesResponse as E, FacilitatorRequestSchema as F, StellarErrorReasons as G, type StellarErrorReason as H, type FacilitatorConfig as I, SUPPORTED_NETWORKS as J, type SupportedNetwork as K, ListDiscoveryResourcesRequestSchema as L, PaymentRequirementsSchema as P, StellarAddressRegex as S, VerifyRequestSchema as V, stellarNetworks as a, StellarContractRegex as b, StellarAssetRegex as c, StellarNetworkSchema as d, type StellarNetwork as e, StellarPayloadSchema as f, PaymentPayloadSchema as g, SettleRequestSchema as h, VerifyResponseSchema as i, SettleResponseSchema as j, SupportedPaymentKindSchema as k, SupportedPaymentKindsResponseSchema as l, x402ResponseSchema as m, DiscoveryPaginationSchema as n, ListDiscoveryResourcesResponseSchema as o, type PaymentRequirements as p, type StellarPayload as q, type PaymentPayload as r, schemes as s, type VerifyResponse as t, type SettleResponse as u, type SupportedPaymentKind as v, type SupportedPaymentKindsResponse as w, x402Versions as x, type x402Response as y, type DiscoveredResource as z };
