/**
 * Government HRIS worker — BullMQ consumers.
 *
 * Flow: Next.js → NestJS (enqueue) → [payroll|reports|email|biometrics] →
 *       worker (this process) → PostgreSQL / Supabase Storage → status update
 *       → frontend refresh via polling/notification.
 *
 * Policy: 3 attempts, exponential backoff, dead-letter queue for persistent
 * failures, Sentry reporting, idempotent processors.
 */
import { Queue, Worker, type Job } from "bullmq";
import * as Sentry from "@sentry/node";
import { processPayrollJob, processReportJob, processEmailJob } from "./processors";

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.SENTRY_ENVIRONMENT ?? "development" });
}

const connection = (() => {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[worker] REDIS_URL missing — using localhost Redis (development).");
    return { host: "127.0.0.1", port: 6379 };
  }
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, tls: u.protocol === "rediss:" ? {} : undefined };
})();

const DEAD = "dead-letter";
const dead = new Queue(DEAD, { connection });

const queues: Record<string, (job: Job) => Promise<unknown>> = {
  payroll: processPayrollJob,
  reports: processReportJob,
  email: processEmailJob,
};

for (const [name, handler] of Object.entries(queues)) {
  const worker = new Worker(name, handler, {
    connection,
    concurrency: name === "payroll" ? 1 : 3, // payroll must serialize per-run
  });
  worker.on("completed", (job) => console.log(`[worker:${name}] ✔ ${job.id}`));
  worker.on("failed", async (job, err) => {
    const attempts = job?.attemptsMade ?? 0;
    console.error(`[worker:${name}] ✖ ${job?.id} attempt ${attempts}:`, err.message);
    Sentry.captureException(err, { tags: { queue: name, jobId: job?.id } });
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      await dead.add("failed-job", { queue: name, jobId: job.id, name: job.name, data: job.data, error: err.message, failedAt: new Date().toISOString() });
      console.error(`[worker:${name}] → moved ${job.id} to dead-letter queue`);
    }
  });
}

console.log("[gov-hris/worker] processors online: payroll, reports, email · DLQ:", DEAD);
