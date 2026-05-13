import { z } from "zod";

/**
 * Pre-registration wire format (P3-A).
 *
 * One per-user join. The channel selection is captured on submit
 * (defaulting to "both") rather than reading the user's notification
 * preferences live, so an explicit push opt-in at pre-register time
 * is still honored even if the user later flips push off globally.
 */
export const preRegistrationChannelSchema = z.enum(["push", "email", "both"]);
export type PreRegistrationChannel = z.infer<
  typeof preRegistrationChannelSchema
>;

export const preRegistrationInputSchema = z.object({
  channel: preRegistrationChannelSchema.default("both"),
});

export type PreRegistrationInput = z.infer<typeof preRegistrationInputSchema>;

export const preRegistrationStatusSchema = z.object({
  appId: z.string().uuid(),
  enabled: z.boolean(),
  registered: z.boolean(),
  registeredCount: z.number().int().nonnegative(),
});

export type PreRegistrationStatus = z.infer<
  typeof preRegistrationStatusSchema
>;
