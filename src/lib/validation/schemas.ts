import { z } from "zod";
import { ApiError } from "@/lib/errors";

/**
 * Central Zod schemas for every write endpoint.
 * Backend validation is mandatory and never trusts the frontend.
 */

const id = z.string().trim().min(1).max(64);
const optionalId = id.optional().nullable();

export const readinessCheckInputSchema = z.object({
  productId: id,
  bomVersionId: id,
  routingId: id,
  lineId: id,
});

export type ReadinessCheckInput = z.infer<typeof readinessCheckInputSchema>;

export const productCreateSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).default("DRAFT"),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Parse with a Zod schema and translate failures into a consistent 400 API
 * error with machine-readable details.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw ApiError.badRequest(
      "VALIDATION_ERROR",
      "Request validation failed.",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))
    );
  }
  return result.data;
}

export { optionalId };