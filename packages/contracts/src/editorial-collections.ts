import { z } from "zod";

/**
 * Editorial collections (P2-C) — Zod contracts shared by the admin editor and
 * the API route. Mirrors the categories contract shape (slug regex + length
 * caps) plus the curation-specific fields (rationale, curatorName) and a
 * publish toggle. Collection membership is managed via the app add/remove/
 * reorder schemas.
 */

export const collectionSlugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens only");

export const createCollectionSchema = z.object({
  slug: collectionSlugSchema,
  title: z.string().min(1).max(100),
  blurb: z.string().max(200).optional(),
  rationale: z.string().max(2000).optional(),
  curatorName: z.string().max(80).optional(),
  icon: z.string().max(8).optional(),
  position: z.number().int().min(0).optional(),
  isPublished: z.boolean().optional(),
});

// Everything but the slug is editable after creation (slug is the stable
// public URL, like categories).
export const updateCollectionSchema = createCollectionSchema.partial().omit({
  slug: true,
});

export const reorderCollectionsSchema = z.object({
  positions: z
    .array(
      z.object({
        slug: z.string().min(1),
        position: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
});

export const addCollectionAppSchema = z.object({
  appId: z.string().uuid(),
  note: z.string().max(280).optional(),
});

export const reorderCollectionAppsSchema = z.object({
  items: z
    .array(
      z.object({
        appId: z.string().uuid(),
        position: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type AddCollectionAppInput = z.infer<typeof addCollectionAppSchema>;
