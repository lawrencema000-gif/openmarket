"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError, API_URL } from "@/lib/api";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  shareToken: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

interface ListResponse {
  appId: string;
  channels: Channel[];
}

interface ReleaseSummary {
  id: string;
  versionName: string;
  versionCode: number;
  channel: string;
  status: string;
}

interface PinnedRelease {
  id: string;
  versionName: string;
  versionCode: number;
}

interface PublicPayload {
  releases: PinnedRelease[];
}

const STOREFRONT_URL =
  process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000";

/**
 * Distribution channel management (P3-H).
 *
 * Devs create channels with a private share URL, pin specific releases,
 * and hand the URL out to testers. Revocation is a soft delete — the
 * row stays for audit but the public URL returns 410.
 */
export default function DistributionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [releases, setReleases] = useState<ReleaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [list, rls] = await Promise.all([
        api.get<ListResponse>(`/api/apps/${appId}/distribution-channels`),
        api.get<ReleaseSummary[]>(`/api/apps/${appId}/releases`).catch(() => []),
      ]);
      setChannels(list.channels);
      setReleases(rls);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function createChannel() {
    if (!newName.trim()) {
      setError("Channel name required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await api.post(`/api/apps/${appId}/distribution-channels`, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setNewName("");
      setNewDescription("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function revokeChannel(id: string) {
    if (!confirm("Revoke this channel? The share URL will stop working immediately.")) return;
    setError(null);
    try {
      await api.delete(`/api/apps/${appId}/distribution-channels/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Revoke failed");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-blue-600 hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          Distribution channels
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Share private builds with testers via secret URLs. Each channel
          has its own share link and can pin one or more releases. Revoke
          a channel anytime to kill the URL immediately.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Create a channel</h2>
        <div className="space-y-2">
          <input
            type="text"
            placeholder='Name — e.g. "Internal alpha"'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="block w-full rounded-md border-gray-300 text-sm"
          />
          <textarea
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            className="block w-full rounded-md border-gray-300 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void createChannel()}
          disabled={creating || !newName.trim()}
          className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
        >
          {creating ? "Creating…" : "Create channel"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          {loading
            ? "Loading…"
            : channels.length === 0
              ? "No channels yet"
              : `Channels (${channels.length})`}
        </h2>
        {channels.map((ch) => (
          <ChannelCard
            key={ch.id}
            appId={appId}
            channel={ch}
            releases={releases}
            onChange={() => void load()}
            onRevoke={() => void revokeChannel(ch.id)}
          />
        ))}
      </section>
    </div>
  );
}

function ChannelCard({
  appId,
  channel,
  releases,
  onChange,
  onRevoke,
}: {
  appId: string;
  channel: Channel;
  releases: ReleaseSummary[];
  onChange: () => void;
  onRevoke: () => void;
}) {
  const [pinned, setPinned] = useState<PinnedRelease[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [working, setWorking] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const shareUrl = `${STOREFRONT_URL}/distribution/${channel.shareToken}`;
  const isActive = !channel.revokedAt;

  useEffect(() => {
    if (!isActive) return;
    void loadPinned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  async function loadPinned() {
    try {
      const res = await fetch(`${API_URL}/api/distribution/${channel.shareToken}`);
      if (!res.ok) return;
      const data = (await res.json()) as PublicPayload;
      setPinned(data.releases);
    } catch {
      // soft fail
    }
  }

  async function pin() {
    if (!selectedReleaseId) return;
    setWorking(true);
    try {
      await fetch(
        `${API_URL}/api/apps/${appId}/distribution-channels/${channel.id}/releases`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ releaseId: selectedReleaseId }),
        },
      );
      setSelectedReleaseId("");
      await loadPinned();
      onChange();
    } finally {
      setWorking(false);
    }
  }

  async function unpin(releaseId: string) {
    setWorking(true);
    try {
      await fetch(
        `${API_URL}/api/apps/${appId}/distribution-channels/${channel.id}/releases/${releaseId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      await loadPinned();
      onChange();
    } finally {
      setWorking(false);
    }
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyHint("Copied!");
      setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint("Copy failed — select manually");
      setTimeout(() => setCopyHint(null), 3000);
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white p-5 space-y-3 ${isActive ? "border-gray-200" : "border-gray-200 opacity-60"}`}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-900">{channel.name}</p>
          {channel.description ? (
            <p className="text-xs text-gray-500 mt-0.5">{channel.description}</p>
          ) : null}
        </div>
        {isActive ? (
          <button
            type="button"
            onClick={onRevoke}
            className="text-xs text-red-600 hover:underline"
          >
            Revoke
          </button>
        ) : (
          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
            revoked {channel.revokedAt ? new Date(channel.revokedAt).toLocaleDateString() : ""}
          </span>
        )}
      </div>

      {isActive ? (
        <div className="flex items-center gap-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs">
          <code className="font-mono flex-1 truncate text-gray-700">
            {shareUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyShareUrl()}
            className="text-blue-600 hover:underline shrink-0"
          >
            {copyHint ?? "Copy"}
          </button>
        </div>
      ) : null}

      {isActive ? (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-1.5">
            Pinned builds ({pinned.length})
          </p>
          {pinned.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No builds pinned yet.</p>
          ) : (
            <ul className="space-y-1">
              {pinned.map((r) => (
                <li
                  key={r.id}
                  className="flex items-baseline justify-between text-xs"
                >
                  <span>
                    v{r.versionName}{" "}
                    <span className="text-gray-400 font-mono">
                      ({r.versionCode})
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void unpin(r.id)}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    Unpin
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <select
              value={selectedReleaseId}
              onChange={(e) => setSelectedReleaseId(e.target.value)}
              className="flex-1 text-xs rounded-md border border-gray-200 px-2 py-1.5"
            >
              <option value="">Pick a release to pin…</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.versionName} ({r.versionCode}) — {r.channel}/{r.status}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedReleaseId || working}
              onClick={() => void pin()}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Pin
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-[10px] text-gray-400">
        Created {new Date(channel.createdAt).toLocaleDateString()}
        {channel.expiresAt
          ? ` · expires ${new Date(channel.expiresAt).toLocaleDateString()}`
          : ""}
      </p>
    </div>
  );
}
