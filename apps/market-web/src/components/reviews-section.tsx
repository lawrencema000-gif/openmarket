"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { StarRating } from "@openmarket/ui";

type Sort = "helpful" | "recent" | "rating-high" | "rating-low";

interface Author {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface DeveloperResponse {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  developerId: string;
}

interface Review {
  id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string | null;
  body: string | null;
  versionCodeReviewed: number;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
  author: Author;
  response: DeveloperResponse | null;
  viewerHasMarkedHelpful: boolean;
}

interface ReviewsResponse {
  items: Review[];
  page: number;
  limit: number;
  total: number;
  summary: {
    average: number;
    total: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  };
}

const SORT_OPTIONS: Array<{ key: Sort; label: string }> = [
  { key: "helpful", label: "Most helpful" },
  { key: "recent", label: "Newest" },
  { key: "rating-high", label: "Highest rated" },
  { key: "rating-low", label: "Lowest rated" },
];

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export function ReviewsSection({ appId }: { appId: string }) {
  const { data: session } = useSession();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>("helpful");
  const [ratingFilter, setRatingFilter] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  useEffect(() => {
    void load(sort, ratingFilter);
  }, [appId, sort, ratingFilter]);

  async function load(s: Sort, rating: number | null) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ sort: s, limit: "20" });
      if (rating) qs.set("rating", String(rating));
      const res = await apiFetch<ReviewsResponse>(
        `/api/apps/${appId}/reviews?${qs.toString()}`,
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.isUnreachable) {
        setError("Couldn't reach the API.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load reviews");
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleHelpful(reviewId: string, currently: boolean) {
    if (!data) return;
    if (!session) return;
    // Optimistic UI
    setData({
      ...data,
      items: data.items.map((r) =>
        r.id === reviewId
          ? {
              ...r,
              viewerHasMarkedHelpful: !currently,
              helpfulCount: r.helpfulCount + (currently ? -1 : 1),
            }
          : r,
      ),
    });
    try {
      await apiFetch(`/api/reviews/${reviewId}/helpful`, {
        method: currently ? "DELETE" : "POST",
      });
    } catch {
      // Rollback on error
      setData((d) =>
        d
          ? {
              ...d,
              items: d.items.map((r) =>
                r.id === reviewId
                  ? {
                      ...r,
                      viewerHasMarkedHelpful: currently,
                      helpfulCount: r.helpfulCount + (currently ? 1 : -1),
                    }
                  : r,
              ),
            }
          : d,
      );
    }
  }

  return (
    <section id="reviews">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>
        {data && data.summary.total > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <StarRating rating={data.summary.average} size="sm" />
            <span className="text-gray-700 font-medium">
              {data.summary.average.toFixed(1)}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">
              {data.summary.total.toLocaleString()} review
              {data.summary.total === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}
      </div>

      {data && data.summary.total > 0 ? (
        <RatingHistogram
          distribution={data.summary.distribution}
          total={data.summary.total}
          activeRating={ratingFilter}
          onSelect={(r) => setRatingFilter(r === ratingFilter ? null : r)}
        />
      ) : null}

      <div className="flex items-center justify-between gap-2 mt-4 mb-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="review-sort" className="text-gray-500">Sort:</label>
          <select
            id="review-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm bg-white"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          {ratingFilter ? (
            <button
              type="button"
              onClick={() => setRatingFilter(null)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear filter ({ratingFilter}★)
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setShowCompose((s) => !s)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {showCompose ? "Cancel" : "Write a review"}
        </button>
      </div>

      {showCompose ? (
        <ReviewComposer
          appId={appId}
          onPosted={() => {
            setShowCompose(false);
            void load(sort, ratingFilter);
          }}
          onError={setComposeError}
          error={composeError}
        />
      ) : null}

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : loading ? (
        <ul className="space-y-3">
          {[0, 1].map((i) => (
            <li key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </ul>
      ) : data && data.items.length > 0 ? (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              signedIn={Boolean(session)}
              onToggleHelpful={() => toggleHelpful(r.id, r.viewerHasMarkedHelpful)}
            />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-8 text-center">
          <p className="text-sm text-gray-700">
            No reviews yet. Be the first — install the app, then click
            "Write a review".
          </p>
        </div>
      )}
    </section>
  );
}

function RatingHistogram({
  distribution,
  total,
  activeRating,
  onSelect,
}: {
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  total: number;
  activeRating: 1 | 2 | 3 | 4 | 5 | null;
  onSelect: (r: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="grid gap-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star as 1 | 2 | 3 | 4 | 5];
        const pct = total > 0 ? (count / total) * 100 : 0;
        const active = activeRating === star;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onSelect(star as 1 | 2 | 3 | 4 | 5)}
            aria-label={`Filter by ${star} stars (${count} reviews)`}
            className={`flex items-center gap-2 text-xs hover:bg-gray-50 rounded px-1 py-0.5 transition-colors ${
              active ? "bg-blue-50" : ""
            }`}
          >
            <span className="w-6 text-right text-gray-600 font-medium">
              {star}★
            </span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </div>
            <span className="w-12 text-left text-gray-500 tabular-nums">
              {count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReviewCard({
  review,
  signedIn,
  onToggleHelpful,
}: {
  review: Review;
  signedIn: boolean;
  onToggleHelpful: () => void;
}) {
  const [reporting, setReporting] = useState(false);
  const initial = (review.author.displayName ?? "?").charAt(0).toUpperCase();
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="flex items-start gap-3 mb-2">
        {review.author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.author.avatarUrl}
            alt={review.author.displayName ?? "Anonymous"}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <span className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-semibold flex items-center justify-center text-sm">
            {initial}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {review.author.displayName ?? "Anonymous"}
          </p>
          <p className="text-xs text-gray-500">
            <StarRating rating={review.rating} size="sm" />{" "}
            <span>· {fmtRelative(review.createdAt)}</span>
            {review.versionCodeReviewed ? (
              <span> · v{review.versionCodeReviewed}</span>
            ) : null}
          </p>
        </div>
      </header>
      {review.title ? (
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          {review.title}
        </h3>
      ) : null}
      {review.body ? (
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {review.body}
        </p>
      ) : null}

      {review.response ? (
        <div className="mt-3 ml-6 rounded-md border-l-4 border-blue-200 bg-blue-50/50 px-3 py-2">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Developer response · {fmtRelative(review.response.createdAt)}
          </p>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
            {review.response.body}
          </p>
        </div>
      ) : null}

      <footer className="mt-3 flex items-center gap-3 text-xs">
        {signedIn ? (
          <button
            type="button"
            onClick={onToggleHelpful}
            aria-pressed={review.viewerHasMarkedHelpful}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
              review.viewerHasMarkedHelpful
                ? "bg-emerald-50 text-emerald-700"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill={review.viewerHasMarkedHelpful ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
            </svg>
            Helpful ({review.helpfulCount})
          </button>
        ) : (
          <span className="text-gray-500">
            <Link href="/sign-in" className="text-blue-600 hover:underline">
              Sign in
            </Link>{" "}
            to mark helpful
          </span>
        )}
        {signedIn ? (
          <ReportButton
            reviewId={review.id}
            reporting={reporting}
            setReporting={setReporting}
          />
        ) : null}
      </footer>
    </li>
  );
}

function ReportButton({
  reviewId,
  reporting,
  setReporting,
}: {
  reviewId: string;
  reporting: boolean;
  setReporting: (v: boolean) => void;
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>("spam");
  const [desc, setDesc] = useState("");

  if (done) {
    return <span className="text-emerald-700 text-xs">Report submitted.</span>;
  }

  if (!reporting) {
    return (
      <button
        type="button"
        onClick={() => setReporting(true)}
        className="text-gray-500 hover:text-gray-800"
      >
        Report
      </button>
    );
  }

  async function submit() {
    setError(null);
    try {
      await apiFetch(`/api/reviews/${reviewId}/report`, {
        method: "POST",
        body: JSON.stringify({ reportType: type, description: desc }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 ml-auto">
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-xs"
      >
        <option value="spam">Spam</option>
        <option value="impersonation">Impersonation</option>
        <option value="illegal">Illegal</option>
        <option value="other">Other</option>
      </select>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Why?"
        className="rounded border border-gray-300 px-2 py-1 text-xs flex-1 min-w-[120px]"
        maxLength={2000}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!desc.trim()}
        className="rounded bg-gray-700 px-2 py-1 text-xs text-white disabled:opacity-50"
      >
        Submit
      </button>
      <button
        type="button"
        onClick={() => setReporting(false)}
        className="text-xs text-gray-500 hover:text-gray-800"
      >
        Cancel
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}

function ReviewComposer({
  appId,
  onPosted,
  onError,
  error,
}: {
  appId: string;
  onPosted: () => void;
  onError: (e: string | null) => void;
  error: string | null;
}) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    onError(null);
    try {
      await apiFetch(`/api/apps/${appId}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          rating,
          title: title || undefined,
          body: body || undefined,
        }),
      });
      setTitle("");
      setBody("");
      onPosted();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        onError(
          "You can only review apps you've installed. Use 'Add to library' first.",
        );
      } else if (err instanceof ApiError && err.status === 409) {
        onError(
          "You've already reviewed this app — edit your existing review from /account/reviews.",
        );
      } else {
        onError(err instanceof Error ? err.message : "Could not post review");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 mb-3 space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Your rating:</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className={`text-2xl ${n <= rating ? "text-amber-400" : "text-gray-300"} hover:text-amber-400`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        maxLength={120}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you like or dislike? Be specific — version, device, what worked or didn't."
        maxLength={4000}
        rows={4}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white resize-y"
      />
      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? "Posting…" : "Post review"}
        </button>
      </div>
    </div>
  );
}
