"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import {
  normalizePromoCode,
  isValidPromoCodeShape,
} from "@openmarket/contracts/promo-codes";

interface Preview {
  appId: string;
  appTitle: string;
  appIconUrl: string | null;
  grantsBeta: boolean;
  grantsPreRegistration: boolean;
  remainingRedemptions: number | null;
  expiresAt: string | null;
}

interface RedeemResult {
  appId: string;
  betaJoined: boolean;
  preRegistered: boolean;
}

/**
 * Storefront promo-code redemption (P3-C).
 *
 * Two-step flow:
 *   1. user enters or pastes a code → preview shows what it unlocks
 *   2. user clicks "Redeem" (auth gate if not signed in) → server
 *      applies effects and we route to the app detail page
 *
 * Accepts ?code= in the URL so developers can hand out direct links
 * like /redeem?code=ABCD2345 that pre-fill the input.
 */
export default function RedeemPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-4 py-16 text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <RedeemPageInner />
    </Suspense>
  );
}

function RedeemPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();

  const [raw, setRaw] = useState(params?.get("code") ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);

  const normalized = normalizePromoCode(raw);
  const shapeValid = isValidPromoCodeShape(normalized);

  useEffect(() => {
    if (!shapeValid) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);
    void apiFetch<Preview>(`/api/promo-codes/${normalized}/preview`)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(
          err instanceof ApiError ? err.message : "Couldn't load code",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [normalized, shapeValid]);

  async function redeem() {
    if (!session) {
      router.push(`/sign-in?next=${encodeURIComponent(`/redeem?code=${normalized}`)}`);
      return;
    }
    setRedeeming(true);
    try {
      const r = await apiFetch<RedeemResult>("/api/promo-codes/redeem", {
        method: "POST",
        body: JSON.stringify({ code: normalized }),
      });
      setResult(r);
    } catch (err) {
      setPreviewError(
        err instanceof ApiError ? err.message : "Redeem failed",
      );
    } finally {
      setRedeeming(false);
    }
  }

  if (result) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 space-y-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">You're in</h1>
        <p className="text-sm text-gray-600">
          Code redeemed successfully.
          {result.betaJoined ? " You're now in the beta track. " : null}
          {result.preRegistered ? " You're on the launch waitlist. " : null}
        </p>
        <Link
          href={`/apps/${result.appId}`}
          className="inline-flex items-center rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2"
        >
          Open app
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Redeem a code</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste a promo code given to you by a developer to unlock beta
          access, pre-registration, or other perks.
        </p>
      </header>

      <input
        type="text"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="e.g. ABCD2345"
        autoCapitalize="characters"
        spellCheck={false}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-mono tracking-widest text-center uppercase shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
      />

      {!shapeValid && normalized.length > 0 ? (
        <p className="text-xs text-gray-500">
          Codes are 8 characters using letters and numbers.
        </p>
      ) : null}

      {loadingPreview && shapeValid ? (
        <p className="text-xs text-gray-500">Looking up code…</p>
      ) : null}

      {previewError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {previewError}
        </div>
      ) : null}

      {preview ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-3">
            {preview.appIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.appIconUrl}
                alt=""
                className="w-12 h-12 rounded-lg border border-gray-200 object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">
                {preview.appTitle}
              </p>
              <p className="text-xs text-gray-500">This code unlocks:</p>
            </div>
          </div>
          <ul className="space-y-1 text-sm text-gray-700">
            {preview.grantsBeta && (
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Beta track access
              </li>
            )}
            {preview.grantsPreRegistration && (
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Pre-registration on the launch list
              </li>
            )}
            {!preview.grantsBeta && !preview.grantsPreRegistration && (
              <li className="text-gray-500 italic">
                A redemption record only — no auto-grant.
              </li>
            )}
          </ul>
          {preview.remainingRedemptions != null ? (
            <p className="text-[11px] text-gray-500">
              {preview.remainingRedemptions} redemption
              {preview.remainingRedemptions === 1 ? "" : "s"} remaining
            </p>
          ) : null}
          {preview.expiresAt ? (
            <p className="text-[11px] text-gray-500">
              Expires {new Date(preview.expiresAt).toLocaleString()}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void redeem()}
            disabled={redeeming}
            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
          >
            {redeeming
              ? "Redeeming…"
              : session
                ? "Redeem"
                : "Sign in to redeem"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
