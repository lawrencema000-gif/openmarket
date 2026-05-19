import { z } from "zod";

/**
 * Enterprise / private store (P4-I) contracts.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const ORG_ROLES = ["owner", "admin", "approver", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_POLICY_MODES = [
  "allowlist_only",
  "blocklist",
  "trusted_publishers",
] as const;
export type OrgPolicyMode = (typeof ORG_POLICY_MODES)[number];

export const enterpriseOrgCreateSchema = z.object({
  slug: z.string().regex(SLUG, "invalid slug shape"),
  displayName: z.string().min(2).max(80),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(HEX_COLOR).optional(),
  supportEmail: z.string().email().optional(),
  policyMode: z.enum(ORG_POLICY_MODES).default("allowlist_only"),
  requirePrivateNetwork: z.boolean().default(false),
});
export type EnterpriseOrgCreate = z.infer<typeof enterpriseOrgCreateSchema>;

export const enterpriseOrgPatchSchema = enterpriseOrgCreateSchema
  .partial()
  .omit({ slug: true });
export type EnterpriseOrgPatch = z.infer<typeof enterpriseOrgPatchSchema>;

export const enterpriseMemberInviteSchema = z.object({
  userEmail: z.string().email(),
  role: z.enum(ORG_ROLES).default("member"),
  externalId: z.string().max(80).optional(),
});
export type EnterpriseMemberInvite = z.infer<
  typeof enterpriseMemberInviteSchema
>;

export const enterpriseAllowlistAddSchema = z.object({
  appId: z.string().uuid(),
  autoApprove: z.boolean().default(true),
});
export type EnterpriseAllowlistAdd = z.infer<
  typeof enterpriseAllowlistAddSchema
>;

export const enterpriseCohortCreateSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(280).optional(),
  selfServe: z.boolean().default(false),
});
export type EnterpriseCohortCreate = z.infer<
  typeof enterpriseCohortCreateSchema
>;

export const enterpriseCohortPinSchema = z.object({
  appId: z.string().uuid(),
  required: z.boolean().default(false),
});
export type EnterpriseCohortPin = z.infer<typeof enterpriseCohortPinSchema>;

export const enterpriseEnrollmentTokenCreateSchema = z.object({
  cohortId: z.string().uuid().optional(),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(48),
  maxUses: z.number().int().min(1).max(10_000).optional(),
});
export type EnterpriseEnrollmentTokenCreate = z.infer<
  typeof enterpriseEnrollmentTokenCreateSchema
>;

export const enterpriseEnrollmentConsumeSchema = z.object({
  token: z.string().min(20).max(200),
  /** Stable per-device identifier the MDM agent generates. */
  deviceId: z.string().min(3).max(128),
});
export type EnterpriseEnrollmentConsume = z.infer<
  typeof enterpriseEnrollmentConsumeSchema
>;
