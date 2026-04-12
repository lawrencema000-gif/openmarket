import { z } from "zod";
import { releaseChannelSchema, releaseStatusSchema, uuidSchema } from "./common";

export const createAppSchema = z.object({
  packageName: z
    .string()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){1,}$/,
      "Must be a valid Android package name (e.g., com.example.myapp)"
    )
    .min(3)
    .max(255),
  title: z.string().min(2).max(100),
  shortDescription: z.string().min(10).max(80),
  fullDescription: z.string().min(20).max(4000),
  category: z.string().min(1),
  iconUrl: z.string().url(),
  screenshots: z.array(z.string().url()).min(2).max(8),
  privacyPolicyUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  sourceCodeUrl: z.string().url().optional(),
  isExperimental: z.boolean().default(false),
  containsAds: z.boolean().default(false),
  contentRating: z.enum(["everyone", "teen", "mature"]).optional(),
});

export type CreateApp = z.infer<typeof createAppSchema>;

export const createReleaseSchema = z.object({
  appId: uuidSchema,
  versionCode: z.number().int().positive(),
  versionName: z.string().min(1).max(50),
  channel: releaseChannelSchema.default("stable"),
  releaseNotes: z.string().max(5000).optional(),
});

export type CreateRelease = z.infer<typeof createReleaseSchema>;

export const appResponseSchema = z.object({
  id: uuidSchema,
  packageName: z.string(),
  developerId: uuidSchema,
  title: z.string(),
  shortDescription: z.string(),
  category: z.string(),
  iconUrl: z.string(),
  isPublished: z.boolean(),
  isExperimental: z.boolean(),
  trustTier: z.string(),
  createdAt: z.string().datetime(),
});

export type AppResponse = z.infer<typeof appResponseSchema>;

export const releaseResponseSchema = z.object({
  id: uuidSchema,
  appId: uuidSchema,
  versionCode: z.number(),
  versionName: z.string(),
  channel: releaseChannelSchema,
  status: releaseStatusSchema,
  rolloutPercentage: z.number(),
  releaseNotes: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type ReleaseResponse = z.infer<typeof releaseResponseSchema>;
