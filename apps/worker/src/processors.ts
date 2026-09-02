/**
 * Worker processors. Pure money math is imported from @gov-hris/contracts —
 * the same engine the API validates against. Files go to PRIVATE storage;
 * metadata is persisted; notifications wake the frontend.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import type { Job } from "bullmq";
import ExcelJS from "exceljs";
import { computePayroll, resolveEffectiveRule, stepSalaryCents } from "@gov-hris/contracts";

const prisma = new PrismaClient();
const storage = () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // preview/dev without storage configured
  return createClient(url, key);
};
const toCents = (d: { toString(): string }) => Math.round(Number(d.toString()) * 100);

/* ---------------- payroll ---------------- */
export async function processPayrollJob(job: Job<{ runId: string }>) {
  const { runId } = job.data;
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { period: true } });
  if (!run) return;
  if (!["QUEUED", "COMPUTING"].includes(run.status)) return; // idempotent: skip completed/cancelled
  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "COMPUTING", stage: "Resolving employees", progress: 5, log: { push: "Worker picked up job" } } });

  const asOf = run.period.to.toISOString().slice(0, 10);
  const [employees, schedules, allowances, attendance, loans, schemes, brackets] = await Promise.all([
    prisma.employee.findMany({ where: { status: "ACTIVE" }, include: { position: true, department: true } }),
    prisma.salarySchedule.findMany({ include: { grades: true } }),
    prisma.employeeAllowance.findMany({ where: { active: true }, include: { allowanceType: true } }),
    prisma.attendanceDay.findMany({ where: { date: { gte: run.period.from, lte: run.period.to } } }),
    prisma.employeeLoan.findMany({ where: { status: "ACTIVE" } }),
    prisma.deductionScheme.findMany({ include: { rules: true } }),
    prisma.taxBracket.findMany(),
  ]);
  await job.updateProgress(30);
  const ruleFor = (code: string) => resolveEffectiveRule(
    (schemes.find((s) => s.code === code)?.rules ?? []).map((r) => ({
      effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
      employeeBps: r.employeeBps ?? undefined,
      monthlyCapCents: r.monthlyCapCents ? toCents(r.monthlyCapCents) : undefined,
    })),
    asOf,
  );
  const gsis = ruleFor("GSIS"); const ph = ruleFor("PHILHEALTH"); const pi = ruleFor("PAGIBIG");
  if (!gsis || !ph || !pi) throw new Error("No effective government rules for period — refusing to compute.");
  const wtaxRule = schemes.find((s) => s.code === "WTAX")?.rules
    .filter((r) => r.effectiveFrom.toISOString().slice(0, 10) <= asOf)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
  const wtaxBrackets = brackets.filter((b) => b.ruleId === wtaxRule?.id)
    .map((b) => ({ fromCents: toCents(b.fromCents), toCents: b.toCents ? toCents(b.toCents) : null, baseCents: toCents(b.baseCents), rateBps: b.rateBps }));

  const lines = employees.map((emp) => {
    const schedule = schedules[0];
    const step1 = schedule?.grades.find((g) => g.grade === emp.salaryGrade && g.step === 1);
    const monthly = stepSalaryCents(step1 ? toCents(step1.cents) : 0, emp.salaryStep);
    const allowanceLines = allowances.filter((a) => a.employeeId === emp.id && a.effectiveFrom <= run.period.to)
      .map((a) => ({ label: a.allowanceType.name, cents: Math.round(toCents(a.allowanceType.monthlyCents) / 2) }));
    const att = attendance.filter((a) => a.employeeId === emp.id);
    const snap = {
      present: att.filter((a) => ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME"].includes(a.status)).length,
      lateDays: att.filter((a) => a.lateMin > 0).length,
      absent: att.filter((a) => a.status === "ABSENT").length,
      otMin: att.reduce((s, a) => s + a.otMin, 0),
      lateMin: att.reduce((s, a) => s + a.lateMin, 0),
      utMin: att.reduce((s, a) => s + a.undertimeMin, 0),
    };
    const loan = loans.find((l) => l.employeeId === emp.id);
    const res = computePayroll({
      monthlyBasicCents: monthly, allowanceLines, otMin: snap.otMin, lateMin: snap.lateMin, utMin: snap.utMin,
      gsisRule: gsis, philhealthRule: ph, pagibigRule: pi, taxBrackets: wtaxBrackets,
      loanInstallmentCents: loan ? toCents(loan.installmentCents) : 0,
    });
    return { emp, res, snap, scheduleName: schedule?.name ?? "" };
  });
  await job.updateProgress(75);

  // Immutable snapshot persistence — transactional; unique(runId, employeeId)
  await prisma.$transaction(async (tx) => {
    await tx.employeePayroll.deleteMany({ where: { runId } });
    for (const l of lines) {
      await tx.employeePayroll.create({
        data: {
          runId, employeeId: l.emp.id,
          snapshot: { fullName: `${l.emp.firstName} ${l.emp.lastName}`, position: l.emp.position.title, department: l.emp.department.name, grade: l.emp.salaryGrade, step: l.emp.salaryStep, scheduleName: l.scheduleName, employeeNo: l.emp.employeeNo },
          basicCents: (l.res.basicCents / 100).toFixed(2), otCents: (l.res.otCents / 100).toFixed(2), lateDeductCents: (l.res.lateDeductCents / 100).toFixed(2),
          grossCents: (l.res.grossCents / 100).toFixed(2), gsisCents: (l.res.gsisCents / 100).toFixed(2),
          philhealthCents: (l.res.philhealthCents / 100).toFixed(2), pagibigCents: (l.res.pagibigCents / 100).toFixed(2),
          wtaxCents: (l.res.wtaxCents / 100).toFixed(2), loanCents: (l.res.loanCents / 100).toFixed(2),
          totalDeductCents: (l.res.totalDeductCents / 100).toFixed(2), netCents: (l.res.netCents / 100).toFixed(2),
          earningLines: l.res.earningLines, deductionLines: l.res.deductionLines, attendanceSnapshot: l.snap,
        },
      });
    }
    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: "COMPUTED", progress: 100, stage: "Computed — ready for verification",
        employeeCount: lines.length,
        grossCents: (lines.reduce((s, l) => s + l.res.grossCents, 0) / 100).toFixed(2),
        deductionsCents: (lines.reduce((s, l) => s + l.res.totalDeductCents, 0) / 100).toFixed(2),
        netCents: (lines.reduce((s, l) => s + l.res.netCents, 0) / 100).toFixed(2),
        log: { push: "Snapshot persisted immutably" },
      } as never,
    });
  });
}

