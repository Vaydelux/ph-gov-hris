/**
 * Government HRIS worker — BullMQ consumers.
 *
 * Policy (per PRD):
 *   - max 3 automatic retries with exponential backoff (configured per queue)
 *   - persistent failures move to a dead-letter queue ("dlq") and are reported
 *   - every financially-impacting operation is idempotent:
 *       payroll.computeRun: unique run idempotencyKey + released runs skipped
 *       loan postings:      unique [loanId, refType, refId] ledger rows
 *       report files:       jobId = report:<uuid> prevents duplicate renders
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { computeRun } from "../../../packages/payroll-processing/src/compute-run";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1, "Upstash Redis required"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SENTRY_DSN: z.string().optional(),
});
const env = envSchema.parse(process.env);

const prisma = new PrismaClient();
const storage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const dlq = new Queue("dlq", { connection });

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: "gov-hris-worker", event, ...fields }));

/** Sentry hook — wire @sentry/node init here when SENTRY_DSN is provided. */
const reportFailure = (queue: string, job: Job, err: unknown) => {
  log("job.failed_permanently", { queue, jobId: job.id, name: job.name, error: String(err) });
  void dlq.add("dead", { queue, jobId: job.id, name: job.name, error: String(err), at: new Date().toISOString() });
};

/* ---------------- payroll worker ---------------- */
const payrollWorker = new Worker(
  "payroll",
  async (job) => {
    if (job.name !== "payroll.generate") return;
    const { runId } = job.data as { runId: string };
    log("payroll.start", { runId, attempt: job.attemptsMade + 1 });
    await prisma.payrollRun.update({ where: { id: runId }, data: { status: "COMPUTING", stage: "Worker picked up job" } }).catch(() => undefined);
    try {
      await computeRun(prisma, runId); // same authoritative code path as the API slice
      log("payroll.done", { runId });
    } catch (err) {
      await prisma.payrollRun.update({ where: { id: runId }, data: { status: job.attemptsMade >= 2 ? "FAILED" : "QUEUED", error: String(err), log: { push: `worker error: ${String(err).slice(0, 300)}` } } }).catch(() => undefined);
      throw err; // BullMQ retries with exponential backoff (queue defaultJobOptions)
    }
  },
  { connection, concurrency: 1 },
);
payrollWorker.on("failed", (job, err) => { if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) reportFailure("payroll", job, err); });

/* ---------------- reports worker (ExcelJS + Puppeteer → private storage) ---------------- */
const reportsWorker = new Worker(
  "reports",
  async (job) => {
    const { reportId } = job.data as { reportId: string };
    const run = await prisma.reportRun.findUnique({ where: { id: reportId } });
    if (!run) return;
    await prisma.reportRun.update({ where: { id: reportId }, data: { status: "PROCESSING", progress: 30 } });

    let fileName: string; let mime: string; let buffer: Buffer;
    if (run.type === "PAYSLIP") {
      // PDF via Puppeteer (server-side only — never in the browser)
      const { default: puppeteer } = await import("puppeteer");
      const line = await prisma.employeePayroll.findFirst({ where: { id: String((run.params as { employeePayrollId?: string }).employeePayrollId ?? "") } });
      const html = `<html><body style="font-family:Inter,Arial;padding:32px">
        <h2>Government HRIS — Payslip</h2>
        <p>${line ? JSON.stringify(line.snapshot) : "—"}</p>
        <p>Net: ${line ? line.net.toString() : "—"}</p></body></html>`;
      const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      buffer = Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
      await browser.close();
      fileName = `payslip_${reportId}.pdf`; mime = "application/pdf";
    } else {
      // Excel via ExcelJS
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(run.type);
      ws.addRow(["Government HRIS", run.type, run.paramsLabel, new Date().toISOString()]);
      ws.addRow([]);
      if (run.type === "EMPLOYEE_LIST") {
        ws.addRow(["Employee No", "Name", "Grade-Step", "Status"]);
        for (const e of await prisma.employee.findMany()) ws.addRow([e.employeeNo, `${e.lastName}, ${e.firstName}`, `${e.salaryGrade}-${e.salaryStep}`, e.status]);
      }
      buffer = Buffer.from(await wb.xlsx.writeBuffer());
      fileName = `${run.type.toLowerCase()}_${reportId}.xlsx`; mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    const path = `reports/${new Date().toISOString().slice(0, 7)}/${fileName}`;
    const { error } = await storage.storage.from("hris-private").upload(path, buffer, { contentType: mime, upsert: true });
    if (error) throw new Error(`storage upload failed: ${error.message}`);

    const file = await prisma.generatedFile.create({ data: { name: fileName, mime, storagePath: path, sizeBytes: buffer.byteLength } });
    await prisma.reportRun.update({ where: { id: reportId }, data: { status: "DONE", progress: 100, fileId: file.id, completedAt: new Date() } });
    if (run.requestedBy) {
      await prisma.notification.create({ data: { userId: run.requestedBy, type: "REPORT", title: "Report ready", body: `${run.type} has been generated and stored privately.`, link: "/reports" } });
    }
    log("report.done", { reportId, path });
  },
  { connection, concurrency: 2 },
);
reportsWorker.on("failed", (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    reportFailure("reports", job, err);
    void prisma.reportRun.updateMany({ where: { id: String((job.data as { reportId?: string }).reportId) }, data: { status: "FAILED" } });
  }
});

/* ---------------- housekeeping ---------------- */
const events = new QueueEvents("payroll", { connection });
events.on("completed", ({ jobId }) => log("queue.completed", { queue: "payroll", jobId }));

const shutdown = async () => { await payrollWorker.close(); await reportsWorker.close(); await prisma.$disconnect(); process.exit(0); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
log("worker.started", { env: env.NODE_ENV });
