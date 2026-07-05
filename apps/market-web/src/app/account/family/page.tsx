"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

interface FamilyMember {
  id: string;
  userId: string | null;
  role: "owner" | "member";
  email: string | null;
  displayName: string | null;
  pending: boolean;
  invitedAt: string;
  acceptedAt: string | null;
  inviteToken: string | null;
}

interface FamilyGroupResponse {
  group: {
    id: string;
    name: string;
    ownerUserId: string;
    createdAt: string;
  } | null;
  role: "owner" | "member" | null;
  members: FamilyMember[];
}

/**
 * Family-sharing settings (P3-E).
 *
 * Three shape variants on this page:
 *   1. user is in no group — show "create group" + "accept invite" UIs
 *   2. user is owner — show member list + invite form + disband button
 *   3. user is member — show owner / fellow members read-only
 */
export default function FamilyPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [data, setData] = useState<FamilyGroupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("My family");
  const [inviteEmail, setInviteEmail] = useState("");
  const [acceptToken, setAcceptToken] = useState("");

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/sign-in?next=/account/family");
      return;
    }
    void load();
  }, [isPending, session, router]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<FamilyGroupResponse>("/api/users/me/family-group");
      setData(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    setError(null);
    try {
      await apiFetch("/api/users/me/family-group", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    }
  }

  async function invite() {
    if (!data?.group) return;
    setError(null);
    try {
      await apiFetch(`/api/family-groups/${data.group.id}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invite failed");
    }
  }

  async function removeMember(userId: string) {
    if (!data?.group) return;
    if (!confirm("Remove this member? Shared apps stay installed on their device.")) return;
    try {
      await apiFetch(
        `/api/family-groups/${data.group.id}/members/${userId}`,
        { method: "DELETE" },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Remove failed");
    }
  }

  async function disband() {
    if (!data?.group) return;
    if (!confirm("Disband this family group? All members lose access to your shared apps.")) return;
    try {
      await apiFetch(`/api/family-groups/${data.group.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Disband failed");
    }
  }

  async function acceptInvite() {
    setError(null);
    try {
      await apiFetch("/api/family-groups/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token: acceptToken.trim() }),
      });
      setAcceptToken("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Accept failed");
    }
  }

  if (loading || isPending)
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-om-ink-soft">
        Loading…
      </div>
    );
  if (!data) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <div>
        <Link href="/account" className="text-xs text-om-primary hover:underline">
          ← Back to account
        </Link>
        <h1 className="text-2xl font-bold text-om-ink mt-2">Family sharing</h1>
        <p className="text-sm text-om-ink-soft mt-1">
          Share installed apps with up to 4 family members. Only apps the
          developer has opted into sharing will appear in members' libraries.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!data.group && (
        <>
          <section className="rounded-xl border border-om-line bg-om-surface p-5 space-y-3">
            <h2 className="text-sm font-semibold text-om-ink">
              Create a family group
            </h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="block w-full rounded-md border-om-line text-sm"
            />
            <button
              type="button"
              onClick={() => void createGroup()}
              className="rounded-md bg-om-primary hover:bg-om-primary-deep text-white text-sm font-medium px-4 py-2"
            >
              Create group
            </button>
          </section>

          <section className="rounded-xl border border-om-line bg-om-surface p-5 space-y-3">
            <h2 className="text-sm font-semibold text-om-ink">
              Accept an invite
            </h2>
            <p className="text-xs text-om-ink-soft">
              Paste the token a family owner shared with you.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={acceptToken}
                onChange={(e) => setAcceptToken(e.target.value)}
                placeholder="om_fam_..."
                className="flex-1 rounded-md border-om-line text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => void acceptInvite()}
                disabled={!acceptToken}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-om-primary text-white hover:bg-om-primary-deep disabled:opacity-50"
              >
                Accept
              </button>
            </div>
          </section>
        </>
      )}

      {data.group && (
        <section className="rounded-xl border border-om-line bg-om-surface p-5 space-y-4">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-om-ink">
                {data.group.name}
              </h2>
              <p className="text-xs text-om-ink-soft">
                Your role: <strong>{data.role}</strong>
              </p>
            </div>
            {data.role === "owner" && (
              <button
                type="button"
                onClick={() => void disband()}
                className="text-xs text-red-600 hover:underline"
              >
                Disband group
              </button>
            )}
          </div>

          <ul className="divide-y divide-gray-100">
            {data.members.map((m) => (
              <li
                key={m.id}
                className="py-2 flex items-baseline justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-om-ink truncate">
                    {m.displayName ?? m.email ?? "—"}{" "}
                    <span className="text-xs text-om-ink-soft font-normal">
                      ({m.role})
                    </span>
                  </p>
                  <p className="text-xs text-om-ink-soft">
                    {m.pending
                      ? `Pending — invited ${new Date(m.invitedAt).toLocaleDateString()}`
                      : `Joined ${m.acceptedAt ? new Date(m.acceptedAt).toLocaleDateString() : ""}`}
                  </p>
                  {m.pending && m.inviteToken ? (
                    <p className="text-[11px] font-mono text-om-ink-soft mt-0.5 truncate">
                      Token: {m.inviteToken}
                    </p>
                  ) : null}
                </div>
                {data.role === "owner" && m.role !== "owner" && !m.pending && m.userId ? (
                  <button
                    type="button"
                    onClick={() => void removeMember(m.userId!)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {data.role === "owner" && (
            <div className="border-t border-om-line-soft pt-3 space-y-2">
              <p className="text-xs font-medium text-om-ink-mute">
                Invite a family member
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member's openmarket email"
                  className="flex-1 rounded-md border-om-line text-sm"
                />
                <button
                  type="button"
                  onClick={() => void invite()}
                  disabled={!inviteEmail}
                  className="text-xs font-medium px-3 py-1.5 rounded-md bg-om-primary text-white hover:bg-om-primary-deep disabled:opacity-50"
                >
                  Send invite
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
