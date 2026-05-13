import { z } from "zod";

/**
 * Auto-extracted review highlights (P3-D).
 *
 * Surfaces "what users love" and "what users dislike" on the
 * storefront app detail. Pure n-gram extraction over published
 * review bodies — no ML, no opaque ranking — so the output is
 * reproducible and reviewable.
 *
 * Algorithm (single pass, see computeReviewHighlights below):
 *   1. Partition reviews into positive (rating >= 4) and negative
 *      (rating <= 2). Reviews with rating == 3 are ignored — they
 *      add noise without resolving a polarity.
 *   2. Tokenize each body: lowercase, strip punctuation/numbers,
 *      drop tokens shorter than 3 chars, drop stop words.
 *   3. Count single tokens AND bigrams; bigrams that contain a stop
 *      word get a 0.5x weight because "the game" is less informative
 *      than "addictive game".
 *   4. Compute polarity score for each term:
 *         score = freq(polar) - 0.5 * freq(other) - tiny tiebreaker
 *      A term must appear in at least MIN_MENTIONS reviews of its
 *      polarity to make the list (avoids one-off mentions becoming
 *      "highlights").
 *   5. Top TOP_K per polarity by score, ties broken by alphabetic
 *      order so the output is deterministic.
 *
 * Output is a flat shape so the storefront and dev-portal share
 * one rendering path.
 */
export const reviewHighlightTermSchema = z.object({
  term: z.string().min(1),
  mentions: z.number().int().min(0),
});

export type ReviewHighlightTerm = z.infer<typeof reviewHighlightTermSchema>;

export const reviewHighlightsSchema = z.object({
  positives: z.array(reviewHighlightTermSchema),
  negatives: z.array(reviewHighlightTermSchema),
  reviewsConsidered: z.number().int().nonnegative(),
});

export type ReviewHighlights = z.infer<typeof reviewHighlightsSchema>;

export interface ReviewForHighlights {
  rating: number;
  body: string | null;
}

const STOP_WORDS = new Set([
  "the","and","but","for","yet","with","that","this","they","them",
  "have","has","had","was","were","been","being","into","over","under",
  "from","than","very","just","its","you","your","its","our","ours",
  "are","not","get","got","its","one","two","app","apps","like","use",
  "used","using","still","also","can","cant","wont","dont","doesnt",
  "didnt","cannot","because","when","where","what","which","there",
  "their","theyre","theres","ive","ill","its","really","much","more",
  "some","any","all","every","much","such","more","most","few","none",
  "would","could","should","might","ever","never","always","sometimes",
  "now","then","here","there","off","out","make","made","makes","want",
  "wanted","need","needed","says","said","say","saying","good","bad",
  "great","love","hate","amazing","awesome","best","worst","ok","okay",
  "yes","no","please","help","why","how","who","when","what","where",
  "since","before","after","during","while","about","because",
]);

const MIN_MENTIONS = 3;
const TOP_K = 5;
const MAX_TERM_LEN = 40;

function tokenize(body: string): string[] {
  return body
    .toLowerCase()
    .normalize("NFKD")
    // Strip everything that isn't a letter, number, hyphen, apostrophe, or space.
    .replace(/[^a-z0-9'\-\s]+/g, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && t.length <= MAX_TERM_LEN && !/^\d+$/.test(t));
}

function uniqueTermsFromBody(body: string): Array<{ term: string; weight: number }> {
  const tokens = tokenize(body);
  const seen = new Map<string, number>();

  // Single tokens — weight 1.0 unless stop-word
  for (const tok of tokens) {
    if (STOP_WORDS.has(tok)) continue;
    seen.set(tok, Math.max(seen.get(tok) ?? 0, 1));
  }

  // Bigrams — weight 1.0 if neither half is a stop word, 0.5 otherwise
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    if (a === b) continue;
    const term = `${a} ${b}`;
    if (term.length > MAX_TERM_LEN) continue;
    const stopA = STOP_WORDS.has(a);
    const stopB = STOP_WORDS.has(b);
    if (stopA && stopB) continue;
    const weight = stopA || stopB ? 0.5 : 1.0;
    seen.set(term, Math.max(seen.get(term) ?? 0, weight));
  }

  return Array.from(seen.entries()).map(([term, weight]) => ({ term, weight }));
}

/**
 * Pure computation — no I/O. Takes the set of reviews (already
 * scoped to one app by the caller) and produces the highlights blob.
 *
 * Reviews with null/blank bodies are skipped — we can't extract from
 * an empty string. Reviews with rating == 3 are skipped as ambiguous.
 */
export function computeReviewHighlights(
  reviews: ReviewForHighlights[],
): ReviewHighlights {
  const polarMentions = {
    positive: new Map<string, number>(),
    negative: new Map<string, number>(),
  };
  const polarCounts = { positive: 0, negative: 0 };

  for (const r of reviews) {
    if (!r.body || r.body.trim().length === 0) continue;
    const polar: "positive" | "negative" | null =
      r.rating >= 4 ? "positive" : r.rating <= 2 ? "negative" : null;
    if (!polar) continue;
    polarCounts[polar]++;
    for (const { term, weight } of uniqueTermsFromBody(r.body)) {
      polarMentions[polar].set(
        term,
        (polarMentions[polar].get(term) ?? 0) + weight,
      );
    }
  }

  function topFor(polar: "positive" | "negative"): ReviewHighlightTerm[] {
    const ours = polarMentions[polar];
    const other = polarMentions[polar === "positive" ? "negative" : "positive"];
    const scored: Array<{ term: string; mentions: number; score: number }> = [];
    for (const [term, mentions] of ours) {
      if (mentions < MIN_MENTIONS) continue;
      const score = mentions - 0.5 * (other.get(term) ?? 0);
      if (score <= 0) continue;
      scored.push({ term, mentions: Math.round(mentions), score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.term.localeCompare(b.term);
    });
    return scored.slice(0, TOP_K).map(({ term, mentions }) => ({ term, mentions }));
  }

  return {
    positives: topFor("positive"),
    negatives: topFor("negative"),
    reviewsConsidered: polarCounts.positive + polarCounts.negative,
  };
}
