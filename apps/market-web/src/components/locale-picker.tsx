"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LOCALE_LABELS } from "@openmarket/contracts/i18n";

interface LocalePickerProps {
  defaultLocale: string;
  resolved: string;
  available: string[];
}

/**
 * Compact dropdown that lets the visitor switch between available
 * translations of an app listing. Rendered inline above the app
 * header on the detail page. Hidden when the app has no translations
 * beyond its default locale.
 *
 * Behavior:
 *   - selecting a locale appends/replaces `?locale=xx` and forces a
 *     server re-render so the translated listing renders for SSR
 *   - selecting the default locale clears the param entirely so the
 *     URL stays canonical
 *   - we DON'T persist to a cookie here — the URL is authoritative
 *     so shared links land everyone on the same translation
 */
export function LocalePicker({
  defaultLocale,
  resolved,
  available,
}: LocalePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build the picker options: default + every translation we have.
  // Deduped because the default may also have a translation row
  // (shouldn't, but defensive).
  const all = Array.from(new Set([defaultLocale, ...available]));
  if (all.length < 2) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === defaultLocale) {
      params.delete("locale");
    } else {
      params.set("locale", next);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : (pathname ?? "/"));
  }

  return (
    <div className="inline-flex items-center gap-2">
      <label className="text-xs text-om-ink-soft" htmlFor="locale-picker">
        Language
      </label>
      <select
        id="locale-picker"
        value={resolved}
        onChange={onChange}
        className="text-xs rounded-md border border-om-line bg-om-surface px-2 py-1 text-om-ink-mute hover:border-om-line focus:outline-none focus:ring-2 focus:ring-om-primary"
      >
        {all.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_LABELS[loc] ?? loc}
          </option>
        ))}
      </select>
    </div>
  );
}
