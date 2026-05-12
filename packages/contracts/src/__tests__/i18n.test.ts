import { describe, it, expect } from "vitest";
import {
  normalizeLocale,
  pickBestTranslationLocale,
  parseAcceptLanguage,
  localeSchema,
} from "../i18n";

describe("normalizeLocale", () => {
  it("lowercases and replaces underscores with hyphens", () => {
    expect(normalizeLocale("PT_BR")).toBe("pt-br");
    expect(normalizeLocale("En-US")).toBe("en-us");
  });

  it("trims whitespace", () => {
    expect(normalizeLocale("  fr-CA ")).toBe("fr-ca");
  });
});

describe("localeSchema", () => {
  it("accepts language-only codes", () => {
    expect(localeSchema.parse("en")).toBe("en");
    expect(localeSchema.parse("FR")).toBe("fr");
  });

  it("accepts language-region codes", () => {
    expect(localeSchema.parse("pt-br")).toBe("pt-br");
    expect(localeSchema.parse("Es-419")).toBe("es-419");
  });

  it("rejects invalid shapes", () => {
    expect(() => localeSchema.parse("english")).toThrow();
    expect(() => localeSchema.parse("en-USA")).toThrow();
    expect(() => localeSchema.parse("zh-Hans-CN")).toThrow();
    expect(() => localeSchema.parse("")).toThrow();
  });
});

describe("pickBestTranslationLocale", () => {
  const available = ["pt-br", "es", "fr", "zh-cn"];

  it("returns null when no locale requested", () => {
    expect(pickBestTranslationLocale(null, "en", available)).toBeNull();
    expect(pickBestTranslationLocale(undefined, "en", available)).toBeNull();
    expect(pickBestTranslationLocale("", "en", available)).toBeNull();
  });

  it("returns null when requested == default", () => {
    expect(pickBestTranslationLocale("en", "en", available)).toBeNull();
    expect(pickBestTranslationLocale("EN-US", "en-us", available)).toBeNull();
  });

  it("returns the exact match when one exists", () => {
    expect(pickBestTranslationLocale("pt-br", "en", available)).toBe("pt-br");
    expect(pickBestTranslationLocale("PT-BR", "en", available)).toBe("pt-br");
  });

  it("falls back from region-specific to language-only", () => {
    // requested es-mx, only es exists → es
    expect(pickBestTranslationLocale("es-mx", "en", available)).toBe("es");
  });

  it("falls forward from language-only to first region match", () => {
    // requested pt, only pt-br exists → pt-br
    expect(pickBestTranslationLocale("pt", "en", available)).toBe("pt-br");
  });

  it("returns null when nothing matches", () => {
    expect(pickBestTranslationLocale("ja", "en", available)).toBeNull();
    expect(pickBestTranslationLocale("de-at", "en", available)).toBeNull();
  });
});

describe("parseAcceptLanguage", () => {
  it("returns [] for missing / empty headers", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });

  it("parses a simple ordered list", () => {
    expect(parseAcceptLanguage("en-US,en;q=0.9,fr;q=0.8")).toEqual([
      "en-us",
      "en",
      "fr",
    ]);
  });

  it("sorts by quality factor when ordering is reversed", () => {
    expect(parseAcceptLanguage("fr;q=0.4,de;q=0.9,it;q=0.6")).toEqual([
      "de",
      "it",
      "fr",
    ]);
  });

  it("drops q=0 entries and the wildcard token", () => {
    expect(parseAcceptLanguage("en,*;q=0.5,zh;q=0")).toEqual(["en"]);
  });
});
