import enUS from "./messages/en-US.json";
import esES from "./messages/es-ES.json";
import ptBR from "./messages/pt-BR.json";
import deDE from "./messages/de-DE.json";

/**
 * Storefront UI locales (P3-N). Distinct from the per-app listing
 * translations from P2-H: those translate developer-supplied content
 * (titles, descriptions); these translate the OpenMarket chrome
 * (nav, footer, section headers, buttons).
 *
 * v1 ships 4 locales. The catalog is a flat key→string JSON file per
 * locale; missing keys fall through to the en-US default so partial
 * translations are safe — useful when adding a new key without
 * touching every locale at once.
 */
export const UI_LOCALES = ["en-US", "es-ES", "pt-BR", "de-DE"] as const;
export type UILocale = (typeof UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UILocale = "en-US";

export const UI_LOCALE_LABELS: Record<UILocale, string> = {
  "en-US": "English",
  "es-ES": "Español",
  "pt-BR": "Português (BR)",
  "de-DE": "Deutsch",
};

const CATALOGS: Record<UILocale, Record<string, string>> = {
  "en-US": enUS as Record<string, string>,
  "es-ES": esES as Record<string, string>,
  "pt-BR": ptBR as Record<string, string>,
  "de-DE": deDE as Record<string, string>,
};

export type MessageKey = keyof typeof enUS;

/**
 * Normalize a candidate locale string to a UILocale, or null if no
 * supported locale matches. Accepts BCP-47 with case-insensitive
 * region matching + language-only fallback ("pt" → "pt-BR").
 */
export function resolveUILocale(input: string | null | undefined): UILocale | null {
  if (!input) return null;
  const norm = input.trim().toLowerCase();
  for (const loc of UI_LOCALES) {
    if (loc.toLowerCase() === norm) return loc;
  }
  // Language-only fallback — first region match wins. Catalog is
  // small enough that linear scan is fine.
  const lang = norm.split("-")[0]!;
  for (const loc of UI_LOCALES) {
    if (loc.toLowerCase().startsWith(`${lang}-`)) return loc;
  }
  return null;
}

/**
 * Server-side message getter — returns the catalog for `locale`
 * with the en-US baseline merged underneath so every key resolves.
 */
export function getMessages(locale: UILocale): Record<string, string> {
  if (locale === DEFAULT_UI_LOCALE) return CATALOGS[DEFAULT_UI_LOCALE];
  return { ...CATALOGS[DEFAULT_UI_LOCALE], ...CATALOGS[locale] };
}

/**
 * Pure translate helper — takes a flat message bag and a key, returns
 * the translated string. Used by both the server-side render path
 * and the client-side provider.
 *
 * Interpolation: `{name}` placeholders are substituted from the
 * `values` object when provided. Missing values render as the literal
 * `{name}` so bugs are visible rather than silent.
 */
export function translate(
  messages: Record<string, string>,
  key: string,
  values?: Record<string, string | number>,
): string {
  const raw = messages[key];
  if (raw == null) return key;
  if (!values) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    values[k] != null ? String(values[k]) : `{${k}}`,
  );
}
