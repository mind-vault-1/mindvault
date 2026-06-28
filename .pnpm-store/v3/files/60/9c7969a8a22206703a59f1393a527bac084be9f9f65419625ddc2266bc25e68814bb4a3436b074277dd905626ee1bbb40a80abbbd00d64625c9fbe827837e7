import { a as PaymentRequirements, S as SettleResponse } from '../x402Client-DYQEW6Y8.js';
export { a5 as AfterSettleHook, a2 as AfterVerifyHook, a4 as BeforeSettleHook, a1 as BeforeVerifyHook, C as CompiledRoute, _ as ExtensionValidationResult, y as FacilitatorClient, z as FacilitatorConfig, A as FacilitatorResponseError, H as HTTPAdapter, w as HTTPFacilitatorClient, g as HTTPProcessResult, d as HTTPRequestContext, m as HTTPResponseBody, f as HTTPResponseInstructions, e as HTTPTransportContext, a6 as OnSettleFailureHook, a7 as OnVerifiedPaymentCanceledHook, a3 as OnVerifyFailureHook, Y as PaymentCancellationDispatcher, I as PaymentRequiredContext, h as PaywallConfig, i as PaywallProvider, q as ProcessSettleFailureResponse, o as ProcessSettleResultResponse, p as ProcessSettleSuccessResponse, t as ProtectedRequestHook, G as ResourceConfig, a0 as ResourceVerifyRespone, R as RouteConfig, s as RouteConfigurationError, r as RouteValidationError, k as RoutesConfig, ac as SETTLEMENT_OVERRIDES_HEADER, a8 as SchemeEnrichPaymentRequiredResponseHook, aa as SchemeEnrichSettlementPayloadHook, ab as SchemeEnrichSettlementResponseHook, a9 as SchemePaymentRequiredContext, M as SettleContext, Q as SettleFailureContext, O as SettleResultContext, n as SettlementFailedResponseBody, Z as SettlementOverrides, $ as SkipHandlerDirective, U as UnpaidResponseBody, X as VerifiedPaymentCancelOptions, T as VerifiedPaymentCanceledContext, W as VerifiedPaymentCancellationReason, J as VerifyContext, L as VerifyFailureContext, K as VerifyResultContext, ad as checkIfBazaarNeeded, B as getFacilitatorResponseError, x as x402HTTPResourceServer, E as x402ResourceServer } from '../x402Client-DYQEW6Y8.js';

/**
 * True when a string field is treated as unset and may be filled by `enrichPaymentRequiredResponse`.
 *
 * @param value - Candidate string from `PaymentRequirements` (e.g. `payTo`, `amount`, `asset`)
 * @returns Whether the field counts as vacant (empty or whitespace-only)
 */
declare function isVacantStringField(value: string): boolean;
/**
 * Deep snapshot of `accepts` entries before any `enrichPaymentRequiredResponse` runs.
 *
 * @param requirements - Payment requirement rows to clone
 * @returns Cloned requirements suitable as an immutable baseline for policy checks
 */
declare function snapshotPaymentRequirementsList(requirements: PaymentRequirements[]): PaymentRequirements[];
/**
 * After extension enrichment, each `accepts[i]` must still match the baseline except that
 * **`payTo`**, **`amount`**, and **`asset`** may change only when the baseline value is vacant
 * (whitespace-only string). **`scheme`**, **`network`**, and **`maxTimeoutSeconds`** are never
 * writable by extensions. **`extra`** may gain new keys; values for keys present in the baseline
 * must be unchanged (deep-equal).
 *
 * @param baseline - Snapshot taken before any enrich hooks for this response
 * @param current - Live `accepts` entries after an extension enrich step
 * @param extensionKey - Registered extension key (for error messages)
 * @returns Nothing; throws if the policy is violated
 */
declare function assertAcceptsAllowlistedAfterExtensionEnrich(baseline: PaymentRequirements[], current: PaymentRequirements[], extensionKey: string): void;
/**
 * Ensures scheme 402 enrichment only adds `extra` keys to matching accepts.
 *
 * @param baseline - Snapshot before the scheme enrich step
 * @param current - Live `accepts` entries after scheme enrichment
 * @param scheme - Scheme whose hook was invoked
 * @param network - Network whose hook was invoked
 */
declare function assertAcceptsAdditiveExtraAfterSchemeEnrich(baseline: PaymentRequirements[], current: PaymentRequirements[], scheme: string, network: string): void;
/**
 * Immutable subset of {@link SettleResponse} compared across settlement extension enrich.
 */
type SettleResponseCoreSnapshot = Pick<SettleResponse, "success" | "transaction" | "network" | "amount" | "payer" | "errorReason" | "errorMessage">;
/**
 * Captures facilitator-settled fields that extensions must not rewrite.
 *
 * @param result - Settlement response from the facilitator
 * @returns Plain snapshot of core fields for later comparison
 */
declare function snapshotSettleResponseCore(result: SettleResponse): SettleResponseCoreSnapshot;
/**
 * Ensures `enrichSettlementResponse` did not rewrite facilitator outcome fields; only
 * `extensions` may be populated via the merger (in addition to in-place adds on `extensions`).
 *
 * @param before - Snapshot taken before extension settlement enrich
 * @param after - Live settlement result after an extension enrich step
 * @param extensionKey - Registered extension key (for error messages)
 * @returns Nothing; throws if a core field changed
 */
declare function assertSettleResponseCoreUnchanged(before: SettleResponseCoreSnapshot, after: SettleResponse, extensionKey: string): void;
/**
 * Ensures scheme settlement-payload enrichment only adds server-owned fields.
 *
 * @param payload - Existing scheme payload before enrichment
 * @param enrichment - Fields returned by the scheme enrichment hook
 * @param callerLabel - Hook source label used in policy error messages
 */
declare function assertAdditivePayloadEnrichment(payload: Record<string, unknown>, enrichment: Record<string, unknown>, callerLabel: string): void;
/**
 * Ensures scheme response enrichment only adds new `extra` fields, including nested fields
 * below existing objects.
 *
 * @param extra - Existing settlement extra fields
 * @param enrichment - Fields returned by the scheme response enrichment hook
 * @param callerLabel - Hook label used in policy error messages
 */
declare function assertAdditiveSettlementExtra(extra: Record<string, unknown>, enrichment: Record<string, unknown>, callerLabel: string): void;

export { type SettleResponseCoreSnapshot, assertAcceptsAdditiveExtraAfterSchemeEnrich, assertAcceptsAllowlistedAfterExtensionEnrich, assertAdditivePayloadEnrichment, assertAdditiveSettlementExtra, assertSettleResponseCoreUnchanged, isVacantStringField, snapshotPaymentRequirementsList, snapshotSettleResponseCore };
