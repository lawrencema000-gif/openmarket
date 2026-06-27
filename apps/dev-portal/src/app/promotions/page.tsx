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
  Aurora,
  Eyebrow,
  GradientText,
} from "@openmarket/ui";

interface AppLite {
  id: string;
  packageName: string;
  title?: string;
  listings?: Array<{ title?: string }>;
}

interface Promotion {
  id: string;
  appId: string;
  bidCentsPerClick: number;
  dailyBudgetCents: number;
  currency: string;
  status:
    | "draft"
    | "pending_review"
    | "active"
    | "paused_budget"
    | "paused_policy"
    | "ended";
  policyRejectionReason: string | null;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<Promotion["status"], string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending_review: "bg-amber-50 text-amber-700 ring-amber-200",
  paused_budget: "bg-sky-50 text-sky-700 ring-sky-200",
  paused_policy: "bg-rose-50 text-rose-700 ring-rose-200",
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  ended: "bg-slate-100 text-slate-500 ring-slate-200",
};

const STATUS_LABEL: Record<Promotion["status"], string> = {
  active: "Active",
  pending_review: "Pending review",
  paused_budget: "Paused — budget",
  paused_policy: "Rejected",
  draft: "Draft",
  ended: "Ended",
};

function appLabel(apps: AppLite[], id: string): string {
  const a = apps.find((x) => x.id === id);
  if (!a) return id.slice(0, 8);
  return a.title ?? a.listings?.[0]?.title ?? a.packageName;
}

export default function PromotionsPage() {
  const [apps, setApps] = useState<AppLite[]>([]);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // form state (dollars in the UI, converted to cents on submit)
  const [appId, setAppId] = useState("");
  const [bid, setBid] = useState("0.25");
  const [dailyBudget, setDailyBudget] = useState("10.00");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [appsRes, mine] = await Promise.all([
        api.get<AppLite[] | { items: AppLite[] }>("/api/apps"),
        api.get<{ promotions: Promotion[] }>("/api/promoted-listings/mine"),
      ]);
      const appList = Array.isArray(appsRes) ? appsRes : (appsRes.items ?? []);
      setApps(appList);
      setPromos(mine.promotions);
      if (!appId && appList[0]) setAppId(appList[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load promotions");
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    setSubmitting(true);
    setError(null);
    const bidCents = Math.round(parseFloat(bid) * 100);
    const budgetCents = Math.round(parseFloat(dailyBudget) * 100);
    try {
      await api.post("/api/promoted-listings", {
        appId,
        bidCentsPerClick: bidCents,
        dailyBudgetCents: budgetCents,
        currency: "usd",
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create promotion");
    } finally {
      setSubmitting(false);
    }
  }

  async function endPromotion(id: string) {
    if (!confirm("End this promotion? It will stop showing immediately.")) return;
    try {
      await api.post(`/api/promoted-listings/${id}/end`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not end promotion");
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="h-32 rounded-3xl bg-slate-200 animate-pulse" />
        <div className="h-40 rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <section className="relative isolate overflow-hidden rounded-3xl om-glass-strong p-8 sm:p-10">
        <Aurora />
        <div className="relative space-y-3">
          <Eyebrow tone="primary" pulse>
            Promoted listings
          </Eyebrow>
          <h1 className="om-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Promote your <GradientText as="span">apps</GradientText>.
          </h1>
          <p className="text-slate-500 max-w-xl">
            Sponsored placements, clearly labeled. You set a max bid per click
            and a daily budget; every campaign is reviewed before it goes live
            and never bumps an app's trust signals.
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Your campaigns</h2>
        <Button
          onClick={() => setShowForm((s) => !s)}
          className="bg-violet-600 hover:bg-violet-500 text-white"
          disabled={apps.length === 0}
        >
          {showForm ? "Cancel" : "New campaign"}
        </Button>
      </div>

      {apps.length === 0 && (
        <p className="text-sm text-slate-500">
          Create an app first — promotions run against a published app.
        </p>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500" htmlFor="promo-app">
                App
              </label>
              <select
                id="promo-app"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              >
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {appLabel(apps, a.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500" htmlFor="bid">
                  Max bid / click ($)
                </label>
                <Input
                  id="bid"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={bid}
                  onChange={(e) => setBid(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500" htmlFor="budget">
                  Daily budget ($)
                </label>
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  min="1"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Daily budget must be at least one click's bid. Campaign starts in
              review; you'll see it flip to Active once approved.
            </p>
            <Button
              onClick={create}
              disabled={submitting || !appId}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </Button>
          </CardContent>
        </Card>
      )}

      {promos.length === 0 ? (
        <p className="text-sm text-slate-500">No campaigns yet.</p>
      ) : (
        <div className="space-y-3">
          {promos.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">
                    {appLabel(apps, p.appId)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatPrice(p.bidCentsPerClick, p.currency)}/click ·{" "}
                    {formatPrice(p.dailyBudgetCents, p.currency)}/day
                  </p>
                  {p.status === "paused_policy" && p.policyRejectionReason && (
                    <p className="text-xs text-rose-500">
                      Rejected: {p.policyRejectionReason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                  {p.status !== "ended" && (
                    <Button
                      variant="outline"
                      onClick={() => endPromotion(p.id)}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50"
                    >
                      End
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
