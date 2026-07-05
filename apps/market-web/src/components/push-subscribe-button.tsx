"use client";

import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

interface PushSubscribeButtonProps {
  onChanged?: () => void;
}

/**
 * Web Push subscribe / unsubscribe entry point. The actual VAPID
 * public key lives in NEXT_PUBLIC_VAPID_PUBLIC_KEY; when unset (local
 * dev) the button explains the missing config and is disabled.
 *
 * Flow:
 *   1. Check browser support + current permission
 *   2. On click → request permission, register a Service Worker if
 *      not already registered, then subscribe via
 *      `pushManager.subscribe`
 *   3. POST the resulting subscription JSON to
 *      /api/users/me/push-subscriptions
 *
 * The service-worker file is expected to live at
 * /push-service-worker.js (placeholder shipped under public/). The
 * SDK boilerplate ("show notification" handler) gets added in a
 * follow-up commit.
 */
export function PushSubscribeButton({ onChanged }: PushSubscribeButtonProps) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    void navigator.serviceWorker
      .getRegistration("/push-service-worker.js")
      .then(async (reg) => {
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      })
      .catch(() => {});
  }, []);

  async function subscribe() {
    if (!vapidPublicKey) {
      setError(
        "Browser push is not configured on this OpenMarket instance (missing VAPID key).",
      );
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(
          "Permission denied — enable notifications in browser settings to subscribe.",
        );
      }
      const reg =
        (await navigator.serviceWorker.getRegistration(
          "/push-service-worker.js",
        )) ?? (await navigator.serviceWorker.register("/push-service-worker.js"));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // DOM lib types reject Uint8Array<ArrayBufferLike> for the
        // BufferSource union — pass the underlying ArrayBuffer slice.
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
          .buffer as ArrayBuffer,
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await apiFetch("/api/users/me/push-subscriptions", {
        method: "POST",
        body: JSON.stringify(json),
      });
      setSubscribed(true);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscribe failed");
    } finally {
      setWorking(false);
    }
  }

  async function unsubscribe() {
    setWorking(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(
        "/push-service-worker.js",
      );
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      // The DELETE endpoint requires the subscription DB id, which
      // we don't carry here — the parent page re-fetches the list
      // and offers per-row removal. We just toggle the local flag.
      setSubscribed(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unsubscribe failed");
    } finally {
      setWorking(false);
    }
  }

  if (!supported) {
    return (
      <span className="text-xs text-om-ink-soft italic">
        Browser push not supported in this browser.
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={working}
        onClick={() => void (subscribed ? unsubscribe() : subscribe())}
        className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
          subscribed
            ? "bg-om-surface border-om-line text-om-ink-mute hover:bg-om-surface-tint"
            : "bg-om-primary border-om-primary text-white hover:bg-om-primary-deep"
        } disabled:opacity-60`}
      >
        {working
          ? "…"
          : subscribed
            ? "Unsubscribe this browser"
            : "Enable browser push"}
      </button>
      {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
