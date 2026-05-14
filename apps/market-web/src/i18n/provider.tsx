"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_UI_LOCALE,
  type UILocale,
  translate,
} from "./messages";

interface I18nContextValue {
  locale: UILocale;
  messages: Record<string, string>;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_UI_LOCALE,
  messages: {},
});

/**
 * Wraps the client component tree with the resolved UI locale +
 * messages bag from the server (P3-N). The layout reads these via
 * `getUIT()` and hands them down on every request so a cookie change
 * is reflected on the next navigation without a hard reload.
 *
 * Why not next-intl: that package is the canonical pick, but the
 * dependency adds ~30KB of client-side JS and an intl routing config
 * we'd have to thread through every existing route. Our message
 * surface is small enough (~30 keys at v1) that the custom helper
 * stays under 1KB and keeps the bundle slim.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: UILocale;
  messages: Record<string, string>;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * `useT()` returns the translate fn bound to the active locale's bag.
 * Behavior matches `getUIT().t` on the server so isomorphic
 * components can use whichever path makes sense at the call site.
 */
export function useT(): (
  key: string,
  values?: Record<string, string | number>,
) => string {
  const { messages } = useContext(I18nContext);
  return (key, values) => translate(messages, key, values);
}

export function useLocale(): UILocale {
  return useContext(I18nContext).locale;
}
