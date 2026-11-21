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
  items: RegistryResource[] | null | undefined;
  nextCursor?: string | null;
}

/**
 * Minimal RPC contract the tool depends on. The concrete client is injected
 * so the tool stays transport-agnostic and testable.
 */
export interface RegistryRpcClient {
  listResources(params: {
    status: VerificationStatus;
    pageSize: number;
    cursor?: string;
  }): Promise<RegistryPage>;
}

export type ListResourcesByVerificationStatusOutput =
  | {
      ok: true;
      status: VerificationStatus;
      items: RegistryResource[];
      nextCursor: string | null;
    }
  | {
      ok: false;
      error: {
        code: "INVALID_INPUT" | "RPC_ERROR" | "INVALID_RESPONSE";
        message: string;
      };
    };

export const LIST_RESOURCES_BY_VERIFICATION_STATUS_TOOL = {
  name: "list_resources_by_verification_status",
  description:
    "List registry resources filtered by verification status. Results are bounded by pageSize (1-100) and paginated with an opaque cursor returned as nextCursor.",
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
        description: "Maximum number of items to return.",
      },
      cursor: {
        type: "string",
        minLength: 1,
        description: "Opaque cursor from a previous response's nextCursor.",
      },
    },
    required: ["status"],
    additionalProperties: false,
  },
} as const;

export async function listResourcesByVerificationStatus(
  rawInput: unknown,
  client: RegistryRpcClient,
): Promise<ListResourcesByVerificationStatusOutput> {
  const parsed = listResourcesByVerificationStatusInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "),
      },
    };
  }

  const { status, pageSize, cursor } = parsed.data;

  let page: RegistryPage;
  try {
    page = await client.listResources({
      status,
      pageSize,
      ...(cursor !== undefined ? { cursor } : {}),
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "RPC_ERROR",
        message: err instanceof Error ? err.message : "Registry RPC call failed",
      },
    };
  }

  if (page === null || typeof page !== "object" || !Array.isArray(page.items)) {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: "Registry response is missing an items array",
      },
    };
  }

  return {
    ok: true,
    status,
    items: page.items.slice(0, pageSize),
    nextCursor: page.nextCursor ?? null,
  };
}
