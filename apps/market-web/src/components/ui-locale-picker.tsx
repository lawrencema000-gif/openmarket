"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  UI_LOCALES,
  UI_LOCALE_LABELS,
  type UILocale,
} from "@/i18n/messages";
import { useLocale, useT } from "@/i18n/provider";

/**
 * Storefront UI language switcher (P3-N).
 *
 * Distinct from <LocalePicker> on the app detail page (which picks
 * the per-app listing translation from P2-H). This one swaps the
 * chrome — nav labels, footer, button text — by writing the
 * `om_ui_locale` cookie + refreshing the route so the layout
 * re-resolves on the server.
 */
export function UILocalePicker() {
  const router = useRouter();
  const t = useT();
  const current = useLocale();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as UILocale;
    document.cookie = `om_ui_locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-om-ink-soft">
      <span className="sr-only">{t("locale.label")}</span>
      <select
        value={current}
        disabled={pending}
        onChange={onChange}
        className="text-xs rounded-md border border-om-line bg-om-surface px-2 py-1 text-om-ink-mute hover:border-om-line focus:outline-none focus:ring-2 focus:ring-om-primary"
        aria-label={t("locale.label")}
      >
        {UI_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {UI_LOCALE_LABELS[loc]}
          </option>
        ))}
      </select>
    </label>
  );
}
