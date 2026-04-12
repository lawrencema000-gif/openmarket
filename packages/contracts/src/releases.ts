import { z } from "zod";
import { uuidSchema, releaseStatusSchema, releaseChannelSchema } from "./common";

export const completeUploadSchema = z.object({
  fileSize: z.number().int().positive().max(524288000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, "Must be a valid SHA-256 hash"),
});

export type CompleteUpload = z.infer<typeof completeUploadSchema>;

export const uploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  artifactId: uuidSchema,
});

export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

export const releaseDetailResponseSchema = z.object({
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
  artifact: z.object({
    id: uuidSchema,
    fileSize: z.number(),
    sha256: z.string(),
    uploadStatus: z.string(),
  }).nullable(),
});

export type ReleaseDetailResponse = z.infer<typeof releaseDetailResponseSchema>;
