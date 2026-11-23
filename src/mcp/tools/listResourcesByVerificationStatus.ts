import { z } from "zod";

export const VERIFICATION_STATUSES = ["verified", "unverified", "pending", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const listResourcesByVerificationStatusInputSchema = z.object({
 status: z.enum(VERIFICATION_STATUSES),
 pageSize: z
 .number()
 .int()
 .min(MIN_PAGE_SIZE)
 .max(MAX_PAGE_SIZE)
 .optional()
 .default(DEFAULT_PAGE_SIZE),
 cursor: z.string().min(1).optional(),
});

export type ListResourcesByVerificationStatusInput = z.infer<
 typeof listResourcesByVerificationStatusInputSchema
>;

export interface RegistryResource {
 id: string;
 name: string;
 verificationStatus: VerificationStatus;
}

export interface RegistryPage {
 items: RegistryResource[];
 nextCursor?: string | null;
}

/** Abstraction over the registry RPC so the tool can be tested without a network. */
export interface RegistryClient {
 listByVerificationStatus(params: {
 status: VerificationStatus;
 pageSize: number;
 cursor?: string;
 }): Promise<RegistryPage>;
}

export interface ListResourcesByVerificationStatusResult {
 status: VerificationStatus;
 pageSize: number;
 count: number;
 resources: RegistryResource[];
 nextCursor: string | null;
 hasMore: boolean;
}

export class RegistryRpcError extends Error {
 constructor(message: string, options?: { cause?: unknown }) {
 super(message, options);
 this.name = "RegistryRpcError";
 }
}

export async function listResourcesByVerificationStatus(
 client: RegistryClient,
 rawInput: unknown,
): Promise<ListResourcesByVerificationStatusResult> {
 const parsed = listResourcesByVerificationStatusInputSchema.safeParse(rawInput);
 if (!parsed.success) {
 throw new z.ZodError(parsed.error.issues);
 }
 const { status, pageSize, cursor } = parsed.data;

 let page: RegistryPage;
 try {
 page = await client.listByVerificationStatus({
 status,
 pageSize,
 ...(cursor !== undefined ? { cursor } : {}),
 });
 } catch (err) {
 throw new RegistryRpcError(
 `Failed to list resources with status "${status}": ${
 err instanceof Error ? err.message : String(err)
 }`,
 { cause: err },
 );
 }

 if (!page || !Array.isArray(page.items)) {
 throw new RegistryRpcError("Registry returned a malformed page: missing items");
 }

 const items = page.items;
 const nextCursor = page.nextCursor ?? null;

 return {
 status,
 pageSize,
 count: items.length,
 resources: items,
 nextCursor,
 hasMore: nextCursor !== null,
 };
}

export const listResourcesByVerificationStatusTool = {
 name: "list_resources_by_verification_status",
 description:
 "List registry resources filtered by verification status, with bounded page size and cursor-based continuation.",
 inputSchema: {
 type: "object",
 properties: {
 status: {
 type: "string",
 enum: [...VERIFICATION_STATUSES],
 description: "Verification status to filter by.",
 },
 pageSize: {
 type: "integer",
 minimum: MIN_PAGE_SIZE,
 maximum: MAX_PAGE_SIZE,
 default: DEFAULT_PAGE_SIZE,
 description: "Number of results per page.",
 },
 cursor: {
 type: "string",
 minLength: 1,
 description: "Opaque cursor returned as nextCursor from a previous call.",
 },
 },
 required: ["status"],
 additionalProperties: false,
 },
};
