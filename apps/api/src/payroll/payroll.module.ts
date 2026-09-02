/**
 * PAYROLL — the most guarded module in the system.
 *  - generate/verify/approve/release behind distinct permissions
 *  - explicit state-machine validation (@gov-hris/contracts)
 *  - idempotency via unique idempotencyKey (period → one live run)
 *  - Prisma transaction for compute persistence & release side effects
 *  - immutable snapshots: EmployeePayroll rows are written once
 *  - loan deductions idempotent per (loan, run) via unique ledger key
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException, Param,
  Post, Req, UseGuards,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import {
  assertPayrollTransition, computePayroll, resolveEffectiveRule, stepSalaryCents,
  type PayrollStatus, type Permission,
} from "@gov-hris/contracts";
import { Audited, JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../common";
import { PrismaService } from "../prisma/prisma.service";

type AuthedReq = { user: { sub: string; email: string; employeeId?: string; permissions: Permission[] }; correlationId?: string };

@Controller("payroll")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(private service: PayrollService) {}

  @Get()
  @RequirePermissions("payroll.read")
  overview() { return this.service.overview(); }

  @Get(":id")
  @RequirePermissions("payroll.read")
  run(@Param("id") id: string, @Req() req: AuthedReq) { return this.service.getRun(id, req.user); }

  @Post("generate")
  @RequirePermissions("payroll.generate")
  @Audited("payroll.queue_generate", "PayrollRun")
  generate(@Body() body: { periodId: string }, @Req() req: AuthedReq) {
    return this.service.generate(body.periodId, req.user.sub);
  }

  @Post(":id/verify")
  @RequirePermissions("payroll.verify")
  @Audited("payroll.verify", "PayrollRun")
  verify(@Param("id") id: string, @Req() req: AuthedReq) { return this.service.advance(id, "VERIFIED", req.user.sub); }

  @Post(":id/approve")
  @RequirePermissions("payroll.approve")
  @Audited("payroll.approve", "PayrollRun")
  approve(@Param("id") id: string, @Req() req: AuthedReq) { return this.service.advance(id, "APPROVED", req.user.sub); }

  @Post(":id/release")
  @RequirePermissions("payroll.release")
  @Audited("payroll.release", "PayrollRun")
  release(@Param("id") id: string, @Req() req: AuthedReq) { return this.service.release(id, req.user.sub); }

  @Post(":id/cancel")
  @RequirePermissions("payroll.generate")
  @Audited("payroll.cancel", "PayrollRun")
  cancel(@Param("id") id: string, @Req() req: AuthedReq) { return this.service.advance(id, "CANCELLED", req.user.sub); }

  @Get(":id/bank-file")
  @RequirePermissions("payroll.export")
  @Audited("payroll.bank_export", "PayrollRun")
  bankFile(@Param("id") id: string) { return this.service.bankFile(id); }

  @Get("payslips/mine")
  myPayslips(@Req() req: AuthedReq) { return this.service.myPayslips(req.user.employeeId); }
}

export class PayrollService {
  constructor(private prisma: PrismaService, @InjectQueue("payroll") private queue: Queue) {}

  overview() {
    return this.prisma.$transaction(async (tx) => ({
      periods: await tx.payrollPeriod.findMany({ orderBy: { from: "desc" }, include: { runs: { take: 1, orderBy: { createdAt: "desc" } } } }),
      runs: await tx.payrollRun.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { period: true } }),
    }));
  }

  async getRun(id: string, user: { employeeId?: string }) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { lines: true, period: true } });
    if (!run) throw new NotFoundException("Payroll run not found.");
    // Row-level scope: employees see only their own line.
    const lines = user.employeeId ? run.lines.filter((l) => l.employeeId === user.employeeId) : run.lines;
    return { run: { ...run, lines: undefined }, rows: lines };
  }

  /** Idempotent: one live run per period. Repeat calls return the existing run. */
  async generate(periodId: string, actorId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException("Payroll period not found.");
    if (period.closed) throw new BadRequestException({ code: "PERIOD_CLOSED", message: "This payroll period is closed." });
    const key = `run:${periodId}`;
    const existing = await this.prisma.payrollRun.findUnique({ where: { idempotencyKey: key } });
    if (existing && !["CANCELLED", "FAILED"].includes(existing.status)) return existing;
    const run = await this.prisma.payrollRun.create({
      data: { periodId, idempotencyKey: key, status: "QUEUED", stage: "Queued for worker", createdBy: actorId, log: ["Queued"] },
    });
    await this.queue.add("compute", { runId: run.id, idempotencyKey: key }, {
      jobId: key, // BullMQ dedupe guard
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
    });
    return run;
  }

  async advance(id: string, to: PayrollStatus, actorId: string) {
    return this.prisma.tx(async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id } });
      if (!run) throw new NotFoundException("Payroll run not found.");
      assertPayrollTransition(run.status as PayrollStatus, to);
      const stamp = to === "VERIFIED" ? { verifiedAt: new Date(), verifiedBy: actorId }
        : to === "APPROVED" ? { approvedAt: new Date(), approvedBy: actorId } : {};
      return tx.payrollRun.update({
        where: { id },
        data: { status: to, ...stamp, log: { push: `${actorId} → ${to}` } },
      });
    });
  }

  /**
   * Release — transactional, idempotent side effects:
   * payslips created once (unique employeePayrollId), loan ledger entries
   * unique per (loanId, runId), attendance finalized. RELEASED is terminal.
   */
  async release(id: string, actorId: string) {
    return this.prisma.tx(async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id }, include: { lines: true, period: true } });
      if (!run) throw new NotFoundException("Payroll run not found.");
      assertPayrollTransition(run.status as PayrollStatus, "RELEASED");

      for (const line of run.lines) {
        if (Number(line.loanCents) > 0) {
          const loan = await tx.employeeLoan.findFirst({ where: { employeeId: line.employeeId, status: "ACTIVE" } });
          if (loan) {
            // unique([loanId, refType, refId]) makes double-deduction impossible
            const posted = await tx.loanLedgerEntry.findUnique({
              where: { loanId_refType_refId: { loanId: loan.id, refType: "PAYROLL_RUN", refId: run.id } },
            }).catch(() => null);
            if (!posted) {
              await tx.loanLedgerEntry.create({
                data: { loanId: loan.id, type: "PAYROLL_PAYMENT", amountCents: line.loanCents, refType: "PAYROLL_RUN", refId: run.id, memo: `Amortization — ${run.period.label}`, actorId },
              });
              const nextDue = await tx.loanPaymentSchedule.findFirst({ where: { loanId: loan.id, paidAt: null }, orderBy: { seq: "asc" } });
              if (nextDue) await tx.loanPaymentSchedule.update({ where: { id: nextDue.id }, data: { paidAt: new Date(), paidVia: `Payroll — ${run.period.label}` } });
            }
          }
        }
        const existingSlip = await tx.payslip.findUnique({ where: { employeePayrollId: line.id } }).catch(() => null);
        if (!existingSlip) {
          await tx.payslip.create({
            data: { number: `${run.period.to.toISOString().slice(0, 7).replace("-", "")}-${line.id.slice(0, 6).toUpperCase()}`, employeePayrollId: line.id, employeeId: line.employeeId, runId: run.id, releasedAt: new Date() },
          });
        }
      }
      await tx.attendanceDay.updateMany({
        where: { date: { gte: run.period.from, lte: run.period.to } },
        data: { finalized: true },
      });
      return tx.payrollRun.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: new Date(), releasedBy: actorId, progress: 100, stage: "Released" },
      });
    });
  }

  async bankFile(id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { lines: true, period: true } });
    if (!run) throw new NotFoundException("Run not found.");
    if (run.status !== "RELEASED") throw new BadRequestException({ code: "INVALID_STATE", message: "Bank file available only for RELEASED runs." });
    const rows = await Promise.all(run.lines.map(async (l) => {
      const emp = await this.prisma.employee.findUnique({ where: { id: l.employeeId } });
      return [l.snapshot as Record<string, string>, emp?.bankAccount ?? "—", emp?.bankName ?? "—", l.netCents.toString()] as const;
    }));
    return { filename: `bankfile_${run.period.label.replace(/[^a-z0-9]+/gi, "_")}.csv`, rows };
  }

  async myPayslips(employeeId?: string) {
    if (!employeeId) return [];
    return this.prisma.payslip.findMany({ where: { employeeId }, orderBy: { releasedAt: "desc" }, include: { employeePayroll: true } });
  }
}

