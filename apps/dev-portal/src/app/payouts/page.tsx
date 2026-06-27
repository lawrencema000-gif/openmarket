"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatPrice } from "@openmarket/contracts/pricing";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Aurora,
  Eyebrow,
  GradientText,
} from "@openmarket/ui";

interface PayoutAccount {
  configured: boolean;
  stripeAccountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  defaultCurrency?: string | null;
  countryCode?: string | null;
  taxInfoCollected?: boolean | null;
}

interface PayoutRow {
  id: string;
  periodFrom: string;
  periodTo: string;
  currency: string;
  grossCents: number;
  platformFeeBps: number;
  netCents: number;
  status: "pending" | "paid" | "failed" | "reversed";
  stripeTransferId: string | null;
  failureReason: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<PayoutRow["status"], string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  reversed: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function PayoutsPage() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // Surface the Stripe return/refresh query the API redirect appends.
    const params = new URLSearchParams(window.location.search);
    if (params.get("payout") === "return") {
      setNotice("Returned from Stripe. Your onboarding status is refreshed below.");
    } else if (params.get("payout") === "refresh") {
      setNotice("Onboarding link expired — start it again below.");
    }
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [acct, history] = await Promise.all([
        api.get<PayoutAccount>("/api/developers/me/payouts/account"),
        api
          .get<{ payouts: PayoutRow[] }>("/api/developers/me/payouts")
          .catch(() => ({ payouts: [] as PayoutRow[] })),
      ]);
      setAccount(acct);
      setPayouts(history.payouts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load payouts");
    } finally {
      setLoading(false);
    }
  }

  async function startOnboarding() {
    setOnboarding(true);
    setError(null);
    try {
      const { onboardingUrl } = await api.post<{ onboardingUrl: string }>(
        "/api/developers/me/payouts/onboard",
      );
      window.location.href = onboardingUrl;
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError(
          "Payouts aren't enabled on this deployment yet (Stripe Connect not configured). Check back once the platform turns on payments.",
        );
      } else {
        setError(err instanceof ApiError ? err.message : "Could not start onboarding");
      }
      setOnboarding(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="h-32 rounded-3xl bg-slate-200 animate-pulse" />
        <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  const ready =
    account?.configured &&
    account.chargesEnabled &&
    account.payoutsEnabled &&
    account.detailsSubmitted;

  return (
    <div className="max-w-4xl space-y-8">
      <section className="relative isolate overflow-hidden rounded-3xl om-glass-strong p-8 sm:p-10">
        <Aurora />
        <div className="relative space-y-3">
          <Eyebrow tone="cta" pulse>
            Payouts
          </Eyebrow>
          <h1 className="om-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Get <GradientText as="span">paid</GradientText> for your apps.
          </h1>
          <p className="text-slate-500 max-w-xl">
            Connect a Stripe account to receive your earnings. We never see your
            bank details — Stripe handles identity, tax, and transfers.
          </p>
        </div>
      </section>

      {notice && (
        <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-sm text-violet-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Onboarding / status */}
      <Card>
        <CardHeader>
          <CardTitle>Connect status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!account?.configured ? (
            <>
              <p className="text-sm text-slate-600">
                You haven't connected a payout account yet.
              </p>
              <Button
                onClick={startOnboarding}
                disabled={onboarding}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {onboarding ? "Redirecting to Stripe…" : "Set up payouts"}
              </Button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatusPill label="Details submitted" ok={!!account.detailsSubmitted} />
                <StatusPill label="Charges enabled" ok={!!account.chargesEnabled} />
                <StatusPill label="Payouts enabled" ok={!!account.payoutsEnabled} />
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-sm text-slate-500">
                {account.countryCode && <span>Country: {account.countryCode}</span>}
                {account.defaultCurrency && (
                  <span>Currency: {account.defaultCurrency.toUpperCase()}</span>
                )}
                <span className="font-mono text-xs text-slate-400">
                  {account.stripeAccountId}
                </span>
              </div>
              {!ready && (
                <Button
                  onClick={startOnboarding}
                  disabled={onboarding}
                  variant="outline"
                >
                  {onboarding ? "Redirecting…" : "Finish onboarding"}
                </Button>
              )}
              {ready && (
                <p className="text-sm text-emerald-700">
                  ✓ Your account is fully set up and ready to receive payouts.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Payout history</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No payouts yet. Once you have revenue and a connected account,
              payouts appear here each cycle.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                    <th className="py-2 pr-4 font-semibold">Period</th>
                    <th className="py-2 pr-4 font-semibold">Gross</th>
                    <th className="py-2 pr-4 font-semibold">Fee</th>
                    <th className="py-2 pr-4 font-semibold">Net</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-2.5 pr-4 text-slate-600">
                        {fmtDate(p.periodFrom)} – {fmtDate(p.periodTo)}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700">
                        {formatPrice(p.grossCents, p.currency)}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">
                        {(p.platformFeeBps / 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 pr-4 font-semibold text-slate-900">
                        {formatPrice(p.netCents, p.currency)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[p.status]}`}
                        >
                          {p.status}
                        </span>
                        {p.status === "failed" && p.failureReason && (
                          <p className="text-xs text-rose-500 mt-1">{p.failureReason}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ring-1 ${
        ok ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50 ring-slate-200"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
          ok ? "bg-emerald-500 text-white" : "bg-slate-300 text-white"
        }`}
      >
        {ok ? "✓" : "•"}
      </span>
      <span className={`text-sm font-medium ${ok ? "text-emerald-800" : "text-slate-500"}`}>
        {label}
      </span>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
