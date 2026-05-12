"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface AcceptResponse {
  success: boolean;
  developerId: string;
  role: string;
}

export default function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<"working" | "ok" | "err">("working");
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<AcceptResponse | null>(null);

  useEffect(() => {
    async function go() {
      try {
        const r = await api.post<AcceptResponse>(
          `/api/team/invites/${token}/accept`,
        );
        setResult(r);
        setState("ok");
      } catch (err) {
        setState("err");
        setMessage(err instanceof ApiError ? err.message : "Could not accept");
      }
    }
    go();
  }, [token]);

  return (
    <div className="max-w-md mx-auto pt-16 space-y-4">
      {state === "working" && (
        <p className="text-sm text-gray-500">Accepting invite…</p>
      )}
      {state === "ok" && result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 space-y-2">
          <h1 className="text-lg font-semibold text-emerald-900">
            Welcome to the team
          </h1>
          <p className="text-sm text-emerald-800">
            You've joined as <strong>{result.role}</strong>.
          </p>
          <Link
            href="/dashboard"
            className="inline-block mt-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Go to dashboard →
          </Link>
        </div>
      )}
      {state === "err" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 space-y-2">
          <h1 className="text-lg font-semibold text-red-900">
            We couldn't accept this invite
          </h1>
          <p className="text-sm text-red-800">{message}</p>
          <p className="text-xs text-red-700">
            Make sure you're signed in with the same email the invite was
            sent to. If the invite has expired, ask the inviter to send a
            new one.
          </p>
        </div>
      )}
    </div>
  );
}
