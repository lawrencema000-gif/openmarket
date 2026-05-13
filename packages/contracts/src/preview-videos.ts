import { z } from "zod";

/**
 * Wire format for P2-G preview videos. Stored on `app_preview_videos`.
 *
 * Validation philosophy:
 *   - URL must be a real URL (zod url())
 *   - we accept BOTH direct video files and YouTube/Vimeo page links;
 *     classification happens client-side in the storefront player
 *   - poster is optional — if missing, the player renders a generic
 *     placeholder until first play
 */

export const previewVideoInputSchema = z.object({
  videoUrl: z.string().url().max(2000),
  posterUrl: z.string().url().max(2000).optional(),
  label: z.string().min(1).max(120).optional(),
  durationSeconds: z.number().int().min(1).max(60 * 60).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export type PreviewVideoInput = z.infer<typeof previewVideoInputSchema>;

export const previewVideoPatchSchema = previewVideoInputSchema.partial();

/**
 * Classify a video URL for storefront rendering. Returns:
 *   - { kind: "youtube", id }   → render an iframe embed
 *   - { kind: "vimeo", id }     → render an iframe embed
 *   - { kind: "direct", url }   → render a native `<video>` element
 *
 * The function is pure + tolerant: anything that fails to parse as
 * a YouTube/Vimeo URL falls through to "direct", which is safe even
 * if the URL is unplayable — the storefront will just show a broken
 * player rather than throw.
 */
export type PreviewVideoSource =
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string }
  | { kind: "direct"; url: string };

export function classifyVideoUrl(input: string): PreviewVideoSource {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { kind: "direct", url: input };
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = parsed.searchParams.get("v");
    if (v) return { kind: "youtube", id: v };
  }
  if (host === "youtu.be") {
    const id = parsed.pathname.replace(/^\//, "").split("/")[0];
    if (id) return { kind: "youtube", id };
  }
  if (host === "youtube.com" && parsed.pathname.startsWith("/embed/")) {
    const id = parsed.pathname.replace("/embed/", "").split("/")[0];
    if (id) return { kind: "youtube", id };
  }
  if (host === "vimeo.com") {
    const id = parsed.pathname.replace(/^\//, "").split("/")[0];
    if (id && /^\d+$/.test(id)) return { kind: "vimeo", id };
  }
  if (host === "player.vimeo.com") {
    const id = parsed.pathname.replace("/video/", "").split("/")[0];
    if (id && /^\d+$/.test(id)) return { kind: "vimeo", id };
  }
  return { kind: "direct", url: input };
}
