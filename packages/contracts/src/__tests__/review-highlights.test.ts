import { describe, it, expect } from "vitest";
import { computeReviewHighlights } from "../review-highlights";

const FOUR_POS = "addictive game, smooth graphics, fast loading";
const ONE_POS_REVIEW = { rating: 5, body: FOUR_POS };

describe("computeReviewHighlights", () => {
  it("returns empty arrays for no reviews", () => {
    const out = computeReviewHighlights([]);
    expect(out.positives).toEqual([]);
    expect(out.negatives).toEqual([]);
    expect(out.reviewsConsidered).toBe(0);
  });

  it("ignores reviews with rating == 3 (ambiguous)", () => {
    const out = computeReviewHighlights([
      { rating: 3, body: "addictive game addictive game addictive game" },
    ]);
    expect(out.reviewsConsidered).toBe(0);
    expect(out.positives).toEqual([]);
  });

  it("skips null / empty bodies", () => {
    const out = computeReviewHighlights([
      { rating: 5, body: null },
      { rating: 5, body: "   " },
    ]);
    expect(out.positives).toEqual([]);
    expect(out.negatives).toEqual([]);
  });

  it("requires at least MIN_MENTIONS (3) hits to surface a term", () => {
    const out = computeReviewHighlights([
      ONE_POS_REVIEW,
      ONE_POS_REVIEW,
    ]);
    // Only 2 mentions of "addictive" — under the floor of 3.
    expect(out.positives).toEqual([]);
  });

  it("surfaces a clear positive term", () => {
    const out = computeReviewHighlights([
      { rating: 5, body: "addictive game with great graphics" },
      { rating: 5, body: "very addictive, smooth performance" },
      { rating: 4, body: "addictive and polished overall" },
      { rating: 4, body: "polished interface and addictive gameplay" },
    ]);
    expect(out.positives.map((p) => p.term)).toContain("addictive");
  });

  it("surfaces a negative term distinct from positives", () => {
    const out = computeReviewHighlights([
      // positives
      { rating: 5, body: "polished and fast and polished and fast" },
      { rating: 5, body: "polished smooth fun" },
      { rating: 4, body: "polished and clean" },
      // negatives
      { rating: 1, body: "crashes constantly on every launch, crashes" },
      { rating: 1, body: "crashes every time, ad spam" },
      { rating: 2, body: "constantly crashes on my pixel device" },
    ]);
    const negTerms = out.negatives.map((n) => n.term);
    expect(negTerms).toContain("crashes");
  });

  it("filters out stop words", () => {
    const out = computeReviewHighlights([
      // "the" should never make it
      { rating: 5, body: "the the the the the the awesome awesome awesome" },
      { rating: 5, body: "the the the awesome awesome awesome" },
      { rating: 5, body: "the the the awesome awesome awesome" },
    ]);
    const terms = out.positives.map((p) => p.term);
    expect(terms.every((t) => !t.split(" ").every((tok) => tok === "the"))).toBe(true);
  });

  it("caps to TOP_K (5) terms per polarity", () => {
    const reviews = [];
    const distinctTerms = [
      "addictive",
      "smooth",
      "polished",
      "intuitive",
      "responsive",
      "delightful",
      "brilliant",
      "elegant",
    ];
    // Each term appears in 4 reviews to clear MIN_MENTIONS.
    for (const term of distinctTerms) {
      for (let i = 0; i < 4; i++) {
        reviews.push({ rating: 5, body: term });
      }
    }
    const out = computeReviewHighlights(reviews);
    expect(out.positives.length).toBeLessThanOrEqual(5);
  });

  it("deterministic output for the same input", () => {
    const inputs = [
      { rating: 5, body: "addictive gameplay polished interface" },
      { rating: 5, body: "addictive gameplay smooth" },
      { rating: 5, body: "addictive smooth" },
      { rating: 5, body: "addictive polished" },
    ];
    const a = computeReviewHighlights(inputs);
    const b = computeReviewHighlights(inputs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("counts the right reviewsConsidered (excludes 3-stars + blanks)", () => {
    const out = computeReviewHighlights([
      { rating: 5, body: "x" },
      { rating: 5, body: "x" },
      { rating: 3, body: "x" },
      { rating: 5, body: null },
      { rating: 1, body: "y" },
    ]);
    expect(out.reviewsConsidered).toBe(3);
  });
});
