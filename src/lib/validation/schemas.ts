import { z } from "zod";
import { ApiError } from "@/lib/errors";

/**
 * Central Zod schemas for every write endpoint.
 * Backend validation is mandatory and never trusts the frontend.
 *
 * Every write schema is `.strict()`: an unknown key is a 400, never silently
 * stripped. That keeps the API honest about the contract it accepts instead of
 * dropping fields the caller believed were applied (which is how prototype
 * pollution and "it worked in the UI" drift creep in).
 */

const id = z.string().trim().min(1).max(64);
const optionalId = id.optional().nullable();

export const readinessCheckInputSchema = z
  .object({
    productId: id,
    bomVersionId: id,
    routingId: id,
    lineId: id,
  })
  .strict();

export type ReadinessCheckInput = z.infer<typeof readinessCheckInputSchema>;

export const productCreateSchema = z
  .object({
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).default("DRAFT"),
  })
  .strict();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const loginSchema = z
  .object({
    email: z.email(),
    password: z.string().min(1).max(200),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Shared field primitives
//
// Kept deliberately strict: a readiness check compares these values against
// production reality, so "  " or a negative quantity must be rejected at the
// boundary rather than surfacing later as a confusing rule failure.
// ---------------------------------------------------------------------------

/** A short human-facing code (SKU, station code, line code, prefix…). */
const code = z
  .string()
  .trim()
  .min(1, "Required.")
  .max(64, "Must be 64 characters or fewer.")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/ ]*$/, "Use letters, digits, space, . - _ / only.");

/** A version label such as "3" or "2.1". */
const version = z.string().trim().min(1, "Required.").max(32, "Must be 32 characters or fewer.");

const name = z.string().trim().min(1, "Required.").max(200, "Must be 200 characters or fewer.");

/**
 * ISO-8601 date, either a plain `YYYY-MM-DD` calendar date or a full instant.
 *
 * Deliberately stricter than `Date.parse`, which happily accepts "March 2027"
 * or "01/02/2027" — locale-dependent guesses that later render as garbage in
 * the editor and are meaningless as an assignment window.
 */
const isoDate = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(v), {
    message: "Use YYYY-MM-DD or an ISO-8601 timestamp.",
  })
  .refine((v) => !Number.isNaN(Date.parse(v)), "Must be a valid date.")
  .transform((v) => new Date(v));

/**
 * The end of an assignment window.
 *
 * Windows are inclusive on both ends, so a date-only `validTo` means "valid
 * through the end of that day". Widening it here — once, at the boundary —
 * keeps the stored value, the readiness rule and the editor's rendering in
 * agreement, instead of silently excluding the final day.
 */
const isoEndOfDay = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(v), {
    message: "Use YYYY-MM-DD or an ISO-8601 timestamp.",
  })
  .refine((v) => !Number.isNaN(Date.parse(v)), "Must be a valid date.")
  .transform((v) => {
    const date = new Date(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  });

const optionalIsoDate = isoDate.optional().nullable();

/** Positive quantity with up to 4 decimal places (matches Decimal(12,4)). */
const quantity = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : Number(v)))
  .refine((n) => Number.isFinite(n), "Must be a number.")
  .refine((n) => n > 0, "Must be greater than zero.");

