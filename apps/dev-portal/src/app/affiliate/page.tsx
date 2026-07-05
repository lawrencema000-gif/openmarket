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
  Input,
  Stat,
  Aurora,
  Eyebrow,
  GradientText,
} from "@openmarket/ui";

interface AffiliateAccount {
  id: string;
  referralCode: string;
  status: "active" | "paused" | "banned";
  handle: string | null;
  payoutEmail: string | null;
}

interface AffiliateMe {
  enrolled: boolean;
  account?: AffiliateAccount;
  stats?: {
    clicksLast30d: number;
    conversionsLast30d: number;
    earnings: { pendingCents: number; approvedCents: number; paidCents: number };
  };
}

const STOREFRONT =
  process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "https://openmarket.app";

export default function AffiliatePage() {
  const [data, setData] = useState<AffiliateMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [payoutEmail, setPayoutEmail] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<AffiliateMe>("/api/affiliates/me"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load affiliate account");
    } finally {
      setLoading(false);
    }
  }

  async function enroll() {
    setEnrolling(true);
    setError(null);
    try {
      await api.post("/api/affiliates/enroll", {
        handle: handle.trim() || undefined,
        payoutEmail: payoutEmail.trim() || undefined,
      });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Only the publisher owner can enroll in the affiliate program.");
      } else {
        setError(err instanceof ApiError ? err.message : "Could not enroll");
      }
    } finally {
      setEnrolling(false);
    }
  }

  function copyCode(code: string) {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="h-32 rounded-3xl bg-om-line animate-pulse" />
        <div className="h-48 rounded-2xl bg-om-line animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <section className="relative isolate overflow-hidden rounded-3xl om-glass-strong p-8 sm:p-10">
        <Aurora />
        <div className="relative space-y-3">
          <Eyebrow tone="primary" pulse>
            Affiliate program
          </Eyebrow>
          <h1 className="om-display text-3xl sm:text-4xl font-bold tracking-tight text-om-ink">
            Earn by <GradientText as="span">referring installs</GradientText>.
          </h1>
          <p className="text-om-ink-soft max-w-xl">
            Share referral links to apps in the program and earn a commission on
            every qualified install attributed to you.
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!data?.enrolled ? (
        <Card>
          <CardHeader>
            <CardTitle>Join the affiliate program</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-om-ink-mute">
              Enrolling generates your unique referral code. Optional details:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-om-ink-soft" htmlFor="handle">
                  Public handle (optional)
                </label>
                <Input
                  id="handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="my-channel"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-om-ink-soft" htmlFor="payout">
                  Payout email (optional)
                </label>
                <Input
                  id="payout"
                  type="email"
                  value={payoutEmail}
                  onChange={(e) => setPayoutEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <Button
              onClick={enroll}
              disabled={enrolling}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {enrolling ? "Enrolling…" : "Enroll now"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Clicks (30d)" value={data.stats?.clicksLast30d ?? 0} color="blue" />
            <Stat
              label="Conversions (30d)"
              value={data.stats?.conversionsLast30d ?? 0}
              color="green"
            />
            <Stat
              label="Pending"
              value={formatPrice(data.stats?.earnings.pendingCents ?? 0, "USD")}
              color="amber"
            />
            <Stat
              label="Paid out"
              value={formatPrice(data.stats?.earnings.paidCents ?? 0, "USD")}
              color="violet"
            />
          </div>

          {/* Referral code */}
          <Card>
            <CardHeader>
              <CardTitle>Your referral code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.account?.status !== "active" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  Your affiliate account is <strong>{data.account?.status}</strong>.
                  Referrals won't convert until it's active.
                </div>
              )}
              <div className="flex items-center gap-3">
                <code className="flex-1 rounded-lg bg-slate-900 text-violet-200 font-mono text-lg px-4 py-3 tracking-[0.2em]">
                  {data.account?.referralCode}
                </code>
                <Button
                  variant="outline"
                  onClick={() => copyCode(data.account!.referralCode)}
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="text-sm text-om-ink-soft">
                Append <code className="text-violet-700">?ref={data.account?.referralCode}</code>{" "}
                to any app link in the program. Example:
              </p>
              <code className="block rounded-lg bg-om-surface-tint border border-om-line px-3 py-2 text-xs text-om-ink-mute break-all">
                {STOREFRONT}/apps/&lt;app-id&gt;?ref={data.account?.referralCode}
              </code>
              <p className="text-xs text-om-ink-soft">
                Approved earnings become payable through your{" "}
                <a href="/payouts" className="text-violet-600 hover:underline">
                  payout account
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
