import { Queue } from "bullmq";
import {
  type EmailJob,
  type EmailTemplate,
  type EmailTemplateMap,
  NOTIFY_QUEUE_NAME,
} from "@openmarket/contracts";

/**
 * Typed enqueue helper. The API must never call Resend directly — every
 * outbound email goes through the BullMQ queue so we get retries, rate
 * limiting, idempotency, and don't block the request that triggered it.
 *
 * Usage:
 *   await enqueueEmail({
 *     template: "welcome",
 *     to: user.email,
 *     props: { recipientName: user.name, ctaUrl: "https://..." },
 *   });
 *
 * The compiler enforces that `props` matches the template's expected shape.
 */

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { count: 1000, age: 7 * 24 * 60 * 60 }, // 1k or 7d
  removeOnFail: { age: 30 * 24 * 60 * 60 }, // 30d for debugging
};

const queue = new Queue<EmailJob>(NOTIFY_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

export interface EnqueueEmailInput<K extends EmailTemplate> {
  template: K;
  to: string | string[];
  props: EmailTemplateMap[K];
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  /** Idempotency key. If two jobs share the same key within retention, only one is processed. */
  idempotencyKey?: string;
  /** Delay in ms before the worker picks up the job. */
  delayMs?: number;
}

export async function enqueueEmail<K extends EmailTemplate>(
  input: EnqueueEmailInput<K>,
): Promise<{ jobId: string }> {
  const { template, to, props, from, replyTo, tags, idempotencyKey, delayMs } =
    input;

  const job = await queue.add(
    `email:${template}`,
    {
      template,
      to,
      props,
      from,
      replyTo,
      tags,
      idempotencyKey,
    } as EmailJob,
    {
      jobId: idempotencyKey, // BullMQ dedups on jobId
      delay: delayMs,
    },
  );

  if (!job.id) {
    throw new Error("Failed to enqueue email job: no job ID returned");
  }
  return { jobId: job.id };
}

/** Test-only access to the queue for inspection and cleanup. */
export const _emailQueueForTests = queue;
