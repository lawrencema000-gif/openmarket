"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import {
  PageHeader,
  Stat,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
} from "@openmarket/ui";

interface Developer {
  id: string;
  displayName: string;
  verificationStatus: string;
}

interface App {
  id: string;
  trustTier?: string;
}

interface SigningKey {
  id: string;
}

const TRUST_STEPS = [
  { key: "experimental", label: "Experimental", description: "Default trust level for new apps" },
  { key: "verified", label: "Verified", description: "Identity confirmed" },
  { key: "audited", label: "Audited", description: "Security audit passed" },
];

export default function DashboardPage() {
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [signingKeys, setSigningKeys] = useState<SigningKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [dev, appList, keyList] = await Promise.all([
          api.get<Developer>("/api/developers/me"),
          api.get<App[]>("/api/apps"),
          api.get<SigningKey[]>("/api/signing-keys").catch(() => [] as SigningKey[]),
        ]);
        setDeveloper(dev);
        setApps(appList);
        setSigningKeys(keyList);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-gray-200 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200 animate-pulse" />
          ))}
        </div>
        <div className="h-48 rounded-xl bg-gray-200 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const publishedApps = apps.filter((a) => a.trustTier !== "experimental").length;
  const pendingApps = apps.length - publishedApps;

  const currentTrustStep = TRUST_STEPS.findIndex(
    (s) => s.key === developer?.verificationStatus,
  );
  const activeTrustIndex = currentTrustStep >= 0 ? currentTrustStep : 0;

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title="Dashboard"
        description={`Welcome back${developer?.displayName ? `, ${developer.displayName}` : ""}. Here's an overview of your developer account.`}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Total Apps"
          value={apps.length}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
          }
        />
        <Stat
          label="Published"
          value={publishedApps}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <Stat
          label="Pending Review"
          value={pendingApps}
          color="amber"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <Stat
          label="Signing Keys"
          value={signingKeys.length}
          color="violet"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
            </svg>
          }
        />
      </div>

      {/* Verification status card */}
      <Card>
        <CardHeader>
          <CardTitle>Trust Level</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-0">
            {TRUST_STEPS.map((step, i) => (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                      i <= activeTrustIndex
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-200 bg-white text-gray-400"
                    }`}
                  >
                    {i < activeTrustIndex ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <p className={`text-xs font-medium mt-2 ${i <= activeTrustIndex ? "text-gray-900" : "text-gray-400"}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-gray-400 text-center mt-0.5 hidden sm:block">
                    {step.description}
                  </p>
                </div>
                {i < TRUST_STEPS.length - 1 && (
                  <div className={`flex-shrink-0 h-0.5 w-8 mx-1 mb-4 ${i < activeTrustIndex ? "bg-blue-600" : "bg-gray-200"}`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link href="/apps/new">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create App
              </Button>
            </Link>
            <Link href="/apps">
              <Button variant="outline" className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                Upload Release
              </Button>
            </Link>
            <Link href="/signing-keys">
              <Button variant="outline" className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
                </svg>
                Manage Keys
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
