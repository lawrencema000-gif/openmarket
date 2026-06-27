"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getDeviceHash } from "@/lib/device";

/**
 * Affiliate referral capture (P4-H). When an app page is opened with
 * `?ref=<code>`, record an affiliate click for this device + app. The
 * later install attributes a conversion by matching the same device hash
 * (see lib/device.ts). Renders nothing; fire-and-forget.
 */
export function AffiliateRefCapture({ appId }: { appId: string }) {
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const ref = params.get("ref");
    if (!ref) return;
    fired.current = true;

    void apiFetch("/api/affiliate/click", {
      method: "POST",
      body: JSON.stringify({
        referralCode: ref,
        appId,
        deviceFingerprintHash: getDeviceHash(),
        surface: "pdp",
      }),
    }).catch(() => {});
  }, [appId, params]);

  return null;
}
