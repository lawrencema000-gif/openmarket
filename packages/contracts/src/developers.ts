import { z } from "zod";
import { trustLevelSchema, uuidSchema } from "./common";

export const createDeveloperProfileSchema = z.object({
  displayName: z.string().min(2).max(100),
  legalEntityName: z.string().max(200).optional(),
  country: z.string().min(2).max(100).optional(),
  supportEmail: z.string().email().optional(),
  supportUrl: z.string().url().optional(),
  privacyPolicyUrl: z.string().url().optional(),
});

export type CreateDeveloperProfile = z.infer<typeof createDeveloperProfileSchema>;

export const updateDeveloperProfileSchema = createDeveloperProfileSchema.partial();

export type UpdateDeveloperProfile = z.infer<typeof updateDeveloperProfileSchema>;

export const developerResponseSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  legalEntityName: z.string().nullable(),
  country: z.string().nullable(),
  supportEmail: z.string().nullable(),
  supportUrl: z.string().nullable(),
  privacyPolicyUrl: z.string().nullable(),
  trustLevel: trustLevelSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type DeveloperResponse = z.infer<typeof developerResponseSchema>;

export const enrollSigningKeySchema = z.object({
  fingerprintSha256: z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/, "Must be a valid SHA-256 hex string"),
  algorithm: z.enum(["RSA", "EC", "DSA"]),
  certificatePem: z.string().optional(),
  keySize: z.number().int().positive().optional(),
});

export type EnrollSigningKey = z.infer<typeof enrollSigningKeySchema>;

export const signingKeyResponseSchema = z.object({
  id: uuidSchema,
  fingerprintSha256: z.string(),
  algorithm: z.string(),
  keySize: z.number().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});

export type SigningKeyResponse = z.infer<typeof signingKeyResponseSchema>;
