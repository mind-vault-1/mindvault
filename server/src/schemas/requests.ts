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

/** Query params for GET /resources (public catalog). */
export const catalogQuerySchema = z
  .object({
    verificationStatus: z.enum(["verified", "pending", "rejected"]).optional(),
    minPrice: z.string().regex(/^\d+(\.\d+)?$/, "must be a non-negative number").optional(),
    maxPrice: z.string().regex(/^\d+(\.\d+)?$/, "must be a non-negative number").optional(),
    search: z.string().optional(),
    resourceType: z.enum(["file", "link"]).optional(),
  })
  .strict();