/* ---------------- reports (ExcelJS + Puppeteer → private storage) ---------------- */
export async function processReportJob(job: Job<{ reportId: string }>) {
  const { reportId } = job.data;
  const run = await prisma.reportRun.findUnique({ where: { id: reportId } });
  if (!run || run.status === "DONE") return; // idempotent
  await prisma.reportRun.update({ where: { id: reportId }, data: { status: "PROCESSING", progress: 20 } });

  const params = run.params as Record<string, string>;
  let buffer: Buffer; let name: string; let mime: string;

  if (run.type === "PAYROLL_REGISTER" || run.type === "REMITTANCE") {
    const lines = await prisma.employeePayroll.findMany({ where: { runId: params.runId } });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(run.type);
    ws.addRow(["Employee", "Position", "Basic", "Gross", "GSIS", "PhilHealth", "Pag-IBIG", "WTAX", "Loan", "Net"]);
    for (const l of lines) {
      const s = l.snapshot as Record<string, string>;
      ws.addRow([s.fullName, s.position, Number(l.basicCents.toString()), Number(l.grossCents.toString()), Number(l.gsisCents.toString()), Number(l.philhealthCents.toString()), Number(l.pagibigCents.toString()), Number(l.wtaxCents.toString()), Number(l.loanCents.toString()), Number(l.netCents.toString())]);
    }
    buffer = Buffer.from(await wb.xlsx.writeBuffer());
    name = `${run.type.toLowerCase()}_${reportId.slice(0, 6)}.xlsx`; mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else if (run.type === "PAYSLIP") {
    // PDF via Puppeteer from the immutable snapshot
    const puppeteer = await import("puppeteer");
    const line = await prisma.employeePayroll.findUnique({ where: { id: params.employeePayrollId } });
    if (!line) throw new Error("Payroll line not found.");
    const s = line.snapshot as Record<string, string>;
    const html = `<html><head><style>body{font-family:Georgia,serif;padding:32px}h1{font-size:16px}table{width:100%;border-collapse:collapse}td{border-bottom:1px dotted #999;padding:4px;font-size:12px}</style></head>
      <body><h1>DEPARTMENT OF CIVIC SERVICES — PAYSLIP</h1><p>${s.fullName} · ${s.position} · SG ${s.grade}-${s.step}</p>
      <table><tr><td>Gross</td><td>₱${Number(line.grossCents.toString()).toLocaleString()}</td></tr>
      <tr><td>Total deductions</td><td>₱${Number(line.totalDeductCents.toString()).toLocaleString()}</td></tr>
      <tr><td><b>NET PAY</b></td><td><b>₱${Number(line.netCents.toString()).toLocaleString()}</b></td></tr></table></body></html>`;
    const browser = await puppeteer.default.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html);
    buffer = Buffer.from(await page.pdf({ format: "A4" }));
    await browser.close();
    name = `payslip_${reportId.slice(0, 6)}.pdf`; mime = "application/pdf";
  } else {
    throw new Error(`Report type ${run.type} not implemented in worker yet.`);
  }

  // Private storage upload; metadata in PostgreSQL
  const client = storage();
  let storagePath = `local/${name}`;
  if (client) {
    const bucket = process.env.STORAGE_BUCKET_REPORTS ?? "hris-reports";
    await client.storage.from(bucket).upload(`reports/${name}`, buffer, { contentType: mime, upsert: false });
    storagePath = `reports/${name}`;
  }
  const file = await prisma.generatedFile.create({ data: { name, mime, storagePath, sizeBytes: buffer.length } });
  await prisma.reportRun.update({ where: { id: reportId }, data: { status: "DONE", progress: 100, fileId: file.id, completedAt: new Date() } });
  await prisma.notification.create({ data: { userId: run.requestedBy, type: "REPORT", title: "Report ready", body: `${run.type} has been generated and stored privately.`, link: "/reports" } });
}

/* ---------------- email ---------------- */
export async function processEmailJob(job: Job<{ deliveryId: string }>) {
  const { deliveryId } = job.data;
  const row = await prisma.emailDelivery.findUnique({ where: { id: deliveryId } });
  if (!row || row.status === "SENT") return; // idempotent
  if (!process.env.SMTP_HOST) {
    await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: "SKIPPED", lastError: "SMTP not configured (preview)" } });
    return;
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({ from: process.env.MAIL_FROM, to: row.to, subject: row.subject, text: "Government HRIS notification." });
  await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } } });
}
