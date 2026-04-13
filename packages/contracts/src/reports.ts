import { z } from "zod";
import { uuidSchema } from "./common";

export const createReportSchema = z.object({
  targetType: z.enum(["app", "release", "developer", "review"]),
  targetId: uuidSchema,
  reportType: z.enum(["malware", "scam", "impersonation", "illegal", "spam", "broken", "other"]),
  description: z.string().min(10).max(2000),
});

export type CreateReport = z.infer<typeof createReportSchema>;

export const updateReportStatusSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "dismissed"]),
  resolutionNotes: z.string().max(2000).optional(),
});

export type UpdateReportStatus = z.infer<typeof updateReportStatusSchema>;