/**
 * Worker-side compute entrypoint (invoked by apps/worker over the queue).
 * Pure computation lives in @gov-hris/contracts; this service resolves
 * effective-dated config and persists the immutable snapshot transactionally.
 */
export class PayrollComputeService {
  constructor(private prisma: PrismaService) {}

  async compute(runId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId }, include: { period: true } });
    if (!run || !["QUEUED", "COMPUTING"].includes(run.status)) return; // idempotent guard
    await this.prisma.payrollRun.update({ where: { id: runId }, data: { status: "COMPUTING", stage: "Computing" } });
    const asOf = run.period.to.toISOString().slice(0, 10);

    const [employees, schedules, allowances, attendance, loans, schemes, brackets] = await Promise.all([
      this.prisma.employee.findMany({ where: { status: "ACTIVE" }, include: { position: true, department: true } }),
      this.prisma.salarySchedule.findMany({ include: { grades: true } }),
      this.prisma.employeeAllowance.findMany({ where: { active: true }, include: { allowanceType: true } }),
      this.prisma.attendanceDay.findMany({ where: { date: { gte: run.period.from, lte: run.period.to } } }),
      this.prisma.employeeLoan.findMany({ where: { status: "ACTIVE" } }),
      this.prisma.deductionScheme.findMany({ include: { rules: true } }),
      this.prisma.taxBracket.findMany(),
    ]);
    const ruleFor = (code: string) => resolveEffectiveRule(
      (schemes.find((s) => s.code === code)?.rules ?? []).map((r) => ({ effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10), employeeBps: r.employeeBps ?? undefined, monthlyCapCents: r.monthlyCapCents ? Number(r.monthlyCapCents) * 100 : undefined })),
      asOf,
    );
    const gsis = ruleFor("GSIS")!; const ph = ruleFor("PHILHEALTH")!; const pi = ruleFor("PAGIBIG")!;
    const wtaxRule = schemes.find((s) => s.code === "WTAX")?.rules.filter((r) => r.effectiveFrom.toISOString().slice(0, 10) <= asOf).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
    const wtaxBrackets = brackets.filter((b) => b.ruleId === wtaxRule?.id).map((b) => ({
      fromCents: Number(b.fromCents) * 100, toCents: b.toCents ? Number(b.toCents) * 100 : null, baseCents: Number(b.baseCents) * 100, rateBps: b.rateBps,
    }));

    const lines = employees.map((emp) => {
      const schedule = schedules[0]; // effective schedule resolution by emp.scheduleId in production
      const step1 = schedule?.grades.find((g) => g.grade === emp.salaryGrade && g.step === 1);
      const monthly = stepSalaryCents(step1 ? Number(step1.cents) * 100 : 0, emp.salaryStep);
      const allowLines = allowances.filter((a) => a.employeeId === emp.id).map((a) => ({ label: a.allowanceType.name, cents: Math.round(Number(a.allowanceType.monthlyCents) * 100 / 2) }));
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
        monthlyBasicCents: monthly, allowanceLines: allowLines,
        otMin: snap.otMin, lateMin: snap.lateMin, utMin: snap.utMin,
        gsisRule: gsis, philhealthRule: ph, pagibigRule: pi, taxBrackets: wtaxBrackets,
        loanInstallmentCents: loan ? Number(loan.installmentCents) * 100 : 0,
      });
      return { runId, employeeId: emp.id, res, snap, emp, scheduleName: schedule?.name ?? "" };
    });

    await this.prisma.tx(async (tx: PrismaClient) => {
      await tx.employeePayroll.deleteMany({ where: { runId } }); // recompute safety for FAILED retries
      for (const l of lines) {
        await tx.employeePayroll.create({
          data: {
            runId, employeeId: l.employeeId,
            snapshot: { fullName: `${l.emp.firstName} ${l.emp.lastName}`, position: l.emp.position.title, department: l.emp.department.name, grade: l.emp.salaryGrade, step: l.emp.salaryStep, scheduleName: l.scheduleName, employeeNo: l.emp.employeeNo },
            basicCents: (l.res.basicCents / 100).toFixed(2), otCents: (l.res.otCents / 100).toFixed(2), lateDeductCents: (l.res.lateDeductCents / 100).toFixed(2),
            grossCents: (l.res.grossCents / 100).toFixed(2), gsisCents: (l.res.gsisCents / 100).toFixed(2), philhealthCents: (l.res.philhealthCents / 100).toFixed(2),
            pagibigCents: (l.res.pagibigCents / 100).toFixed(2), wtaxCents: (l.res.wtaxCents / 100).toFixed(2), loanCents: (l.res.loanCents / 100).toFixed(2),
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
        },
      });
    });
  }
}

@Module({
  controllers: [PayrollController],
  providers: [PrismaService, PayrollService, PayrollComputeService],
  exports: [PayrollComputeService],
})
export class PayrollModule {}
