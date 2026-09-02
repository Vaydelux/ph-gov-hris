/**
 * Payroll vertical slice — the authoritative server implementation.
 *  - Generation is QUEUED to BullMQ; the worker computes via
 *    @gov-hris/payroll-processing (same code path the API re-exports).
 *  - Idempotency: PayrollRun.idempotencyKey is UNIQUE per period; repeated
 *    /generate calls return the existing run instead of duplicating it.
 *  - State machine: contracts' PAYROLL_TRANSITIONS is enforced on every move.
 *  - Release is a single Prisma transaction: payslips + loan postings
 *    (LoanLedgerEntry unique [loanId, refType, refId] makes double-deduction
 *    structurally impossible) + attendance finalization + audit.
 *  - Released runs are immutable under normal operations; corrections require
 *    a separate reversal workflow (never plain CRUD).
 */
import {
  Body, ConflictException, Controller, Get, Inject, Injectable, NotFoundException, Param, Post,
} from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { assertPayrollTransition } from "@gov-hris/contracts";
import { CurrentUser, RequirePermissions, type AuthUser } from "./auth";
import { env, PrismaService, structuredLog, writeAudit } from "./platform";

// Shared worker computation — one code path for API and worker.
export { computeRun } from "../../../packages/payroll-processing/src/compute-run";

export const PAYROLL_QUEUE = "payroll";

export function createPayrollQueue(): Queue {
  return new Queue(PAYROLL_QUEUE, {
    connection: new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: 200 },
  });
}

@Injectable()
export class PayrollService {
  readonly queue = createPayrollQueue();
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Idempotent: the unique idempotencyKey guarantees one live run per period. */
  async generate(periodId: string, actor: AuthUser) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException({ code: "NOT_FOUND", message: "Payroll period not found." });
    if (period.closed) throw new ConflictException({ code: "PERIOD_CLOSED", message: "Period is closed." });
    const key = `run:${periodId}`;
    const existing = await this.prisma.payrollRun.findUnique({ where: { idempotencyKey: key } });
    if (existing && !["CANCELLED", "FAILED"].includes(existing.status)) return existing;

    const run = await this.prisma.payrollRun.create({
      data: { periodId, status: "QUEUED", idempotencyKey: key, stage: "Queued", createdBy: actor.sub, log: ["Queued for worker"] },
    });
    await this.queue.add("payroll.generate", { runId: run.id }, { jobId: `generate:${run.id}` }); // jobId => idempotent enqueue
    await writeAudit(this.prisma, {
      actorId: actor.sub, actorName: actor.fullName, action: "payroll.queue_generate",
      entity: "PayrollRun", entityId: run.id, after: { period: period.label }, requestId: `${Date.now()}`,
    });
    structuredLog("info", "payroll.queued", { runId: run.id });
    return run;
  }

  private async advance(
    runId: string, from: string[], to: Parameters<typeof assertPayrollTransition>[1],
    actor: AuthUser, action: string, stamp: "verifiedAt" | "approvedAt" | "releasedAt",
    field: "verifiedBy" | "approvedBy" | "releasedBy",
  ) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException({ code: "NOT_FOUND", message: "Run not found." });
    if (!from.includes(run.status)) throw new ConflictException({ code: "INVALID_STATE", message: `Run is ${run.status}.` });
    assertPayrollTransition(run.status as never, to);
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: to, [stamp]: new Date(), [field]: actor.sub, log: { push: `${actor.fullName}: ${action}` } },
    });
    await writeAudit(this.prisma, {
      actorId: actor.sub, actorName: actor.fullName, action: `payroll.${action}`, entity: "PayrollRun",
      entityId: runId, before: { status: run.status }, after: { status: to }, requestId: `${Date.now()}`,
    });
    return updated;
  }

  verify(runId: string, actor: AuthUser) { return this.advance(runId, ["COMPUTED"], "VERIFIED", actor, "verify", "verifiedAt", "verifiedBy"); }
  approve(runId: string, actor: AuthUser) { return this.advance(runId, ["VERIFIED"], "APPROVED", actor, "approve", "approvedAt", "approvedBy"); }

  /** Transactional release: payslips + loan amortizations + attendance lock. */
  async release(runId: string, actor: AuthUser) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId }, include: { period: true } });
    if (!run) throw new NotFoundException({ code: "NOT_FOUND", message: "Run not found." });
    if (run.status !== "APPROVED") throw new ConflictException({ code: "INVALID_STATE", message: "Only APPROVED runs release." });
    assertPayrollTransition(run.status, "RELEASED");

    const lines = await this.prisma.employeePayroll.findMany({ where: { runId } });
    const result = await this.prisma.$transaction(async (tx) => {
      let slips = 0; let loanPosts = 0;
      for (const line of lines) {
        const exists = await tx.payslip.findFirst({ where: { employeePayrollId: line.id } });
        if (!exists) {
          await tx.payslip.create({
            data: { number: `${run.period.label.replace(/\D/g, "")}-${(slips + 1).toString().padStart(4, "0")}`, employeePayrollId: line.id },
          });
          slips++;
        }
        if (Number(line.loan) > 0) {
          const activeLoan = await tx.employeeLoan.findFirst({ where: { employeeId: line.employeeId, status: "ACTIVE" } });
          if (activeLoan) {
            // unique([loanId, refType, refId]) => retries can NEVER double-post
            await tx.loanLedgerEntry.upsert({
              where: { loanId_refType_refId: { loanId: activeLoan.id, refType: "PAYROLL_RUN", refId: runId } },
              update: {},
              create: {
                loanId: activeLoan.id, type: "PAYROLL_PAYMENT", amount: line.loan,
                refType: "PAYROLL_RUN", refId: runId, memo: `Amortization — ${run.period.label}`, actorId: "system",
              },
            });
            loanPosts++;
          }
        }
      }
      await tx.attendanceDay.updateMany({
        where: { date: { gte: run.period.from, lte: run.period.to } }, data: { finalized: true },
      });
      return tx.payrollRun.update({
        where: { id: runId },
        data: { status: "RELEASED", releasedAt: new Date(), releasedBy: actor.sub, log: { push: `Released — ${slips} payslips, ${loanPosts} loan postings` } },
      });
    });
    await writeAudit(this.prisma, {
      actorId: actor.sub, actorName: actor.fullName, action: "payroll.release", entity: "PayrollRun",
      entityId: runId, before: { status: "APPROVED" }, after: { status: "RELEASED", net: run.net.toString() }, requestId: `${Date.now()}`,
    });
    structuredLog("info", "payroll.released", { runId });
    return result;
  }
}

