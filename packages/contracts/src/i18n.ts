import { z } from "zod";

/**
 * BCP 47 normalized locale codes used for listing translations (P2-H).
 *
 * We accept the language-only form ("en", "fr") and the language-region
 * form ("en-us", "pt-br") — anything more specific (script tags,
 * variants) is rejected to keep the matching matrix small. Stored
 * lowercase + hyphen-joined; the helper `normalizeLocale` does the
 * cleanup so the database holds one canonical shape.
 *
 * The shortlist below isn't a hard allow-list — devs can submit any
 * BCP 47 code that passes the regex. The list is just used for the
 * dev-portal picker UI + the storefront locale switcher.
 */
export const SUPPORTED_LOCALES = [
  "en",
  "en-us",
  "en-gb",
  "es",
  "es-mx",
  "es-419",
  "pt",
  "pt-br",
  "fr",
  "fr-ca",
  "de",
  "it",
  "nl",
  "pl",
  "ru",
  "tr",
  "ar",
  "hi",
  "id",
  "ja",
  "ko",
  "th",
  "vi",
  "zh-cn",
  "zh-tw",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Human labels for the picker UIs — keep in lockstep with SUPPORTED_LOCALES. */
export const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  "en-us": "English (US)",
  "en-gb": "English (UK)",
  es: "Español",
  "es-mx": "Español (México)",
  "es-419": "Español (Latinoamérica)",
  pt: "Português",
  "pt-br": "Português (Brasil)",
  fr: "Français",
  "fr-ca": "Français (Canada)",
  de: "Deutsch",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  ru: "Русский",
  tr: "Türkçe",
  ar: "العربية",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
  ja: "日本語",
  ko: "한국어",
  th: "ไทย",
  vi: "Tiếng Việt",
  "zh-cn": "中文 (简体)",
  "zh-tw": "中文 (繁體)",
};

// BCP 47-ish: language [a-z]{2,3}, optional region [-A-Z]{2}|[-0-9]{3}.
// Stored lowercased; we accept either case on input and normalize.
const LOCALE_REGEX = /^[a-z]{2,3}(-(?:[a-z]{2}|[0-9]{3}))?$/;

export function normalizeLocale(input: string): string {
  return input.trim().toLowerCase().replace(/_/g, "-");
}

export const localeSchema = z
  .string()
  .min(2)
  .max(8)
  .transform(normalizeLocale)
  .refine((v) => LOCALE_REGEX.test(v), {
    message: "Locale must look like 'en', 'pt-br', or 'es-419'",
  });

/**
 * Translation body — every text field is optional so the developer
 * can ship partial translations (just the title, for example). The
 * storefront falls back to the default-locale baseline for missing
 * fields.
 */
export const listingTranslationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  shortDescription: z.string().min(1).max(500).optional(),
  fullDescription: z.string().min(1).max(20000).optional(),
  screenshots: z.array(z.string().url()).max(10).optional(),
});

export type ListingTranslationInput = z.infer<typeof listingTranslationSchema>;

/**
 * Resolution algorithm shared by API + storefront.
 *
 * Given the client's requested locale, the app's default, and the set
 * of available translation locales, pick which translation row (if
 * any) the storefront should overlay on the default-locale baseline.
 *
 * Returns `null` when no translation matches (caller renders the
 * baseline as-is).
 */
export function pickBestTranslationLocale(
  requested: string | null | undefined,
  defaultLocale: string,
  available: string[],
): string | null {
  if (!requested) return null;
  const want = normalizeLocale(requested);
  if (want === normalizeLocale(defaultLocale)) return null;

  const set = new Set(available.map(normalizeLocale));
  // 1) Exact match ("pt-br" → "pt-br")
  if (set.has(want)) return want;
  // 2) Language-only fallback ("pt-br" → "pt")
  const lang = want.split("-")[0]!;
  if (lang !== want && set.has(lang)) return lang;
  // 3) Reverse: client said "pt"; pick the first region under "pt-*"
  if (lang === want) {
    for (const loc of set) {
      if (loc.startsWith(`${want}-`)) return loc;
    }
  }
  return null;
}

/**
 * Parse Accept-Language header into an ordered list of locales.
 * Tolerates malformed headers (returns []) so callers don't have to
 * try/catch around it. Quality factors are honored.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((token) => {
      const [code, ...params] = token.trim().split(";");
      const qPart = params.find((p) => p.trim().startsWith("q="));
      const q = qPart ? Number(qPart.split("=")[1]) : 1;
      return { code: code ? normalizeLocale(code) : "", q: Number.isFinite(q) ? q : 0 };
    })
    .filter((t) => t.code && t.code !== "*" && t.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((t) => t.code);
}
