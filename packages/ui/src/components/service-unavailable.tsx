import * as React from "react";

export interface ServiceUnavailableProps {
  /** Short title. Default: "Service is being deployed". */
  title?: string;
  /** Longer description. */
  description?: string;
  /** Optional action button. */
  action?: React.ReactNode;
  /** Visual size. "compact" sits inline; "block" takes a full section. */
  size?: "compact" | "block";
}

/**
 * Used when an API surface returns 5xx or is unreachable. Tells the user
 * the feature is real but not yet wired in this environment, instead of
 * showing an empty state that looks like a bug.
 *
 * For "this feature is intentionally off" use <ComingSoon /> instead.
 */
export function ServiceUnavailable({
  title = "Service is being deployed",
  description = "This part of OpenMarket is still being wired in production. The page itself is safe to browse — try again in a minute, or check the status page if you're curious.",
  action,
  size = "block",
}: ServiceUnavailableProps) {
  if (size === "compact") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="m-0 font-semibold">{title}</p>
        <p className="m-0 mt-1 text-amber-800">{description}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      </div>
      <div>
        <p className="m-0 text-base font-semibold text-amber-900">{title}</p>
        <p className="m-0 mt-1 max-w-md text-sm text-amber-800">
          {description}
        </p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export interface ComingSoonProps {
  /** Short title. */
  title?: string;
  /** Description. */
  description?: string;
  /** Optional ETA or tier hint. */
  eta?: string;
}

/**
 * Used when a feature is INTENTIONALLY off (gated behind a feature flag
 * we haven't enabled yet). Different from <ServiceUnavailable /> because
 * "we haven't built it" is honest, not a bug.
 */
export function ComingSoon({
  title = "Coming soon",
  description = "This feature is on the roadmap and being built in the open. Check back, or watch the GitHub repo for updates.",
  eta,
}: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-600">
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      </div>
      <div>
        <p className="m-0 text-base font-semibold text-gray-900">{title}</p>
        <p className="m-0 mt-1 max-w-md text-sm text-gray-600">
          {description}
        </p>
        {eta ? (
          <p className="m-0 mt-2 text-xs uppercase tracking-wide text-gray-500">
            {eta}
          </p>
        ) : null}
      </div>
    </div>
  );
}
