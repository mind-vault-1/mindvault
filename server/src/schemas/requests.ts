import { z } from "zod/v4";

export const publisherRegisterSchema = z
  .object({
    name: z.string().min(1),
    email: z.email(),
    walletAddress: z.string().min(1),
  })
  .strict();

export const linkPublishSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    price: z.string().min(1),
    walletAddress: z.string().optional(),
    externalUrl: z.url(),
  })
  .strict();

export const filePublishBodySchema = z
  .object({
    title: z.string().min(1),
    price: z.string().min(1),
    description: z.string().optional(),
    walletAddress: z.string().optional(),
  })
  .strict();

export const verifyContentSchema = z
  .object({
    content: z.string().min(1),
    resourceId: z.string().min(1).optional(),
  })
  .strict();

export const registerResourceSchema = z
  .object({
    signedXdr: z.string().min(1).optional(),
  })
  .strict();

export const preparePriceSchema = z
  .object({
    price: z.string().min(1),
  })
  .strict();

export const setPriceSchema = z
  .object({
    signedXdr: z.string().min(1),
    price: z.string().min(1),
  })
  .strict();

export const prepareOwnershipSchema = z
  .object({
    newCreator: z.string().min(1),
  })
  .strict();

export const transferOwnershipSchema = z
  .object({
    signedXdr: z.string().min(1),
    newCreator: z.string().min(1),
  })
  .strict();

/** Sort values supported by GET /resources (#163). */
export const catalogSortValues = ["newest", "price_asc", "price_desc", "title"] as const;

export const CATALOG_DEFAULT_LIMIT = 20;
export const CATALOG_MAX_LIMIT = 100;

/** Query params for GET /resources (public catalog). */
export const catalogQuerySchema = z
  .object({
    verificationStatus: z.enum(["verified", "pending", "rejected"]).optional(),
    minPrice: z
      .string()
      .regex(/^\d+(\.\d+)?$/, "must be a non-negative number")
      .optional(),
    maxPrice: z
      .string()
      .regex(/^\d+(\.\d+)?$/, "must be a non-negative number")
      .optional(),
    search: z.string().optional(),
    resourceType: z.enum(["file", "link"]).optional(),
    owner: z.string().optional(),
    sort: z.enum(catalogSortValues).optional(),
    limit: z.coerce.number().int().min(1).max(CATALOG_MAX_LIMIT).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return parseFloat(data.minPrice) <= parseFloat(data.maxPrice);
      }
      return true;
    },
    {
      message: "minPrice cannot be greater than maxPrice",
      path: ["minPrice"],
    },
  );
