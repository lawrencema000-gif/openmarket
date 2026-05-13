"use client";

import { useState } from "react";
import {
  classifyVideoUrl,
  type PreviewVideoSource,
} from "@openmarket/contracts/preview-videos";

interface PreviewVideo {
  id: string;
  videoUrl: string;
  posterUrl: string | null;
  label: string | null;
  durationSeconds: number | null;
}

interface PreviewVideosRailProps {
  videos: PreviewVideo[];
}

/**
 * Storefront preview-video carousel. Renders horizontally above the
 * screenshot rail when one or more preview videos exist on the app.
 *
 * URL classification is shared with the API + dev-portal via
 * `classifyVideoUrl` in @openmarket/contracts — keeps the
 * youtube/vimeo/direct switch consistent across surfaces.
 *
 * Playback model:
 *   - direct videos use native `<video controls>` with the poster
 *     as a click-to-play target
 *   - youtube/vimeo use a click-to-load iframe — we don't auto-
 *     embed because the iframe drags in 3rd-party trackers we'd
 *     rather defer until the user actually wants to watch
 */
export function PreviewVideosRail({ videos }: PreviewVideosRailProps) {
  if (videos.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Preview {videos.length === 1 ? "video" : "videos"}
      </h2>
      <div
        className="relative"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 40px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black 20px, black calc(100% - 40px), transparent 100%)",
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory">
          {videos.map((v) => (
            <PreviewVideoCard key={v.id} video={v} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewVideoCard({ video }: { video: PreviewVideo }) {
  const [active, setActive] = useState(false);
  const source = classifyVideoUrl(video.videoUrl);

  return (
    <figure className="shrink-0 snap-start w-[300px] sm:w-[360px] rounded-xl border border-gray-200 bg-black overflow-hidden">
      <div className="aspect-video relative">
        {active ? (
          <Player source={source} poster={video.posterUrl ?? undefined} />
        ) : (
          <button
            type="button"
            onClick={() => setActive(true)}
            className="group block w-full h-full relative"
            aria-label={video.label ? `Play ${video.label}` : "Play preview"}
          >
            {video.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.posterUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
              <svg
                className="w-14 h-14 text-white drop-shadow-lg"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            {video.durationSeconds ? (
              <span className="absolute bottom-2 right-2 text-[11px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">
                {formatDuration(video.durationSeconds)}
              </span>
            ) : null}
          </button>
        )}
      </div>
      {video.label ? (
        <figcaption className="px-3 py-2 text-xs text-gray-200 bg-gray-900">
          {video.label}
        </figcaption>
      ) : null}
    </figure>
  );
}

function Player({
  source,
  poster,
}: {
  source: PreviewVideoSource;
  poster?: string;
}) {
  if (source.kind === "youtube") {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${source.id}?autoplay=1`}
        title="Preview video"
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (source.kind === "vimeo") {
    return (
      <iframe
        src={`https://player.vimeo.com/video/${source.id}?autoplay=1`}
        title="Preview video"
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <video
      src={source.url}
      controls
      autoPlay
      poster={poster}
      className="w-full h-full"
    />
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
