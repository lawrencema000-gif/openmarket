"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

type Rating = "everyone" | "teen" | "mature";

interface ChildEntry {
  id: string;
  email: string;
  displayName: string | null;
  maxContentRating: Rating;
  unlinkedAt: string | null;
  linkedAt: string;
}

interface ControlsResponse {
  userId: string;
  role: "parent" | "child";
  pinSet: boolean;
  parentUserId: string | null;
  maxContentRating: Rating;
  pendingInviteEmail?: string | null;
  lockedUntil?: string | null;
  children?: ChildEntry[];
}

const RATING_LABELS: Record<Rating, string> = {
  everyone: "Everyone (most restrictive)",
  teen: "Teen — block mature only",
  mature: "Mature — no PIN gate",
};

/**
 * Parental controls settings (P3-F).
 *
 * One page that doubles as the parent's settings dashboard AND the
 * child's read-only view of "what your parent allows". Role is
 * determined by the API row's `role` field.
 */
export default function ParentalControlsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [data, setData] = useState<ControlsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Form state
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [rating, setRating] = useState<Rating>("everyone");
  const [inviteEmail, setInviteEmail] = useState("");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [acceptToken, setAcceptToken] = useState("");

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/sign-in?next=/account/parental-controls");
      return;
    }
    void load();
  }, [isPending, session, router]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<ControlsResponse>(
        "/api/users/me/parental-controls",
      );
      setData(r);
      setRating(r.maxContentRating);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function savePinAndRating() {
    setError(null);
    if (pin && pin !== confirmPin) {
      setError("PIN and confirmation don't match");
      return;
    }
    try {
      await apiFetch("/api/users/me/parental-controls", {
        method: "PATCH",
        body: JSON.stringify({
          pin: pin || undefined,
          maxContentRating: rating,
        }),
      });
      setPin("");
      setConfirmPin("");
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function invite() {
    setError(null);
    setLinkToken(null);
    try {
      const r = await apiFetch<{ token: string; acceptUrl: string }>(
        "/api/users/me/parental-controls/invites",
        { method: "POST", body: JSON.stringify({ email: inviteEmail }) },
      );
      setLinkToken(r.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invite failed");
    }
  }

  async function acceptLink() {
    setError(null);
    try {
      await apiFetch("/api/users/me/parental-controls/accept-link", {
        method: "POST",
        body: JSON.stringify({ token: acceptToken }),
      });
      setAcceptToken("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Accept failed");
    }
  }

  async function unlinkChild(childId: string) {
    if (!confirm("Unlink this child? They'll keep their account but lose the rating gate.")) return;
    setError(null);
    try {
      await apiFetch(
        `/api/users/me/parental-controls/unlink/${childId}`,
        { method: "POST" },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unlink failed");
    }
  }

  if (loading || isPending)
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-om-ink-soft">
        Loading…
      </div>
    );
  if (!data) return null;

  const isChild = data.role === "child" && data.parentUserId;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <div>
        <Link href="/account" className="text-xs text-om-primary hover:underline">
          ← Back to account
        </Link>
        <h1 className="text-2xl font-bold text-om-ink mt-2">
          Parental controls
        </h1>
        <p className="text-sm text-om-ink-soft mt-1">
          {isChild
            ? "Your account is supervised. Some apps may require a parent's PIN to install."
            : "Set a PIN and content-rating ceiling, then link a child account for supervision."}
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!isChild ? (
        <section className="rounded-xl border border-om-line bg-om-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-om-ink">PIN + rating</h2>
          <p className="text-xs text-om-ink-soft">
            Status: PIN is{" "}
            <strong>{data.pinSet ? "set" : "not yet set"}</strong>.
            {data.lockedUntil ? (
              <span className="ml-2 text-amber-700">
                Locked until {new Date(data.lockedUntil).toLocaleString()}.
              </span>
            ) : null}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-om-ink-mute">
                {data.pinSet ? "Change PIN" : "Set PIN"}
              </span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="4–8 digits"
                className="mt-1 block w-full rounded-md border-om-line text-sm font-mono tracking-widest"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-om-ink-mute">
                Confirm PIN
              </span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
                className="mt-1 block w-full rounded-md border-om-line text-sm font-mono tracking-widest"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-om-ink-mute">
              Max content rating for linked children
            </span>
            <select
              value={rating}
              onChange={(e) => setRating(e.target.value as Rating)}
              className="mt-1 block w-full rounded-md border-om-line text-sm"
            >
              {(Object.keys(RATING_LABELS) as Rating[]).map((r) => (
                <option key={r} value={r}>
                  {RATING_LABELS[r]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void savePinAndRating()}
            className="rounded-md bg-om-primary hover:bg-om-primary-deep text-white text-sm font-medium px-4 py-2"
          >
            Save settings
          </button>
          <span
            role="status"
            aria-live="polite"
            className="ml-3 text-xs text-emerald-700"
          >
            {savedAt && Date.now() - savedAt < 4000 ? "Saved." : ""}
          </span>
        </section>
      ) : null}

      {!isChild ? (
        <section className="rounded-xl border border-om-line bg-om-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-om-ink">Linked children</h2>
          {data.children && data.children.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {data.children.map((ch) => (
                <li
                  key={ch.id}
                  className="py-2 flex items-baseline justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-om-ink truncate">
                      {ch.displayName ?? ch.email}
                    </p>
                    <p className="text-xs text-om-ink-soft">
                      Linked {new Date(ch.linkedAt).toLocaleDateString()}
                      {ch.unlinkedAt
                        ? ` · unlinked ${new Date(ch.unlinkedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  {!ch.unlinkedAt && (
                    <button
                      type="button"
                      onClick={() => void unlinkChild(ch.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Unlink
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-om-ink-soft italic">No children linked yet.</p>
          )}

          <div className="border-t border-om-line-soft pt-4 space-y-2">
            <p className="text-xs font-medium text-om-ink-mute">
              Invite a child
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="child's openmarket email"
                className="flex-1 rounded-md border-om-line text-sm"
              />
              <button
                type="button"
                onClick={() => void invite()}
                disabled={!inviteEmail || !data.pinSet}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-om-primary text-white hover:bg-om-primary-deep disabled:opacity-50"
              >
                Generate token
              </button>
            </div>
            {!data.pinSet && (
              <p className="text-[11px] text-amber-700">
                Set a PIN above before inviting a child.
              </p>
            )}
            {linkToken && (
              <p className="text-xs text-om-ink-mute bg-om-surface-tint border border-om-line rounded-md p-2 font-mono break-all">
                Hand this token to the child: <strong>{linkToken}</strong>
              </p>
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-om-line bg-om-surface p-5 space-y-3">
        <h2 className="text-sm font-semibold text-om-ink">
          Accept a parental link
        </h2>
        <p className="text-xs text-om-ink-soft">
          If your parent gave you a link token, paste it here to become a
          supervised child account.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={acceptToken}
            onChange={(e) => setAcceptToken(e.target.value)}
            placeholder="om_link_..."
            className="flex-1 rounded-md border-om-line text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => void acceptLink()}
            disabled={!acceptToken}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-om-primary text-white hover:bg-om-primary-deep disabled:opacity-50"
          >
            Accept
          </button>
        </div>
      </section>
    </div>
  );
}
