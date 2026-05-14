"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { PushSubscribeButton } from "@/components/push-subscribe-button";

interface NotificationPreferences {
  email: {
    releaseUpdate: boolean;
    securityAlert: boolean;
    reviewReply: boolean;
    marketing: boolean;
  };
  push: {
    releaseUpdate: boolean;
    securityAlert: boolean;
    reviewReply: boolean;
    marketing: boolean;
  };
}

interface SubscriptionRow {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface NotificationLogRow {
  id: string;
  type: "release_update" | "security_alert" | "review_reply" | "account";
  status: "sent" | "delivered" | "failed" | "skipped";
  payload: { title: string; body: string; url?: string };
  sentAt: string;
}

const TYPE_LABELS: Record<keyof NotificationPreferences["email"], string> = {
  releaseUpdate: "App updates",
  securityAlert: "Security alerts",
  reviewReply: "Replies to your reviews",
  marketing: "Product news (rare)",
};

const TYPE_HELP: Record<keyof NotificationPreferences["email"], string> = {
  releaseUpdate: "A new version is available for an app in your library.",
  securityAlert: "An app in your library was delisted or flagged.",
  reviewReply: "A developer replied to a review you posted.",
  marketing: "Occasional product announcements from OpenMarket.",
};

export default function NotificationsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [log, setLog] = useState<NotificationLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/sign-in?next=/account/notifications");
      return;
    }
    void load();
  }, [isPending, session, router]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, s, n] = await Promise.all([
        apiFetch<NotificationPreferences>("/api/users/me/notification-preferences"),
        apiFetch<{ subscriptions: SubscriptionRow[] }>(
          "/api/users/me/push-subscriptions",
        ),
        apiFetch<{ notifications: NotificationLogRow[] }>(
          "/api/users/me/notifications",
        ),
      ]);
      setPrefs(p);
      setSubs(s.subscriptions);
      setLog(n.notifications);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function flip(
    channel: "email" | "push",
    key: keyof NotificationPreferences["email"],
    value: boolean,
  ) {
    if (!prefs) return;
    const next = {
      ...prefs,
      [channel]: { ...prefs[channel], [key]: value },
    };
    setPrefs(next);
    try {
      const saved = await apiFetch<NotificationPreferences>(
        "/api/users/me/notification-preferences",
        { method: "PATCH", body: JSON.stringify({ [channel]: { [key]: value } }) },
      );
      setPrefs(saved);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function revokeSub(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/users/me/push-subscriptions/${id}`, { method: "DELETE" });
      setSubs((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Revoke failed");
    }
  }

  if (loading || isPending)
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-gray-500">
        Loading…
      </div>
    );
  if (!prefs) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <div>
        <Link href="/account" className="text-xs text-blue-600 hover:underline">
          ← Back to account
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">
          Control which OpenMarket emails and browser pushes you receive.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Preferences */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Preferences</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 text-left">
              <th className="font-medium pb-2">Category</th>
              <th className="font-medium pb-2 w-20 text-center">Email</th>
              <th className="font-medium pb-2 w-20 text-center">Push</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map(
              (key) => (
                <tr key={key} className="align-top">
                  <td className="py-3">
                    <p className="font-medium text-gray-900">
                      {TYPE_LABELS[key]}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {TYPE_HELP[key]}
                    </p>
                  </td>
                  <td className="py-3 text-center">
                    <input
                      type="checkbox"
                      checked={prefs.email[key]}
                      onChange={(e) => void flip("email", key, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="py-3 text-center">
                    <input
                      type="checkbox"
                      checked={prefs.push[key]}
                      onChange={(e) => void flip("push", key, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <p
          role="status"
          aria-live="polite"
          className="text-[11px] text-emerald-700 min-h-[1rem]"
        >
          {savedAt ? "Saved." : ""}
        </p>
      </section>

      {/* Subscriptions */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900">
            Subscribed devices
          </h2>
          <PushSubscribeButton onChanged={() => void load()} />
        </div>
        {subs.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            No browsers subscribed yet. Click "Enable browser push" above to add
            this device.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {subs.map((s) => (
              <li
                key={s.id}
                className="py-3 flex items-baseline justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {summarizeUserAgent(s.userAgent)}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Added {new Date(s.createdAt).toLocaleDateString()} · last
                    active {new Date(s.lastSeenAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revokeSub(s.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent log */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Recent notifications
        </h2>
        {log.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            Nothing recent. Notifications appear here once we send any.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {log.map((n) => (
              <li key={n.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">
                    {n.payload.title}
                  </p>
                  <span className="text-[10px] text-gray-400">
                    {new Date(n.sentAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{n.payload.body}</p>
                {n.status !== "sent" ? (
                  <p className="text-[10px] uppercase font-semibold text-amber-700 mt-0.5">
                    {n.status}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown browser";
  // Order matters — Edge contains "Chrome" too.
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/")) return "Safari";
  return "Browser";
}
