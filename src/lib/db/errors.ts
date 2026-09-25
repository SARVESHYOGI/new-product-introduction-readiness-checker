/**
 * Translate Prisma write errors into the app's error model.
 *
 * The configuration editor writes against a schema with a lot of UNIQUE and
 * FOREIGN KEY constraints (Safety Rule 6). Those constraints are the last line
 * of defence, but a raw Prisma error surfacing as a 500 would be a terrible
 * experience for an engineer filling in a form: the honest answer is "that
 * value is already taken", not "internal error".
 *
 * We duck-type on the `code` property instead of importing Prisma's error
 * classes: the generated runtime classes live in `generated/prisma/internal`,
 * which is not a public import surface, and this keeps the mapper trivially
 * unit-testable without a Prisma runtime.
 */
import { ApiError } from "@/lib/errors";

interface PrismaLikeError {
  code?: string;
}

/**
 * Convert a Prisma error into an ApiError, or return it unchanged when it is
 * not a recognised constraint failure (so genuine bugs still surface as 500s).
 */
export function mapPrismaError(err: unknown, context: string): unknown {
  if (err instanceof ApiError) return err;
  if (typeof err !== "object" || err === null) return err;

  const e = err as PrismaLikeError;

  switch (e.code) {
    case "P2002": {
      // Constraint names are internal schema detail, so they are not echoed back
      // to the user; the endpoint context is enough to act on.
      return ApiError.conflict(
        "DUPLICATE_VALUE",
        `That ${context} already exists. Change the value and try again.`
      );
    }
    case "P2003":
      return ApiError.conflict(
        "REFERENCED_RECORD_MISSING",
        "A record this change depends on does not exist."
      );
    case "P2025":
      return ApiError.notFound("NOT_FOUND", `The ${context} was not found.`);
    case "P2014":
      return ApiError.badRequest(
        "INVALID_RELATION",
        "A required related record is missing or invalid."
      );
    default:
      return err;
  }
}

/**
 * Run a write, translating constraint violations into API errors.
 * Keeps every service method down to a single try/catch instead of one per call.
 */
export async function withMappedErrors<T>(context: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw mapPrismaError(err, context);
  }
}
