import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  });

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const trustLevels = ["experimental", "verified", "audited", "suspended"] as const;
export const trustLevelSchema = z.enum(trustLevels);
export type TrustLevel = z.infer<typeof trustLevelSchema>;

export const releaseStatuses = [
  "draft", "scanning", "review", "staged_rollout",
  "published", "paused", "rolled_back", "delisted",
] as const;
export const releaseStatusSchema = z.enum(releaseStatuses);

export const releaseChannels = ["stable", "beta", "canary"] as const;
export const releaseChannelSchema = z.enum(releaseChannels);

export const uuidSchema = z.string().uuid();
