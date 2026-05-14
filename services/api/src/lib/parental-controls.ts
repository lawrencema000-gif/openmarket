import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { parentalControls } from "@openmarket/db/schema";
import { db } from "./db";

/**
 * Scrypt parameters. Default N=16384 maps to ~50-100ms per attempt
 * on a modern CPU — slow enough to make brute-force on a 4-digit
 * PIN tolerable (16-17 min worst case for the full 10k namespace)
 * without making the legitimate verify path feel sluggish.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(pin, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return { hash: derived.toString("hex"), salt };
}

export function verifyPin(
  pin: string,
  expectedHashHex: string,
  saltHex: string,
): boolean {
  const candidate = scryptSync(pin, saltHex, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const expected = Buffer.from(expectedHashHex, "hex");
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(candidate, expected);
}

/**
 * Generate a parental-link token for the invite flow. Returned to
 * the parent after they POST /invites; they hand it to the child
 * (typically via in-person setup or family chat).
 */
export function generateLinkToken(): string {
  return `om_link_${randomBytes(24).toString("hex")}`;
}

/**
 * Find-or-create the parental_controls row for a user. Returns the
 * existing row when present so callers can read flags without first
 * checking presence.
 */
export async function getOrCreateControlsRow(
  userId: string,
  role: "parent" | "child",
) {
  const existing = await db.query.parentalControls.findFirst({
    where: eq(parentalControls.userId, userId),
  });
  if (existing) return existing;
  const [row] = await db
    .insert(parentalControls)
    .values({ userId, role })
    .returning();
  return row!;
}

/** PIN lockout policy — 5 wrong PINs locks for 5 minutes. */
export const PIN_LOCKOUT_THRESHOLD = 5;
export const PIN_LOCKOUT_DURATION_MS = 5 * 60 * 1000;
