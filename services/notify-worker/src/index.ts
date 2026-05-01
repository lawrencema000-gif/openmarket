import "dotenv/config";
import { Sentry, sentryEnabled } from "./lib/sentry.js";
import { Worker } from "bullmq";
import { type EmailJob, NOTIFY_QUEUE_NAME } from "./jobs.js";
import { renderTemplate } from "./render.js";
import { getTransport } from "./transport/index.js";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const transport = getTransport();

const worker = new Worker<EmailJob>(
  NOTIFY_QUEUE_NAME,
  async (job) => {
    const { template, to, props, from, replyTo, tags, idempotencyKey } = job.data;
    console.log(
      `[notify-worker] job=${job.id} template=${template} to=${
        Array.isArray(to) ? to.join(",") : to
      } via=${transport.name()}`,
    );

    const rendered = await renderTemplate(template, props as never);
    const result = await transport.send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      from,
      replyTo,
      tags: [{ name: "template", value: template }, ...(tags ?? [])],
      idempotencyKey: idempotencyKey ?? job.id,
    });

    console.log(
      `[notify-worker] sent job=${job.id} provider=${result.provider} id=${result.id}`,
    );
    return result;
  },
  {
    connection: redisConnection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10),
  },
);

worker.on("failed", (job, err) => {
  console.error(`[notify-worker] FAILED job=${job?.id} err=${err.message}`);
  if (sentryEnabled) {
    Sentry.withScope((scope) => {
      scope.setTag("job_id", job?.id ?? "unknown");
      scope.setTag("template", (job?.data as { template?: string })?.template ?? "unknown");
      Sentry.captureException(err);
    });
  }
});

worker.on("error", (err) => {
  console.error(`[notify-worker] error: ${err.message}`);
  if (sentryEnabled) Sentry.captureException(err);
});

console.log(
  `[notify-worker] listening on ${NOTIFY_QUEUE_NAME} (Redis ${redisConnection.host}:${redisConnection.port}, transport=${transport.name()})`,
);

async function shutdown() {
  console.log("[notify-worker] shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { worker };
