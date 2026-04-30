/**
 * Email contracts shared between the API (which enqueues) and the
 * notify-worker (which renders + sends).
 *
 * These are pure data types — no React, no DOM. The worker pulls in the
 * actual .tsx templates; the API just enqueues `EmailJob` payloads.
 *
 * Keep this file in sync with services/notify-worker/src/templates/*.tsx.
 * Adding a new template requires:
 *   1. Add its props interface here.
 *   2. Add the entry to EmailTemplateMap.
 *   3. Implement the .tsx in the worker.
 */

export interface WelcomeEmailProps {
  recipientName?: string;
  ctaUrl: string;
}

export interface VerifyEmailProps {
  verifyUrl: string;
  expiryMinutes?: number;
}

export interface PasswordResetProps {
  resetUrl: string;
  expiryMinutes?: number;
  ipAddress?: string;
}

export interface ReleasePublishedProps {
  appName: string;
  versionName: string;
  versionCode: number;
  releaseUrl: string;
  reviewUrl?: string;
  riskScore?: number;
}

export interface ReleaseRejectedProps {
  appName: string;
  versionName: string;
  versionCode: number;
  reason: string;
  findings?: string[];
  fixUrl: string;
  appealUrl: string;
}

export interface ReportResolvedProps {
  reportId: string;
  targetType: string;
  resolution: "delisted" | "warned" | "dismissed";
  notes?: string;
  transparencyUrl: string;
}

export interface DeveloperTakedownProps {
  appName: string;
  reason: string;
  ruleVersion: string;
  rulesUrl: string;
  appealUrl: string;
  effectiveAt: string;
}

export interface ReviewResponseProps {
  appName: string;
  developerName: string;
  responseBody: string;
  reviewUrl: string;
}

export type EmailTemplateMap = {
  welcome: WelcomeEmailProps;
  "verify-email": VerifyEmailProps;
  "password-reset": PasswordResetProps;
  "release-published": ReleasePublishedProps;
  "release-rejected": ReleaseRejectedProps;
  "report-resolved": ReportResolvedProps;
  "developer-takedown": DeveloperTakedownProps;
  "review-response": ReviewResponseProps;
};

export type EmailTemplate = keyof EmailTemplateMap;

/** Single job shape on the `openmarket-notify` BullMQ queue. */
export type EmailJob = {
  [K in EmailTemplate]: {
    template: K;
    to: string | string[];
    props: EmailTemplateMap[K];
    from?: string;
    replyTo?: string;
    tags?: Array<{ name: string; value: string }>;
    idempotencyKey?: string;
  };
}[EmailTemplate];

export const NOTIFY_QUEUE_NAME = "openmarket-notify";