@Controller("payroll")
export class PayrollController {
  constructor(private readonly svc: PayrollService, private readonly prisma: PrismaService) {}

  @Get()
  overview() {
    return this.prisma.payrollPeriod.findMany({ include: { runs: true }, orderBy: { from: "desc" } });
  }

  @Post("generate")
  @RequirePermissions("payroll.generate")
  generate(@Body("periodId") periodId: string, @CurrentUser() user: AuthUser) { return this.svc.generate(periodId, user); }

  @Get(":id")
  @RequirePermissions("payroll.read")
  run(@Param("id") id: string) {
    return this.prisma.payrollRun.findUnique({
      where: { id },
      include: { period: true, lines: { include: { earnings: true, deductions: true, attendance: true } } },
    });
  }

  @Post(":id/verify")
  @RequirePermissions("payroll.verify")
  verify(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.svc.verify(id, u); }

  @Post(":id/approve")
  @RequirePermissions("payroll.approve")
  approve(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.svc.approve(id, u); }

  @Post(":id/release")
  @RequirePermissions("payroll.release")
  release(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.svc.release(id, u); }

  @Get(":id/bank-file")
  @RequirePermissions("payroll.export")
  async bankFile(@Param("id") id: string, @CurrentUser() u: AuthUser) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id }, include: { period: true, lines: { include: { employee: true } } },
    });
    if (!run) throw new NotFoundException({ code: "NOT_FOUND", message: "Run not found." });
    if (run.status !== "RELEASED") throw new ConflictException({ code: "INVALID_STATE", message: "Only RELEASED runs export." });
    const rows = run.lines.map((l) =>
      [l.employee.employeeNo, l.employee.bankAccountEnc ? "on-file" : "—", (l.snapshot as { name: string }).name, l.net.toString()].join(","));
    await writeAudit(this.prisma, {
      actorId: u.sub, actorName: u.fullName, action: "payroll.bank_export", entity: "PayrollRun",
      entityId: id, after: { records: run.lines.length }, requestId: `${Date.now()}`,
    });
    return `Employee No,Account,Name,Net\n${rows.join("\n")}`;
  }
}
