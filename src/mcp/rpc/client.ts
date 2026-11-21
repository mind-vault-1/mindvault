/**
 * Minimal JSON-RPC client used by MCP registry tools.
 *
 * Supports bounded, cursor-based listing of registry resources filtered by
 * verification status. Cursors are bound to the originating network endpoint
 * so a cursor issued by one registry cannot be replayed against another.
 */

export type VerificationStatus = "verified" | "unverified" | "pending" | "rejected";

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
 "verified",
 "unverified",
 "pending",
 "rejected",
];

export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export interface RegistryResource {
 id: string;
 name: string;
 verificationStatus: VerificationStatus;
}

export interface ListResourcesPage {
 items: RegistryResource[];
 nextCursor: string | null;
}

export interface ListResourcesParams {
 status: VerificationStatus;
 pageSize?: number;
 cursor?: string;
}

export interface RpcRequest {
 jsonrpc: "2.0";
 id: number;
 method: string;
 params: unknown;
}

export interface RpcResponse {
 jsonrpc: "2.0";
 id: number | null;
 result?: unknown;
 error?: { code: number; message: string; data?: unknown };
}

export type FetchLike = (
 url: string,
 init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class RpcError extends Error {
 constructor(
 message: string,
 public readonly code: number | undefined,
 public readonly data?: unknown,
 ) {
 super(message);
 this.name = "RpcError";
 }
}

export class ValidationError extends Error {
 constructor(message: string) {
 super(message);
 this.name = "ValidationError";
 }
}

export function validateStatus(value: unknown): VerificationStatus {
 if (typeof value !== "string" || !(VERIFICATION_STATUSES as readonly string[]).includes(value)) {
 throw new ValidationError(
 `invalid verification status: ${String(value)} (expected one of ${VERIFICATION_STATUSES.join(", ")})`,
 );
 }
 return value as VerificationStatus;
}

export function validatePageSize(value: unknown): number {
 if (value === undefined) return DEFAULT_PAGE_SIZE;
 if (typeof value !== "number" || !Number.isInteger(value)) {
 throw new ValidationError("pageSize must be an integer");
 }
 if (value < MIN_PAGE_SIZE || value > MAX_PAGE_SIZE) {
 throw new ValidationError(
 `pageSize must be between ${MIN_PAGE_SIZE} and ${MAX_PAGE_SIZE} (got ${value})`,
 );
 }
 return value;
}

/** Cursor encodes the endpoint it was issued for, so it cannot be reused elsewhere. */
export function encodeCursor(endpoint: string, offset: number): string {
 const payload = JSON.stringify({ e: endpoint, o: offset });
 return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(endpoint: string, cursor: string): number {
 let parsed: { e?: unknown; o?: unknown };
 try {
 parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
 } catch {
 throw new ValidationError("malformed cursor");
 }
 if (typeof parsed.e !== "string" || typeof parsed.o !== "number" || !Number.isInteger(parsed.o) || parsed.o < 0) {
 throw new ValidationError("malformed cursor");
 }
 if (parsed.e !== endpoint) {
 throw new ValidationError("cursor was issued for a different endpoint");
 }
 return parsed.o;
}

export class RegistryRpcClient {
 private nextId = 1;

 constructor(
 private readonly endpoint: string,
 private readonly fetchImpl: FetchLike,
 ) {}

 async call<T>(method: string, params: unknown): Promise<T> {
 const request: RpcRequest = { jsonrpc: "2.0", id: this.nextId++, method, params };
 const res = await this.fetchImpl(this.endpoint, {
 method: "POST",
 headers: { "content-type": "application/json" },
 body: JSON.stringify(request),
 });
 if (!res.ok) {
 throw new RpcError(`HTTP ${res.status} from registry`, res.status);
 }
 let body: RpcResponse;
 try {
 body = JSON.parse(await res.text()) as RpcResponse;
 } catch {
 throw new RpcError("registry returned invalid JSON", undefined);
 }
 if (body.error) {
 throw new RpcError(body.error.message, body.error.code, body.error.data);
 }
 if (body.result === undefined) {
 throw new RpcError("registry response missing result", undefined);
 }
 return body.result as T;
 }

 /** Lists one bounded page of resources filtered by verification status. */
 async listResourcesByVerificationStatus(params: ListResourcesParams): Promise<ListResourcesPage> {
 const status = validateStatus(params.status);
 const pageSize = validatePageSize(params.pageSize);
 const offset = params.cursor === undefined ? 0 : decodeCursor(this.endpoint, params.cursor);

 const result = await this.call<{ items?: unknown; total?: unknown }>(
 "registry.listResources",
 { verificationStatus: status, limit: pageSize, offset },
 );

 if (!result || !Array.isArray(result.items)) {
 throw new RpcError("registry response missing items", undefined);
 }

 const items = result.items as RegistryResource[];
 const total = typeof result.total === "number" ? result.total : undefined;
 const nextOffset = offset + items.length;
 const hasMore =
 items.length === pageSize && (total === undefined || nextOffset < total);

 return {
 items,
 nextCursor: hasMore ? encodeCursor(this.endpoint, nextOffset) : null,
 };
 }
}
