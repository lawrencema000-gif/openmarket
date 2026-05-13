import { describe, it, expect } from "vitest";
import {
  classifyVideoUrl,
  previewVideoInputSchema,
} from "../preview-videos";

describe("classifyVideoUrl", () => {
  it("recognizes the standard youtube watch URL", () => {
    const s = classifyVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(s.kind).toBe("youtube");
    if (s.kind === "youtube") expect(s.id).toBe("dQw4w9WgXcQ");
  });

  it("recognizes the youtu.be short URL", () => {
    const s = classifyVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(s.kind).toBe("youtube");
    if (s.kind === "youtube") expect(s.id).toBe("dQw4w9WgXcQ");
  });

  it("recognizes the youtube embed URL", () => {
    const s = classifyVideoUrl(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0",
    );
    expect(s.kind).toBe("youtube");
    if (s.kind === "youtube") expect(s.id).toBe("dQw4w9WgXcQ");
  });

  it("recognizes a vimeo page URL", () => {
    const s = classifyVideoUrl("https://vimeo.com/76979871");
    expect(s.kind).toBe("vimeo");
    if (s.kind === "vimeo") expect(s.id).toBe("76979871");
  });

  it("recognizes the vimeo player URL", () => {
    const s = classifyVideoUrl("https://player.vimeo.com/video/76979871");
    expect(s.kind).toBe("vimeo");
    if (s.kind === "vimeo") expect(s.id).toBe("76979871");
  });

  it("falls back to direct for unknown hosts", () => {
    const s = classifyVideoUrl("https://cdn.example.com/trailer.mp4");
    expect(s.kind).toBe("direct");
  });

  it("falls back to direct for malformed URLs", () => {
    const s = classifyVideoUrl("not even a url");
    expect(s.kind).toBe("direct");
  });
});

describe("previewVideoInputSchema", () => {
  it("requires videoUrl", () => {
    expect(() => previewVideoInputSchema.parse({})).toThrow();
  });

  it("accepts the minimal valid shape", () => {
    const parsed = previewVideoInputSchema.parse({
      videoUrl: "https://youtu.be/abc123",
    });
    expect(parsed.videoUrl).toBe("https://youtu.be/abc123");
  });

  it("rejects an absurd duration", () => {
    expect(() =>
      previewVideoInputSchema.parse({
        videoUrl: "https://youtu.be/abc123",
        durationSeconds: 60 * 60 * 24,
      }),
    ).toThrow();
  });

  it("accepts a full body", () => {
    const parsed = previewVideoInputSchema.parse({
      videoUrl: "https://cdn.example.com/trailer.mp4",
      posterUrl: "https://cdn.example.com/poster.png",
      label: "Gameplay trailer",
      durationSeconds: 45,
      sortOrder: 1,
    });
    expect(parsed.label).toBe("Gameplay trailer");
  });
});
