"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { classifyVideoUrl } from "@openmarket/contracts/preview-videos";

interface PreviewVideo {
  id: string;
  videoUrl: string;
  posterUrl: string | null;
  label: string | null;
  durationSeconds: number | null;
  sortOrder: number;
}

interface ListResponse {
  appId: string;
  previewVideos: PreviewVideo[];
}

interface EditorState {
  id: string | null;
  videoUrl: string;
  posterUrl: string;
  label: string;
  durationSeconds: string;
  sortOrder: string;
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  videoUrl: "",
  posterUrl: "",
  label: "",
  durationSeconds: "",
  sortOrder: "0",
};

export default function PreviewVideosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appId } = use(params);
  const [videos, setVideos] = useState<PreviewVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<ListResponse>(`/api/apps/${appId}/preview-videos`);
      setVideos(r.previewVideos);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(v: PreviewVideo) {
    setEditor({
      id: v.id,
      videoUrl: v.videoUrl,
      posterUrl: v.posterUrl ?? "",
      label: v.label ?? "",
      durationSeconds: v.durationSeconds?.toString() ?? "",
      sortOrder: v.sortOrder.toString(),
    });
  }

  async function save() {
    if (!editor.videoUrl) {
      setError("Video URL is required");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      videoUrl: editor.videoUrl,
      posterUrl: editor.posterUrl || undefined,
      label: editor.label || undefined,
      durationSeconds: editor.durationSeconds
        ? Number(editor.durationSeconds)
        : undefined,
      sortOrder: editor.sortOrder ? Number(editor.sortOrder) : 0,
    };
    try {
      if (editor.id) {
        await api.patch(
          `/api/apps/${appId}/preview-videos/${editor.id}`,
          payload,
        );
      } else {
        await api.post(`/api/apps/${appId}/preview-videos`, payload);
      }
      setEditor(EMPTY_EDITOR);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this preview video? This cannot be undone.")) return;
    setError(null);
    try {
      await api.delete(`/api/apps/${appId}/preview-videos/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/apps/${appId}`}
          className="text-xs text-om-primary hover:underline"
        >
          ← Back to app
        </Link>
        <h1 className="text-2xl font-bold text-om-ink mt-2">
          Preview videos
        </h1>
        <p className="text-sm text-om-ink-soft mt-1">
          Showcase your app with short videos. Accepts direct MP4/WebM URLs
          or YouTube / Vimeo page links — the storefront switches between
          a native player and an embed automatically.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="bg-om-surface rounded-xl border border-om-line p-5 space-y-3">
        <h2 className="text-sm font-semibold text-om-ink-mute">
          {videos.length === 0
            ? "No videos yet"
            : `Existing videos (${videos.length})`}
        </h2>
        {loading ? (
          <p className="text-sm text-om-ink-soft">Loading…</p>
        ) : videos.length === 0 ? (
          <p className="text-sm text-om-ink-soft italic">
            Add your first below.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {videos.map((v) => (
              <li key={v.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-om-ink truncate">
                    {v.label ?? "(no label)"}
                  </p>
                  <p className="text-xs text-om-ink-soft truncate font-mono">
                    {v.videoUrl}
                  </p>
                  <p className="text-[11px] text-om-ink-soft">
                    {kindLabel(v.videoUrl)} · sort {v.sortOrder}
                    {v.durationSeconds
                      ? ` · ${Math.floor(v.durationSeconds / 60)}:${(v.durationSeconds % 60).toString().padStart(2, "0")}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(v)}
                  className="text-xs text-om-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(v.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-om-surface rounded-xl border border-om-line p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-om-ink-mute">
            {editor.id ? "Edit video" : "Add a video"}
          </h2>
          {editor.id && (
            <button
              type="button"
              onClick={() => setEditor(EMPTY_EDITOR)}
              className="text-xs text-om-ink-soft hover:underline"
            >
              + Add new instead
            </button>
          )}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-om-ink-mute">
              Video URL <span className="text-red-600">*</span>
            </span>
            <input
              type="url"
              value={editor.videoUrl}
              onChange={(e) =>
                setEditor((s) => ({ ...s, videoUrl: e.target.value }))
              }
              placeholder="https://youtube.com/watch?v=... or https://cdn.example.com/trailer.mp4"
              className="mt-1 block w-full rounded-md border-om-line text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-om-ink-mute">
              Poster image URL
            </span>
            <input
              type="url"
              value={editor.posterUrl}
              onChange={(e) =>
                setEditor((s) => ({ ...s, posterUrl: e.target.value }))
              }
              placeholder="(optional — shown before the user clicks play)"
              className="mt-1 block w-full rounded-md border-om-line text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-om-ink-mute">Label</span>
            <input
              type="text"
              value={editor.label}
              onChange={(e) =>
                setEditor((s) => ({ ...s, label: e.target.value }))
              }
              placeholder='e.g. "Gameplay trailer" or "30-second tour"'
              className="mt-1 block w-full rounded-md border-om-line text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-om-ink-mute">
                Duration (seconds)
              </span>
              <input
                type="number"
                min={1}
                value={editor.durationSeconds}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, durationSeconds: e.target.value }))
                }
                className="mt-1 block w-full rounded-md border-om-line text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-om-ink-mute">
                Sort order
              </span>
              <input
                type="number"
                min={0}
                value={editor.sortOrder}
                onChange={(e) =>
                  setEditor((s) => ({ ...s, sortOrder: e.target.value }))
                }
                className="mt-1 block w-full rounded-md border-om-line text-sm"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !editor.videoUrl}
            className="rounded-md bg-om-primary hover:bg-om-primary-deep disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
          >
            {saving ? "Saving…" : editor.id ? "Save changes" : "Add video"}
          </button>
        </div>
      </section>
    </div>
  );
}

function kindLabel(url: string): string {
  const kind = classifyVideoUrl(url).kind;
  switch (kind) {
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    default:
      return "direct video";
  }
}
