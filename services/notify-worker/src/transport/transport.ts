export interface SendInput {
  /** Recipient email address. May be a single address or array. */
  to: string | string[];
  subject: string;
  /** Pre-rendered HTML body. */
  html: string;
  /** Pre-rendered plain text body. Required for accessibility + spam scoring. */
  text: string;
  /** Override the default From for this send. */
  from?: string;
  /** Override default reply-to. */
  replyTo?: string;
  /** Tags for analytics / Resend webhooks. */
  tags?: Array<{ name: string; value: string }>;
  /** Idempotency key to prevent double-send on retry. */
  idempotencyKey?: string;
}

export interface SendResult {
  /** Provider-assigned ID (Resend) or local file path (DevLog). */
  id: string;
  /** Provider name. */
  provider: "resend" | "dev-log";
}

export interface Transport {
  send(input: SendInput): Promise<SendResult>;
  name(): "resend" | "dev-log";
}
