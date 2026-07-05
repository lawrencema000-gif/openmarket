"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

type Role = "owner" | "admin" | "developer" | "viewer";

interface Member {
  id: string;
  invitedEmail: string;
  role: Role;
  acceptedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  userEmail: string | null;
  userDisplayName: string | null;
}

interface TeamResponse {
  developer: { id: string; displayName: string | null; email: string };
  callerRole: Role;
  implicitOwner: { email: string; role: "owner" };
  members: Member[];
}

const ROLE_ORDER: Role[] = ["viewer", "developer", "admin", "owner"];

function roleSatisfies(actual: Role, required: Role): boolean {
  return ROLE_ORDER.indexOf(actual) >= ROLE_ORDER.indexOf(required);
}

export default function TeamPage() {
  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("developer");
  const [inviting, setInviting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<TeamResponse>("/api/developers/me/team");
      setData(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.post("/api/developers/me/team/invites", {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this member's access?")) return;
    setError(null);
    try {
      await api.delete(`/api/developers/me/team/members/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Revoke failed");
    }
  }

  if (loading) return <p className="text-sm text-om-ink-soft">Loading…</p>;
  if (!data) {
    return (
      <p className="text-sm text-red-600">
        Could not load team. {error ?? "Sign in or retry."}
      </p>
    );
  }

  const canManage = roleSatisfies(data.callerRole, "admin");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-om-ink">Team</h1>
        <p className="text-sm text-om-ink-soft mt-1">
          Manage who has access to{" "}
          <strong>{data.developer.displayName ?? data.developer.email}</strong>.
          You are signed in as <RoleChip role={data.callerRole} />.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-om-surface border border-om-line rounded-xl divide-y divide-gray-100">
        <Row
          email={data.implicitOwner.email}
          role={data.implicitOwner.role}
          sub="Publisher owner — implicit"
          right={null}
        />
        {data.members.map((m) => {
          const pending = !m.acceptedAt;
          return (
            <Row
              key={m.id}
              email={m.userEmail ?? m.invitedEmail}
              role={m.role}
              displayName={m.userDisplayName ?? undefined}
              sub={
                pending
                  ? `Pending invite · expires ${m.expiresAt ? new Date(m.expiresAt).toLocaleDateString() : "—"}`
                  : `Joined ${m.acceptedAt ? new Date(m.acceptedAt).toLocaleDateString() : ""}`
              }
              right={
                canManage && m.role !== "owner" ? (
                  <button
                    type="button"
                    onClick={() => revoke(m.id)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    {pending ? "Cancel invite" : "Remove"}
                  </button>
                ) : null
              }
            />
          );
        })}
      </div>

      {canManage && (
        <form
          onSubmit={invite}
          className="bg-om-surface border border-om-line rounded-xl p-5 space-y-3"
        >
          <h2 className="text-sm font-semibold text-om-ink">Invite by email</h2>
          <div className="flex gap-2 flex-wrap">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="flex-1 min-w-[200px] border border-om-line rounded-md px-3 py-2 text-sm"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="border border-om-line rounded-md px-3 py-2 text-sm"
            >
              <option value="admin">admin</option>
              <option value="developer">developer</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="bg-om-primary hover:bg-om-primary-deep text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>
          <p className="text-xs text-om-ink-soft">
            Invites expire in 7 days. The accepting user must sign in with
            this exact email address.
          </p>
        </form>
      )}
    </div>
  );
}

function Row({
  email,
  role,
  displayName,
  sub,
  right,
}: {
  email: string;
  role: Role;
  displayName?: string;
  sub: string;
  right: React.ReactNode;
}) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-om-ink">
          {displayName ? (
            <>
              {displayName}{" "}
              <span className="text-om-ink-soft font-normal">({email})</span>
            </>
          ) : (
            email
          )}
        </p>
        <p className="text-xs text-om-ink-soft">{sub}</p>
      </div>
      <div className="flex items-center gap-3">
        <RoleChip role={role} />
        {right}
      </div>
    </div>
  );
}

function RoleChip({ role }: { role: Role }) {
  const tone =
    role === "owner"
      ? "bg-violet-100 text-violet-700"
      : role === "admin"
        ? "bg-om-primary/15 text-om-primary"
        : role === "developer"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-om-line-soft text-om-ink-mute";
  return (
    <span
      className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-full ${tone}`}
    >
      {role}
    </span>
  );
}
