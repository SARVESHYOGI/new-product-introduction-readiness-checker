import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { resolveAuthSecret } from "@/lib/auth/config";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * The pepper is read on every call rather than cached at import time so that a
 * misconfigured deployment fails as a classified 503 instead of crashing the
 * module graph.
 */
function pepper(): string {
  return resolveAuthSecret();
}

/**
 * Hash a password using scrypt (N=default, salt per user) with an application
 * pepper derived from AUTH_SECRET. Format: scrypt$<saltHex>$<keyHex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(`${pepper()}::${password}`, salt, KEY_LENGTH);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const key = await scrypt(`${pepper()}::${password}`, salt, KEY_LENGTH);
  const expected = Buffer.from(hashHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}