export const AUTH_CONFIGURATION_ERROR = "AUTH_CONFIGURATION_ERROR" as const;

/**
 * Raised when a required authentication secret is missing or unusable.
 *
 * This is a deployment/configuration fault, not a caller error, so it is
 * surfaced to clients as a 503 with a stable code rather than a 500. The
 * underlying value is never included in the message or in logs.
 */
export class AuthConfigurationError extends Error {
  readonly code = AUTH_CONFIGURATION_ERROR;

  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

/** Resolve the password pepper without ever echoing its value. */
export function resolveAuthSecret(environment: Record<string, string | undefined> = process.env): string {
  const value = environment.AUTH_SECRET;
  if (!value || value.trim().length === 0) {
    throw new AuthConfigurationError(
      "AUTH_SECRET is not configured. Set it to a random 32-byte hex string."
    );
  }
  return value;
}
