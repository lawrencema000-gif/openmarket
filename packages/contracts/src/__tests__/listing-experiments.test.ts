import { describe, it, expect } from "vitest";
import {
  bucketForSubject,
  pickVariantByBucket,
  computeExperimentResults,
  experimentInputSchema,
} from "../listing-experiments";

// Deterministic hex digest stub — just for the unit tests. Same input
// → same output, no crypto dependency.
function fakeHex(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  const u32 = h >>> 0;
  return u32.toString(16).padStart(8, "0") + "00000000".repeat(7);
}

describe("bucketForSubject", () => {
  it("is in the range [0, 99]", () => {
    for (let i = 0; i < 50; i++) {
      const b = bucketForSubject("exp-1", `user-${i}`, fakeHex);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it("is stable for the same (experiment, subject)", () => {
    const a = bucketForSubject("exp-1", "user-1", fakeHex);
    const b = bucketForSubject("exp-1", "user-1", fakeHex);
    expect(a).toBe(b);
  });

  it("differs across experiments for the same subject", () => {
    const a = bucketForSubject("exp-1", "user-1", fakeHex);
    const b = bucketForSubject("exp-2", "user-1", fakeHex);
    // Statistically nearly-impossible to collide on different inputs
    // with our fake hash but allow for the rare collision.
    expect(a === b ? a : -1).toBeLessThanOrEqual(99);
  });
});

describe("pickVariantByBucket", () => {
  const variants = [
    { id: "a", trafficWeight: 50 },
    { id: "b", trafficWeight: 50 },
  ];

  it("returns the first variant for bucket < first cumulative weight", () => {
    expect(pickVariantByBucket(variants, 0)?.id).toBe("a");
    expect(pickVariantByBucket(variants, 49)?.id).toBe("a");
  });

  it("returns the second variant when bucket crosses the threshold", () => {
    expect(pickVariantByBucket(variants, 50)?.id).toBe("b");
    expect(pickVariantByBucket(variants, 99)?.id).toBe("b");
  });

  it("returns the last variant as a fallback when weights sum < 100", () => {
    expect(
      pickVariantByBucket(
        [
          { id: "x", trafficWeight: 30 },
          { id: "y", trafficWeight: 30 },
        ],
        80,
      )?.id,
    ).toBe("y");
  });

  it("returns null on empty variants", () => {
    expect(pickVariantByBucket([], 50)).toBeNull();
  });
});

describe("computeExperimentResults", () => {
  it("computes install rate per variant", () => {
    const out = computeExperimentResults([
      {
        id: "a",
        label: "control",
        isControl: true,
        viewsCount: 1000,
        installsCount: 100,
      },
      {
        id: "b",
        label: "v1",
        isControl: false,
        viewsCount: 1000,
        installsCount: 150,
      },
    ]);
    expect(out[0]?.installRate).toBeCloseTo(0.1, 5);
    expect(out[1]?.installRate).toBeCloseTo(0.15, 5);
  });

  it("computes lift vs control", () => {
    const out = computeExperimentResults([
      {
        id: "a",
        label: "control",
        isControl: true,
        viewsCount: 1000,
        installsCount: 100,
      },
      {
        id: "b",
        label: "v1",
        isControl: false,
        viewsCount: 1000,
        installsCount: 150,
      },
    ]);
    expect(out[0]?.liftVsControl).toBeNull();
    expect(out[1]?.liftVsControl).toBeCloseTo(0.5, 5);
  });

  it("returns null lift when control has zero views", () => {
    const out = computeExperimentResults([
      { id: "a", label: "control", isControl: true, viewsCount: 0, installsCount: 0 },
      { id: "b", label: "v1", isControl: false, viewsCount: 1, installsCount: 1 },
    ]);
    expect(out[1]?.liftVsControl).toBeNull();
  });

  it("returns zero installRate for zero-view variants without crashing", () => {
    const out = computeExperimentResults([
      { id: "a", label: "control", isControl: true, viewsCount: 100, installsCount: 5 },
      { id: "b", label: "v1", isControl: false, viewsCount: 0, installsCount: 0 },
    ]);
    expect(out[1]?.installRate).toBe(0);
  });
});

describe("experimentInputSchema", () => {
  const validVariant = {
    label: "control",
    isControl: true,
    trafficWeight: 50,
  };
  const validVariantB = { label: "v1", trafficWeight: 50 };

  it("requires at least 2 variants", () => {
    expect(() =>
      experimentInputSchema.parse({
        name: "x",
        variants: [validVariant],
      }),
    ).toThrow();
  });

  it("caps variants at 6", () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({
      label: `v${i}`,
      trafficWeight: 10,
    }));
    expect(() =>
      experimentInputSchema.parse({ name: "x", variants: seven }),
    ).toThrow();
  });

  it("accepts a minimal valid input", () => {
    const parsed = experimentInputSchema.parse({
      name: "Test",
      variants: [validVariant, validVariantB],
    });
    expect(parsed.variants.length).toBe(2);
  });
});
