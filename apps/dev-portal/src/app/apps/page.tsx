"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface App {
  id: string;
  packageName: string;
  title: string;
  category: string;
  trustTier: string;
}

export default function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<App[]>("/api/apps")
      .then(setApps)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load apps"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Apps</h1>
        <Link
          href="/apps/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
        >
          Create New App
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {!loading && !error && apps.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
          <p className="text-gray-500 text-sm mb-4">
            You haven&apos;t published any apps yet.
          </p>
          <Link
            href="/apps/new"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            Create your first app
          </Link>
        </div>
      )}

      {!loading && apps.length > 0 && (
        <ul className="space-y-3">
          {apps.map((app) => (
            <li key={app.id}>
              <Link
                href={`/apps/${app.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-blue-300 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">{app.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{app.packageName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 capitalize">{app.category}</span>
                  <span className="text-xs font-medium capitalize text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                    {app.trustTier}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
