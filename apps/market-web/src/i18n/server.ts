import { cookies, headers } from "next/headers";
import {
  DEFAULT_UI_LOCALE,
  type UILocale,
  getMessages,
  resolveUILocale,
  translate,
} from "./messages";
import { parseAcceptLanguage } from "@openmarket/contracts/i18n";

/**
 * Server-side locale resolution (P3-N).
 *
 * Order of precedence:
 *   1. `om_ui_locale` cookie — set by the UI locale picker
 *   2. `Accept-Language` header — quality-factor-sorted, first match wins
 *   3. DEFAULT_UI_LOCALE ("en-US")
 *
 * Returns a small object with the resolved locale + a memoized
 * messages bag + a ready-to-call t() helper. Server components and
 * the layout consume this directly; the client provider is initialized
 * from these same values so SSR and hydration align.
 */
export async function getUIT(): Promise<{
  locale: UILocale;
  messages: Record<string, string>;
  t: (key: string, values?: Record<string, string | number>) => string;
}> {
  const cookieStore = await cookies();
  const cookieLoc = resolveUILocale(cookieStore.get("om_ui_locale")?.value);
  if (cookieLoc) {
    const messages = getMessages(cookieLoc);
    return {
      locale: cookieLoc,
      messages,
      t: (k, v) => translate(messages, k, v),
    };
  }

  const headerStore = await headers();
  const accepted = parseAcceptLanguage(headerStore.get("accept-language"));
  for (const candidate of accepted) {
    const loc = resolveUILocale(candidate);
    if (loc) {
      const messages = getMessages(loc);
      return {
        locale: loc,
        messages,
        t: (k, v) => translate(messages, k, v),
      };
    }
  }

  const fallbackMessages = getMessages(DEFAULT_UI_LOCALE);
  return {
    locale: DEFAULT_UI_LOCALE,
    messages: fallbackMessages,
    t: (k, v) => translate(fallbackMessages, k, v),
  };
}
