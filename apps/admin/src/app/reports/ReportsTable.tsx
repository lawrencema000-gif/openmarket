"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@openmarket/ui";
import { ReportResolveDrawer } from "./ReportResolveDrawer";
import { BulkActionBar } from "./BulkActionBar";

type ReportStatus = "open" | "investigating" | "resolved" | "dismissed";

interface AdminReport {
  id: string;
  status: ReportStatus;
  reportType?: string;
  description?: string | null;
  targetType?: string;
  targetId?: string;
  reporterId?: string;
  resolutionNotes?: string | null;
  createdAt?: string;
  resolvedAt?: string | null;
}

function typeBadgeClass(type?: string): string {
  switch (type?.toLowerCase()) {
    case "malware": return "bg-red-100 text-red-700";
    case "scam": return "bg-orange-100 text-orange-700";
    case "impersonation": return "bg-fuchsia-100 text-fuchsia-700";
    case "illegal": return "bg-rose-100 text-rose-700";
    case "spam": return "bg-amber-100 text-amber-700";
    case "broken": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

/**
 * Interactive reports queue. Owns:
 *   - per-row selection state (checkbox column)
 *   - select-all toggle in the header
 *   - bulk-action footer bar (mounted when ≥1 selected)
 *   - keyboard shortcuts:
 *       j / ArrowDown   move cursor down a row
 *       k / ArrowUp     move cursor up a row
 *       x / Space       toggle selection on the cursor row
 *       a               select-all toggle
 *       Esc             clear selection
 *
 * The cursor is a visual ring on a single row; selection is the
 * persistent set the bulk bar acts on. Each row also still has its
 * own one-off Resolve drawer for the "I only want to act on this one"
 * case.
 */
export function ReportsTable({ items }: { items: AdminReport[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);

  // If the underlying list shrinks (refresh after bulk action), keep the
  // cursor in bounds.
  useEffect(() => {
    if (cursor >= items.length) setCursor(Math.max(0, items.length - 1));
  }, [items.length, cursor]);

  // Drop selections that aren't in the current list anymore (post-
  // resolve refresh).
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      const live = new Set(items.map((r) => r.id));
      for (const id of prev) if (live.has(id)) next.add(id);
      return next;
    });
  }, [items]);

  // Resolvable rows are the ones bulk actions can target.
  const resolvableIds = useMemo(
    () =>
      items
        .filter((r) => r.status === "open" || r.status === "investigating")
        .map((r) => r.id),
    [items],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllResolvable() {
    const everySelected = resolvableIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of resolvableIds) {
        if (everySelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  // Keyboard shortcuts. We attach to document so the moderator
  // doesn't have to focus the table first. Skip when an input/
  // textarea is focused so typing into the Resolve drawer doesn't
  // get hijacked by `j` / `e`.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName ?? "";
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (t as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        setCursor((c) => Math.min(items.length - 1, c + 1));
        e.preventDefault();
      } else if (e.key === "k" || e.key === "ArrowUp") {
        setCursor((c) => Math.max(0, c - 1));
        e.preventDefault();
      } else if (e.key === "x" || e.key === " ") {
        const row = items[cursor];
        if (
          row &&
          (row.status === "open" || row.status === "investigating")
        ) {
          toggle(row.id);
        }
        e.preventDefault();
      } else if (e.key === "a") {
        toggleAllResolvable();
        e.preventDefault();
      } else if (e.key === "Escape") {
        setSelected(new Set());
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const allResolvableSelected =
    resolvableIds.length > 0 &&
    resolvableIds.every((id) => selected.has(id));

  return (
    <>
      <div className="rounded-lg bg-blue-50/70 border border-blue-100 px-3 py-2 text-[11px] text-blue-900 font-mono w-fit">
        keyboard · <kbd className="px-1 rounded bg-white border border-blue-200">j</kbd>{" "}
        <kbd className="px-1 rounded bg-white border border-blue-200">k</kbd> move ·{" "}
        <kbd className="px-1 rounded bg-white border border-blue-200">x</kbd> select ·{" "}
        <kbd className="px-1 rounded bg-white border border-blue-200">a</kbd> all ·{" "}
        <kbd className="px-1 rounded bg-white border border-blue-200">Esc</kbd> clear
      </div>

      {resolvableIds.length > 0 && (
        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={allResolvableSelected}
            onChange={toggleAllResolvable}
            className="h-4 w-4 text-blue-600 rounded border-gray-300"
          />
          Select all open / investigating ({resolvableIds.length})
        </label>
      )}

      <div className="space-y-3 pb-28">
        {items.map((report, idx) => {
          const isResolved =
            report.status === "resolved" || report.status === "dismissed";
          const isSelectable = !isResolved;
          const isChecked = selected.has(report.id);
          const isCursor = idx === cursor;

          return (
            <div
              key={report.id}
              className={`bg-white rounded-xl border p-5 transition-all ${
                isCursor
                  ? "border-blue-300 ring-2 ring-blue-200"
                  : isChecked
                    ? "border-blue-200 bg-blue-50/30"
                    : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setCursor(idx)}
            >
              <div className="flex items-start gap-4">
                {isSelectable && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(report.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select report ${report.id}`}
                    className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <StatusBadge status={report.status} />
                    {report.reportType && (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeBadgeClass(
                          report.reportType,
                        )}`}
                      >
                        {report.reportType}
                      </span>
                    )}
                    {report.targetType && (
                      <span className="text-xs text-gray-500">
                        Target:{" "}
                        <span className="font-medium text-gray-700">
                          {report.targetType}
                          {report.targetId
                            ? ` · ${report.targetId.slice(0, 8)}`
                            : ""}
                        </span>
                      </span>
                    )}
                  </div>
                  {report.description && (
                    <p className="text-sm text-gray-700 leading-relaxed mb-2 whitespace-pre-line">
                      {report.description}
                    </p>
                  )}
                  {report.resolutionNotes && (
                    <p className="text-xs text-gray-500 mt-1 italic">
                      Resolution: {report.resolutionNotes}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {report.createdAt
                      ? new Date(report.createdAt).toLocaleString()
                      : "—"}
                    {report.resolvedAt && (
                      <>
                        {" · resolved "}
                        {new Date(report.resolvedAt).toLocaleString()}
                      </>
                    )}
                  </p>
                </div>
                <ReportResolveDrawer
                  reportId={report.id}
                  disabled={isResolved}
                />
              </div>
            </div>
          );
        })}
      </div>

      <BulkActionBar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
      />
    </>
  );
}
