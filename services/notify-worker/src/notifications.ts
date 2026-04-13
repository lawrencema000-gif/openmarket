export type NotificationType =
  | "release_approved"
  | "release_rejected"
  | "developer_suspended"
  | "developer_reinstated"
  | "report_submitted"
  | "report_resolved"
  | "scan_complete"
  | "review_posted";

export interface NotificationPayload {
  type: NotificationType;
  recipientEmail: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  // In production: integrate with email service (Resend, SendGrid, etc.)
  // For now, log the notification
  console.log(`[NOTIFY] To: ${payload.recipientEmail}`);
  console.log(`[NOTIFY] Subject: ${payload.subject}`);
  console.log(`[NOTIFY] Body: ${payload.body}`);
  console.log(`[NOTIFY] Type: ${payload.type}`);
  return true;
}

export function buildNotification(
  type: NotificationType,
  data: Record<string, string>
): { subject: string; body: string } {
  switch (type) {
    case "release_approved":
      return {
        subject: `Release approved: ${data.appName} v${data.versionName}`,
        body: `Your release for ${data.appName} (v${data.versionName}) has been approved and is now published on OpenMarket.`,
      };
    case "release_rejected":
      return {
        subject: `Release rejected: ${data.appName} v${data.versionName}`,
        body: `Your release for ${data.appName} (v${data.versionName}) was rejected. Reason: ${data.reason}`,
      };
    case "developer_suspended":
      return {
        subject: "Your OpenMarket developer account has been suspended",
        body: `Your account has been suspended. Reason: ${data.reason}. You may appeal this decision through the developer portal.`,
      };
    case "developer_reinstated":
      return {
        subject: "Your OpenMarket developer account has been reinstated",
        body: "Your developer account has been reinstated. You may resume publishing apps.",
      };
    case "report_submitted":
      return {
        subject: `New abuse report filed`,
        body: `A ${data.reportType} report has been filed against ${data.targetType} ${data.targetId}.`,
      };
    case "report_resolved":
      return {
        subject: `Your report has been resolved`,
        body: `Your report about ${data.targetType} has been resolved. Status: ${data.status}.`,
      };
    case "scan_complete":
      return {
        subject: `Scan complete: ${data.appName} v${data.versionName}`,
        body: `Security scan for ${data.appName} (v${data.versionName}) is complete. Risk score: ${data.riskScore}/100.`,
      };
    case "review_posted":
      return {
        subject: `New review on ${data.appName}`,
        body: `A ${data.rating}-star review was posted on ${data.appName}.`,
      };
  }
}
