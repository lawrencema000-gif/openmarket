import { z } from "zod";

/**
 * Family-sharing contracts (P3-E).
 *
 * Caps:
 *   - MAX_FAMILY_MEMBERS = 5 (includes the owner)
 *   - INVITE_EXPIRY_MS = 7 days
 *
 * These are enforced in the API. They're surfaced here so any future
 * SDK / dev-portal can pre-validate without an API round trip.
 */
export const MAX_FAMILY_MEMBERS = 5;
export const FAMILY_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export const createFamilyGroupSchema = z.object({
  name: z.string().min(1).max(80).optional(),
});

export type CreateFamilyGroupInput = z.infer<typeof createFamilyGroupSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(8).max(200),
});

export const familySharingPatchSchema = z.object({
  enabled: z.boolean(),
});
