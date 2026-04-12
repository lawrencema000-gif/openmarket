"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface Developer {
  id: string;
  displayName: string;
  verificationStatus: string;
}

interface App {
  id: string;
}

export default function DashboardPage() {
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [dev, appList] = await Promise.all([
          api.get<Developer>("/api/developers/me"),
          api.get<App[]>("/api/apps"),
        ]);
        setDeveloper(dev);
        setApps(appList);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-500">Loading…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const verificationColor =
    developer?.verificationStatus === "verified"
      ? "text-green-700 bg-green-50 border-green-200"
      : developer?.verificationStatus === "pending"
        ? "text-yellow-700 bg-yellow-50 border-yellow-200"
        : "text-gray-700 bg-gray-50 border-gray-200";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{developer?.displayName ? `, ${developer.displayName}` : ""}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Here&apos;s an overview of your developer account.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Verification Status
          </p>
          <span
            className={`inline-block mt-1 rounded-full border px-3 py-0.5 text-sm font-medium capitalize ${verificationColor}`}
          >
            {developer?.verificationStatus ?? "unverified"}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Total Apps
          </p>
          <p className="text-3xl font-bold text-gray-900">{apps.length}</p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h2>
        <p className="text-sm text-gray-400 italic">No recent activity to display.</p>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/apps/new"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            Create App
          </Link>
          <Link
            href="/apps"
            className="bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            Upload Release
          </Link>
        </div>
      </div>
    </div>
  );
}
