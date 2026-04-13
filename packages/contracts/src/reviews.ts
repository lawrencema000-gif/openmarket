import { z } from "zod";
import { uuidSchema } from "./common";

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
  versionCodeReviewed: z.number().int().positive(),
});

export type CreateReview = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
});

export type UpdateReview = z.infer<typeof updateReviewSchema>;
