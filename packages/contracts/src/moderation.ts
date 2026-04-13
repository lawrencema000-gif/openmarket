import { z } from "zod";

export const rejectReleaseSchema = z.object({
  reason: z.string().min(5).max(1000),
});

export type RejectRelease = z.infer<typeof rejectReleaseSchema>;

export const suspendDeveloperSchema = z.object({
  reason: z.string().min(5).max(1000),
});

export type SuspendDeveloper = z.infer<typeof suspendDeveloperSchema>;
