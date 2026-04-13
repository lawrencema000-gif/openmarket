"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import {
  PageHeader,
  Button,
  Card,
  CardContent,
  StatusBadge,
  EmptyState,
  Skeleton,
} from "@openmarket/ui";

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
    <div className="max-w-3xl">
      <PageHeader
        title="My Apps"
        description="Manage your published applications."
        actions={
          <Link href="/apps/new">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create New App
            </Button>
          </Link>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && !error && apps.length === 0 && (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
              }
              title="No apps yet"
              description="Create your first app to get started on OpenMarket."
              action={
                <Link href="/apps/new">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    Create your first app
                  </Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      )}

      {!loading && apps.length > 0 && (
        <ul className="space-y-3">
          {apps.map((app) => (
            <li key={app.id}>
              <Link href={`/apps/${app.id}`}>
                <Card className="hover:border-blue-200 hover:shadow-sm transition-all duration-200 cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{app.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 font-mono">{app.packageName}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-gray-400 capitalize hidden sm:block">
                          {app.category.replace(/_/g, " ")}
                        </span>
                        <StatusBadge status={app.trustTier} />
                        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
