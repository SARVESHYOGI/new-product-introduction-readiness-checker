import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;

function pepper(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error("AUTH_SECRET is not configured. Copy .env.example to .env and set AUTH_SECRET.");
  }
  return value;
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