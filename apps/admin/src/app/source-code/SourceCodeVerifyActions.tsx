"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

interface Current {
  sourceCodeVerified: boolean;
  reproducibleVerified: boolean;
}

/**
 * Flip-buttons for the two source-code verification flags on a single
 * app row (P3-O). Each toggle is independent — flipping
 * `sourceCodeVerified` doesn't affect `reproducibleVerified` and vice
 * versa. Clearing a flag leaves its prior `*_VerifiedAt` timestamp on
 * the row for audit, just bool flipped to false.
 */
export function SourceCodeVerifyActions({
  appId,
  current,
}: {
  appId: string;
  current: Current;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function flip(field: keyof Current) {
    const next = !current[field];
    const res = await fetch(
      `${API_URL}/api/admin/apps/${appId}/source-code-verification`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      },
    );
    if (!res.ok) {
      console.error("[source-code] PATCH failed", await res.text());
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => void flip("sourceCodeVerified")}
        className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
          current.sourceCodeVerified
            ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        {current.sourceCodeVerified ? "Clear source verified" : "Mark source verified"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => void flip("reproducibleVerified")}
        className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
          current.reproducibleVerified
            ? "bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        {current.reproducibleVerified
          ? "Clear reproducible build"
          : "Mark reproducible build"}
      </button>
    </div>
  );
}
