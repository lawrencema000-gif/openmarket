"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
} from "@openmarket/ui";

interface AppSubConfig {
  subscriptionEnabled?: boolean;
  subscriptionInterval?: string | null;
  subscriptionIntervalCount?: number | null;
  subscriptionTrialDays?: number | null;
}

const INTERVALS = ["day", "week", "month", "year"] as const;

export default function SubscriptionConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [interval, setIntervalValue] = useState<(typeof INTERVALS)[number]>("month");
  const [intervalCount, setIntervalCount] = useState(1);
  const [trialDays, setTrialDays] = useState(0);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const app = await api.get<AppSubConfig>(`/api/apps/${appId}`);
      setEnabled(!!app.subscriptionEnabled);
      if (app.subscriptionInterval && INTERVALS.includes(app.subscriptionInterval as never)) {
        setIntervalValue(app.subscriptionInterval as (typeof INTERVALS)[number]);
      }
      setIntervalCount(app.subscriptionIntervalCount ?? 1);
      setTrialDays(app.subscriptionTrialDays ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load app");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch(`/api/apps/${appId}/subscription`, {
        enabled,
        ...(enabled
          ? {
              interval,
              intervalCount,
              trialDays: trialDays > 0 ? trialDays : null,
            }
          : {}),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          "This app has one-time pricing set. An app is either a one-time purchase OR a subscription — clear the price on the Pricing page first.",
        );
      } else {
        setError(err instanceof ApiError ? err.message : "Could not save");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="max-w-2xl h-64 rounded-2xl bg-om-line-soft animate-pulse" />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/apps/${appId}`} className="text-sm text-om-ink-soft hover:text-om-ink-mute">
          ← App
        </Link>
        <h1 className="text-2xl font-bold text-om-ink">Subscription</h1>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>App-level subscription (P4-C)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-om-ink-soft">
            When enabled, the storefront swaps the install button for
            “Subscribe to install” — users need an active subscription to
            download. Mutually exclusive with a one-time price.
          </p>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-5 w-5 rounded border-om-line text-violet-600 focus:ring-violet-400"
            />
            <span className="text-sm font-medium text-om-ink-mute">
              Require a subscription to install this app
            </span>
          </label>

          {enabled && (
            <div className="space-y-4 rounded-xl bg-om-surface-tint border border-om-line p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-om-ink-soft" htmlFor="interval">
                    Billing interval
                  </label>
                  <select
                    id="interval"
                    value={interval}
                    onChange={(e) =>
                      setIntervalValue(e.target.value as (typeof INTERVALS)[number])
                    }
                    className="mt-1 w-full rounded-lg border border-om-line px-3 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  >
                    {INTERVALS.map((i) => (
                      <option key={i} value={i}>
                        Every {i}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-om-ink-soft" htmlFor="count">
                    Interval count (1–12)
                  </label>
                  <Input
                    id="count"
                    type="number"
                    min="1"
                    max="12"
                    value={intervalCount}
                    onChange={(e) => setIntervalCount(Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-om-ink-soft" htmlFor="trial">
                  Free trial (days, 0–30)
                </label>
                <Input
                  id="trial"
                  type="number"
                  min="0"
                  max="30"
                  value={trialDays}
                  onChange={(e) => setTrialDays(Number(e.target.value))}
                />
              </div>
              <p className="text-xs text-om-ink-soft">
                Set the per-period price on the{" "}
                <Link href={`/apps/${appId}/pricing`} className="text-violet-600 hover:underline">
                  Pricing page
                </Link>{" "}
                — the subscription charges that amount each period.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={save}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {saving ? "Saving…" : "Save subscription settings"}
            </Button>
            {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