/** A free-text capability token, e.g. "solder-paste". */
const capability = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9\-_]*$/i, "Use letters, digits, - and _ only.");

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const productUpdateSchema = z
  .object({
    name: name.optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

// ---------------------------------------------------------------------------
// BOM versions & items
// ---------------------------------------------------------------------------

export const bomVersionCreateSchema = z
  .object({
    version,
    status: z.enum(["DRAFT", "ACTIVE", "OBSOLETE"]).default("DRAFT"),
    effectiveFrom: optionalIsoDate,
    effectiveTo: optionalIsoDate,
  })
  .strict();

export type BomVersionCreateInput = z.infer<typeof bomVersionCreateSchema>;

export const bomVersionUpdateSchema = z
  .object({
    status: z.enum(["DRAFT", "ACTIVE", "OBSOLETE"]).optional(),
    effectiveFrom: optionalIsoDate,
    effectiveTo: optionalIsoDate,
  })
  .strict();

export type BomVersionUpdateInput = z.infer<typeof bomVersionUpdateSchema>;

export const bomItemCreateSchema = z
  .object({
    componentSku: code,
    componentName: name,
    quantity,
    unit: z.string().trim().min(1, "Required.").max(32),
    isRequired: z.boolean().default(true),
  })
  .strict();

export type BomItemCreateInput = z.infer<typeof bomItemCreateSchema>;

export const bomItemUpdateSchema = z
  .object({
    componentName: name.optional(),
    quantity: quantity.optional(),
    unit: z.string().trim().min(1).max(32).optional(),
    isRequired: z.boolean().optional(),
  })
  .strict();

export type BomItemUpdateInput = z.infer<typeof bomItemUpdateSchema>;

// ---------------------------------------------------------------------------
// Routing & operations
// ---------------------------------------------------------------------------

export const routingCreateSchema = z
  .object({
    code,
    version,
    status: z.enum(["DRAFT", "ACTIVE", "OBSOLETE"]).default("DRAFT"),
  })
  .strict();

export type RoutingCreateInput = z.infer<typeof routingCreateSchema>;

export const routingUpdateSchema = z
  .object({
    version: version.optional(),
    status: z.enum(["DRAFT", "ACTIVE", "OBSOLETE"]).optional(),
  })
  .strict();

export type RoutingUpdateInput = z.infer<typeof routingUpdateSchema>;

export const routingOperationCreateSchema = z
  .object({
    sequence: z
      .number({ message: "Sequence must be a number." })
      .int("Sequence must be a whole number.")
      .min(1, "Sequence must be 1 or greater.")
      .max(999_999, "Sequence is too large."),
    operationCode: code,
    operationName: name,
    standardCycleTimeSeconds: z
      .number()
      .int()
      .min(0, "Cycle time cannot be negative.")
      .max(86_400, "Cycle time must be under 24 hours.")
      .optional()
      .nullable(),
    required: z.boolean().default(true),
    stationId: optionalId,
  })
  .strict();

export type RoutingOperationCreateInput = z.infer<typeof routingOperationCreateSchema>;

export const routingOperationUpdateSchema = z
  .object({
    operationCode: code.optional(),
    operationName: name.optional(),
    standardCycleTimeSeconds: z
      .number()
      .int()
      .min(0, "Cycle time cannot be negative.")
      .max(86_400)
      .optional()
      .nullable(),
    required: z.boolean().optional(),
    stationId: optionalId,
  })
  .strict();

export type RoutingOperationUpdateInput = z.infer<typeof routingOperationUpdateSchema>;

// ---------------------------------------------------------------------------
// Work instructions
// ---------------------------------------------------------------------------

export const workInstructionCreateSchema = z
  .object({
    title: name,
    content: z
      .string()
      .trim()
      .min(1, "Content is required.")
      .max(20_000, "Content must be 20,000 characters or fewer."),
    // A version is created as a draft or published immediately. OBSOLETE is not a
    // creation state — it only ever results from superseding a published version.
    status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
    required: z.boolean().default(true),
  })
  .strict();

export type WorkInstructionCreateInput = z.infer<typeof workInstructionCreateSchema>;

export const workInstructionUpdateSchema = z
  .object({
    title: name.optional(),
    content: z
      .string()
      .trim()
      .min(1, "Content is required.")
      .max(20_000)
      .optional(),
    status: z.enum(["DRAFT", "ACTIVE", "OBSOLETE"]).optional(),
    required: z.boolean().optional(),
  })
  .strict();

export type WorkInstructionUpdateInput = z.infer<typeof workInstructionUpdateSchema>;

// ---------------------------------------------------------------------------
// Lines & stations
// ---------------------------------------------------------------------------

export const lineCreateSchema = z
  .object({
    code,
    name,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

export type LineCreateInput = z.infer<typeof lineCreateSchema>;

export const lineUpdateSchema = z
  .object({
    name: name.optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();

export type LineUpdateInput = z.infer<typeof lineUpdateSchema>;

export const stationCreateSchema = z
  .object({
    code,
    name,
    status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).default("ACTIVE"),
    lineId: optionalId,
    capabilities: z.array(capability).max(50, "Too many capabilities.").default([]),
  })
  .strict();

export type StationCreateInput = z.infer<typeof stationCreateSchema>;

export const stationUpdateSchema = z
  .object({
    name: name.optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
    lineId: optionalId,
    capabilities: z.array(capability).max(50).optional(),
  })
  .strict();

export type StationUpdateInput = z.infer<typeof stationUpdateSchema>;

// ---------------------------------------------------------------------------
// Operators & assignments
// ---------------------------------------------------------------------------

export const operatorCreateSchema = z
  .object({
    employeeCode: code,
    name,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

export type OperatorCreateInput = z.infer<typeof operatorCreateSchema>;

export const operatorUpdateSchema = z
  .object({
    name: name.optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();

export type OperatorUpdateInput = z.infer<typeof operatorUpdateSchema>;

/**
 * A new assignment window. `status` is intentionally not part of the create
 * payload: a window is created active, and a window that must stop applying is
 * revoked through PATCH. Creating a row that is born EXPIRED or REVOKED would
 * only add noise the readiness engine has to explain away.
 */
export const assignmentCreateSchema = z
  .object({
    stationId: id,
    validFrom: isoDate,
    validTo: isoEndOfDay,
  })
  .strict();

export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;

/** Revoke or re-date an existing window. EXPIRED is derived from `validTo`. */
export const assignmentUpdateSchema = z
  .object({
    validFrom: isoDate.optional(),
    validTo: isoEndOfDay.optional(),
    status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: "Provide at least one field to change.",
  });

export type AssignmentUpdateInput = z.infer<typeof assignmentUpdateSchema>;

// ---------------------------------------------------------------------------
// Identifier ranges
// ---------------------------------------------------------------------------

export const identifierRangeCreateSchema = z
  .object({
    prefix: code,
    startNumber: z.number().int().min(0, "Cannot be negative."),
    endNumber: z.number().int().min(0, "Cannot be negative."),
    currentNumber: z.number().int().min(0, "Cannot be negative."),
    status: z.enum(["ACTIVE", "INACTIVE", "EXHAUSTED"]).default("ACTIVE"),
  })
  .strict()
  .refine((v) => v.startNumber < v.endNumber, {
    message: "Start number must be lower than the end number.",
    path: ["endNumber"],
  });

export type IdentifierRangeCreateInput = z.infer<typeof identifierRangeCreateSchema>;

export const identifierRangeUpdateSchema = z
  .object({
    prefix: code.optional(),
    startNumber: z.number().int().min(0).optional(),
    endNumber: z.number().int().min(0).optional(),
    currentNumber: z.number().int().min(0).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "EXHAUSTED"]).optional(),
  })
  .strict()
  .refine((v) => v.startNumber === undefined || v.endNumber === undefined || v.startNumber < v.endNumber, {
    message: "Start number must be lower than the end number.",
    path: ["endNumber"],
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: "Provide at least one field to change.",
  });

export type IdentifierRangeUpdateInput = z.infer<typeof identifierRangeUpdateSchema>;

// ---------------------------------------------------------------------------
// Inventory items & output mappings
// ---------------------------------------------------------------------------

export const inventoryItemCreateSchema = z
  .object({
    sku: code,
    name,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

export type InventoryItemCreateInput = z.infer<typeof inventoryItemCreateSchema>;

export const inventoryItemUpdateSchema = z
  .object({
    name: name.optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();

export type InventoryItemUpdateInput = z.infer<typeof inventoryItemUpdateSchema>;

export const inventoryMappingCreateSchema = z
  .object({
    inventoryItemId: id,
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

export type InventoryMappingCreateInput = z.infer<typeof inventoryMappingCreateSchema>;

export const inventoryMappingUpdateSchema = z
  .object({
    inventoryItemId: id.optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();

export type InventoryMappingUpdateInput = z.infer<typeof inventoryMappingUpdateSchema>;

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