import { describe, it, expect } from "vitest";
import { isInCohort, pickRelease } from "../lib/rollout";

describe("isInCohort", () => {
  it("100% rolls out to everyone", () => {
    for (let i = 0; i < 50; i++) {
      expect(isInCohort(`user-${i}`, "rel-1", 100)).toBe(true);
    }
  });

  it("0% rolls out to no-one", () => {
    for (let i = 0; i < 50; i++) {
      expect(isInCohort(`user-${i}`, "rel-1", 0)).toBe(false);
    }
  });

  it("anonymous (empty subjectId) is never in any cohort", () => {
    expect(isInCohort("", "rel-1", 50)).toBe(false);
    expect(isInCohort("", "rel-1", 99)).toBe(false);
  });

  it("is stable per (subject, release) — same answer on repeat calls", () => {
    const subject = "user-stability-test";
    const releaseId = "rel-stability";
    const a = isInCohort(subject, releaseId, 25);
    const b = isInCohort(subject, releaseId, 25);
    expect(a).toBe(b);
  });

  it("a 10% rollout reaches roughly 10% of distinct users", () => {
    const N = 5000;
    let inCohort = 0;
    for (let i = 0; i < N; i++) {
      if (isInCohort(`distinct-user-${i}`, "uniform-test-rel", 10)) inCohort++;
    }
    const ratio = inCohort / N;
    // Should land in 8-12% with N=5000; SHA-256 + modulo is uniform.
    expect(ratio).toBeGreaterThan(0.07);
    expect(ratio).toBeLessThan(0.13);
  });

  it("two releases at the same percentage hit DIFFERENT user cohorts", () => {
    // The seed for the "in 10% of release A" test should not bias the
    // "in 10% of release B" test. We compute the intersection ratio.
    let inA = 0,
      inB = 0,
      inBoth = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const subject = `cross-test-${i}`;
      const a = isInCohort(subject, "release-A", 25);
      const b = isInCohort(subject, "release-B", 25);
      if (a) inA++;
      if (b) inB++;
      if (a && b) inBoth++;
    }
    // If the two cohorts were independent (uniformly random), the
    // intersection would be ~6.25% (25% × 25%). Allow a generous band.
    const expected = N * 0.25 * 0.25;
    expect(Math.abs(inBoth - expected)).toBeLessThan(expected * 0.5);
    // Both individual cohorts should still be ~25%.
    expect(Math.abs(inA - N * 0.25)).toBeLessThan(N * 0.05);
    expect(Math.abs(inB - N * 0.25)).toBeLessThan(N * 0.05);
  });

  it("ramping from 10 to 50 strictly grows the cohort (every 10% user is also in 50%)", () => {
    let in10 = 0,
      in50 = 0,
      in10ButNot50 = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const subject = `ramp-test-${i}`;
      const a = isInCohort(subject, "ramp-rel", 10);
      const b = isInCohort(subject, "ramp-rel", 50);
      if (a) in10++;
      if (b) in50++;
      if (a && !b) in10ButNot50++;
    }
    expect(in10ButNot50).toBe(0); // Monotonic — no flapping on ramp up.
    expect(in50).toBeGreaterThan(in10);
  });
});

describe("pickRelease", () => {
  const baseRelease = {
    rolloutPercentage: 100,
    rolloutStatus: "live" as const,
  };

  it("returns the highest-versionCode release the subject is qualified for", () => {
    const result = pickRelease(
      [
        { ...baseRelease, id: "rel-old", versionCode: 1 },
        { ...baseRelease, id: "rel-new", versionCode: 5 },
        { ...baseRelease, id: "rel-mid", versionCode: 3 },
      ],
      "subject-1",
    );
    expect(result?.id).toBe("rel-new");
  });

  it("walks down past a halted release to the next-best", () => {
    const result = pickRelease(
      [
        {
          ...baseRelease,
          id: "rel-halted",
          versionCode: 5,
          rolloutStatus: "halted" as const,
        },
        { ...baseRelease, id: "rel-prev", versionCode: 4 },
      ],
      "subject-1",
    );
    expect(result?.id).toBe("rel-prev");
  });

  it("walks down past a release the subject isn't in cohort for", () => {
    // Force percentage=0 on the newer release → guaranteed exclusion
    // for any subject.
    const result = pickRelease(
      [
        {
          ...baseRelease,
          id: "rel-newer",
          versionCode: 5,
          rolloutPercentage: 0,
        },
        { ...baseRelease, id: "rel-prev", versionCode: 4 },
      ],
      "subject-1",
    );
    expect(result?.id).toBe("rel-prev");
  });

  it("returns null when no candidate qualifies (all halted)", () => {
    const result = pickRelease(
      [
        {
          ...baseRelease,
          id: "rel-1",
          versionCode: 5,
          rolloutStatus: "halted" as const,
        },
      ],
      "subject-1",
    );
    expect(result).toBeNull();
  });

  it("treats `completed` as 100% even if rolloutPercentage is somehow lower", () => {
    const result = pickRelease(
      [
        {
          ...baseRelease,
          id: "rel-completed",
          versionCode: 5,
          rolloutPercentage: 50,
          rolloutStatus: "completed" as const,
        },
      ],
      "subject-1",
    );
    expect(result?.id).toBe("rel-completed");
  });
});
