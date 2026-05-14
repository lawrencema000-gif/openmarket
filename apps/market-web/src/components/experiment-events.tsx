"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";

interface ExperimentInfo {
  experimentId: string;
  variantId: string;
  variantLabel: string;
}

interface ExperimentEventsProps {
  appId: string;
  experiment: ExperimentInfo;
}

/**
 * Tiny client component that fires a `view` event when the app
 * detail page mounts (P3-B). When mounted with an `experiment`
 * payload, the install button somewhere on the same page can
 * trigger a `install` event via window dispatch — see the
 * install-button bridge below.
 *
 * Designed to be invisible: renders nothing, just runs a fetch.
 */
export function ExperimentEvents({ appId, experiment }: ExperimentEventsProps) {
  useEffect(() => {
    // Set a stable visitor cookie if missing — keeps the variant
    // assignment sticky across reloads for anonymous users.
    if (typeof document !== "undefined") {
      const has = /(?:^|;\s*)om_visitor=/.test(document.cookie);
      if (!has) {
        const id = (
          crypto.getRandomValues(new Uint8Array(8)).reduce(
            (acc, b) => acc + b.toString(16).padStart(2, "0"),
            "",
          )
        );
        document.cookie = `om_visitor=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
    }
    // Fire the view event. Fire-and-forget — we don't gate any UX on
    // it. Failures are logged to console for debugging but never
    // surface to the user.
    void apiFetch(`/api/apps/${appId}/experiments/events`, {
      method: "POST",
      body: JSON.stringify({
        experimentId: experiment.experimentId,
        variantId: experiment.variantId,
        type: "view",
      }),
    }).catch(() => {});
  }, [appId, experiment.experimentId, experiment.variantId]);

  return null;
}

/**
 * Reports an install event. Called from the install button's onClick
 * — the button doesn't await this; the click navigates immediately
 * and the fetch races (fine for our denorm counter).
 */
export function reportInstallEvent(
  appId: string,
  experiment: ExperimentInfo,
): void {
  void apiFetch(`/api/apps/${appId}/experiments/events`, {
    method: "POST",
    body: JSON.stringify({
      experimentId: experiment.experimentId,
      variantId: experiment.variantId,
      type: "install",
    }),
  }).catch(() => {});
}
