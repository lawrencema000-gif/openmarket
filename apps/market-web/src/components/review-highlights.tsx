import { ApiError, apiFetch } from "@/lib/api";

interface HighlightTerm {
  term: string;
  mentions: number;
}

interface HighlightsResponse {
  appId: string;
  positives: HighlightTerm[];
  negatives: HighlightTerm[];
  reviewsConsidered: number;
  computedAt: string;
}

async function getHighlights(appId: string): Promise<HighlightsResponse | null> {
  try {
    return await apiFetch<HighlightsResponse>(
      `/api/apps/${appId}/review-highlights`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound) return null;
    return null;
  }
}

/**
 * Storefront "What users love / dislike" chips (P3-D).
 *
 * Server-rendered — single fetch per page render. Renders nothing
 * when:
 *   - no published reviews yet (helper returns empty arrays)
 *   - too few mentions to clear the MIN_MENTIONS threshold
 *
 * Chips are pure data — no opaque ML. The label below the rail
 * tells users where the numbers came from so the surface stays
 * transparent.
 */
export async function ReviewHighlights({ appId }: { appId: string }) {
  const data = await getHighlights(appId);
  if (!data) return null;
  const hasAny = data.positives.length > 0 || data.negatives.length > 0;
  if (!hasAny) return null;

  return (
    <section className="rounded-xl border border-om-line bg-om-surface p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-om-ink">
          What reviewers say
        </h2>
        <span className="text-[10px] text-om-ink-soft">
          across {data.reviewsConsidered.toLocaleString()} review
          {data.reviewsConsidered === 1 ? "" : "s"}
        </span>
      </div>

      {data.positives.length > 0 && (
        <Row
          label="Liked"
          accent="emerald"
          terms={data.positives}
        />
      )}
      {data.negatives.length > 0 && (
        <Row
          label="Disliked"
          accent="rose"
          terms={data.negatives}
        />
      )}

      <p className="text-[10px] text-om-ink-soft pt-1 border-t border-om-line-soft">
        Auto-extracted from review bodies — no opaque scoring. Excludes
        reviews flagged by moderators.
      </p>
    </section>
  );
}

function Row({
  label,
  accent,
  terms,
}: {
  label: string;
  accent: "emerald" | "rose";
  terms: HighlightTerm[];
}) {
  const accentClass =
    accent === "emerald"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : "bg-rose-50 border-rose-200 text-rose-800";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-om-ink-soft mr-1">{label}:</span>
      {terms.map((t) => (
        <span
          key={t.term}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${accentClass}`}
        >
          {t.term}
          <span className="text-[10px] opacity-70">·</span>
          <span className="text-[10px] opacity-70">{t.mentions}</span>
        </span>
      ))}
    </div>
  );
}
