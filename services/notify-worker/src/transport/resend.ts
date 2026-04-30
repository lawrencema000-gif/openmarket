import { Resend } from "resend";
import type { SendInput, SendResult, Transport } from "./transport.js";

export interface ResendTransportOptions {
  apiKey: string;
  defaultFrom: string;
  replyTo?: string;
}

export class ResendTransport implements Transport {
  private client: Resend;
  private defaultFrom: string;
  private defaultReplyTo?: string;

  constructor(opts: ResendTransportOptions) {
    this.client = new Resend(opts.apiKey);
    this.defaultFrom = opts.defaultFrom;
    this.defaultReplyTo = opts.replyTo;
  }

  name(): "resend" {
    return "resend";
  }

  async send(input: SendInput): Promise<SendResult> {
    const res = await this.client.emails.send({
      from: input.from ?? this.defaultFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo ?? this.defaultReplyTo,
      tags: input.tags,
      headers: input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : undefined,
    });

    if (res.error) {
      throw new Error(
        `Resend send failed: ${res.error.name}: ${res.error.message}`,
      );
    }
    if (!res.data?.id) {
      throw new Error("Resend send succeeded but returned no message ID");
    }

    return { id: res.data.id, provider: "resend" };
  }
}
