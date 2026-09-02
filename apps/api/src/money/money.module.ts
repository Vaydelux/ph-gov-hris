/**
 * Government deductions (effective-dated, immutable versions), allowances,
 * and ledger-based loans with idempotent payroll integration.
 */
import {
  BadRequestException, Body, Controller, Get, Module, NotFoundException, Param, Patch, Post,
  Query, Req, UseGuards,
} from "@nestjs/common";
import { Audited, JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../common";
import { PrismaService } from "../prisma/prisma.service";
import { loanApplySchema, loanInstallmentCents } from "@gov-hris/contracts";

type AuthedReq = { user: { sub: string; employeeId?: string; permissions: string[] } };

@Controller("deductions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeductionsController {
  constructor(private prisma: PrismaService) {}

  @Get("schemes")
  schemes() { return this.prisma.deductionScheme.findMany({ include: { rules: { orderBy: { effectiveFrom: "desc" }, include: { brackets: true } } } }); }

  @Post("schemes/:schemeId/rules")
  @RequirePermissions("deductions.manage")
  @Audited("deduction.rule_added", "ContributionRule")
  async addRule(@Param("schemeId") schemeId: string, @Body() body: { effectiveFrom: string; employeeBps?: number; employerBps?: number; monthlyCapCents?: number; note: string }) {
    const latest = await this.prisma.contributionRule.findFirst({ where: { schemeId }, orderBy: { effectiveFrom: "desc" } });
    if (latest && new Date(body.effectiveFrom) <= latest.effectiveFrom)
      throw new BadRequestException({ code: "EFFECTIVE_DATE", message: "New rule must be effective after the latest version. Historical rules are immutable." });
    return this.prisma.contributionRule.create({
      data: {
        schemeId, effectiveFrom: new Date(body.effectiveFrom), employeeBps: body.employeeBps, employerBps: body.employerBps,
        monthlyCapCents: body.monthlyCapCents != null ? (body.monthlyCapCents / 100).toFixed(2) : null,
        note: body.note, demo: false,
      },
    });
  }
}

@Controller("allowances")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AllowancesController {
  constructor(private prisma: PrismaService) {}

  @Get("types")
  types() { return this.prisma.allowanceType.findMany(); }

  @Get()
  @RequirePermissions("allowances.manage")
  async list(@Query() q: { page?: string; pageSize?: string; q?: string }) {
    const page = Math.max(1, Number(q.page ?? 1)); const pageSize = Math.min(100, Number(q.pageSize ?? 12));
    const [rows, total] = await Promise.all([
      this.prisma.employeeAllowance.findMany({ skip: (page - 1) * pageSize, take: pageSize, include: { employee: true, allowanceType: true }, orderBy: { effectiveFrom: "desc" } }),
      this.prisma.employeeAllowance.count(),
    ]);
    return { rows, total, page, pageSize };
  }

  @Post()
  @RequirePermissions("allowances.manage")
  @Audited("allowance.grant", "EmployeeAllowance")
  create(@Body() body: { employeeId: string; allowanceTypeId: string; monthlyCents: number; effectiveFrom: string }, @Req() req: AuthedReq) {
    return this.prisma.employeeAllowance.create({
      data: { employeeId: body.employeeId, allowanceTypeId: body.allowanceTypeId, monthlyCents: (body.monthlyCents / 100).toFixed(2), effectiveFrom: new Date(body.effectiveFrom), grantedBy: req.user.sub },
    });
  }

  @Patch(":id")
  @RequirePermissions("allowances.manage")
  @Audited("allowance.toggle", "EmployeeAllowance")
  toggle(@Param("id") id: string, @Body() body: { active: boolean }) {
    return this.prisma.employeeAllowance.update({ where: { id }, data: { active: body.active } });
  }
}

@Controller("loans")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoansController {
  constructor(private prisma: PrismaService) {}

  @Get("types")
  types() { return this.prisma.loanType.findMany(); }

  @Get()
  async list(@Query() q: { page?: string; pageSize?: string; status?: string; q?: string; mine?: string }, @Req() req: AuthedReq) {
    const canManage = req.user.permissions.includes("loans.manage");
    const mineOnly = q.mine === "true" || !canManage;
    const where = {
      ...(mineOnly ? { employeeId: req.user.employeeId ?? "" } : {}),
      ...(q.status ? { status: q.status as never } : {}),
    };
    const page = Math.max(1, Number(q.page ?? 1)); const pageSize = Math.min(100, Number(q.pageSize ?? 10));
    const [rows, total] = await Promise.all([
      this.prisma.employeeLoan.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, include: { employee: true, loanType: true }, orderBy: { appliedAt: "desc" } }),
      this.prisma.employeeLoan.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  @Get(":id")
  async detail(@Param("id") id: string, @Req() req: AuthedReq) {
    const loan = await this.prisma.employeeLoan.findUnique({ where: { id }, include: { employee: true, loanType: true, ledger: { orderBy: { at: "desc" } }, schedule: { orderBy: { seq: "asc" } } } });
    if (!loan) throw new NotFoundException("Loan not found.");
    // horizontal-escalation guard
    if (!req.user.permissions.includes("loans.manage") && loan.employeeId !== req.user.employeeId)
      throw new NotFoundException("Loan not found.");
    return loan;
  }

  @Post()
  @RequirePermissions("loans.apply")
  @Audited("loan.apply", "EmployeeLoan")
  async apply(@Body() body: unknown, @Req() req: AuthedReq) {
    const input = loanApplySchema.parse(body);
    if (!req.user.employeeId) throw new BadRequestException({ code: "NO_EMPLOYEE_PROFILE", message: "No linked employee profile." });
    const type = await this.prisma.loanType.findUnique({ where: { id: input.loanTypeId } });
    if (!type) throw new NotFoundException("Loan type not found.");
    if (input.amountCents > Number(type.maxAmountCents) * 100) throw new BadRequestException({ code: "VALIDATION", message: "Amount exceeds ceiling." });
    const open = await this.prisma.employeeLoan.count({ where: { employeeId: req.user.employeeId, status: { in: ["SUBMITTED", "UNDER_REVIEW", "ACTIVE"] } } });
    if (open > 0) throw new BadRequestException({ code: "EXISTING_LOAN", message: "Settle or close your existing loan first." });
    return this.prisma.employeeLoan.create({
      data: {
        refNo: `${type.code}-${Date.now().toString().slice(-5)}`, employeeId: req.user.employeeId, loanTypeId: input.loanTypeId,
        appliedAmountCents: (input.amountCents / 100).toFixed(2), termMonths: input.termMonths,
        installmentCents: (loanInstallmentCents(input.amountCents, input.termMonths) / 100).toFixed(2),
      },
    });
  }

  @Post(":id/review")
  @RequirePermissions("loans.manage")
  @Audited("loan.review", "EmployeeLoan")
  async review(@Param("id") id: string, @Body() body: { action: "START_REVIEW" | "APPROVE" | "REJECT"; approvedAmountCents?: number; termMonths?: number }, @Req() req: AuthedReq) {
    return this.prisma.tx(async (tx) => {
      const loan = await tx.employeeLoan.findUnique({ where: { id } });
      if (!loan) throw new NotFoundException("Loan not found.");
      if (body.action === "START_REVIEW") {
        if (loan.status !== "SUBMITTED") throw new BadRequestException({ code: "INVALID_STATE", message: "Only SUBMITTED loans enter review." });
        return tx.employeeLoan.update({ where: { id }, data: { status: "UNDER_REVIEW" } });
      }
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(loan.status)) throw new BadRequestException({ code: "INVALID_STATE", message: "Loan is not reviewable." });
      if (body.action === "REJECT") return tx.employeeLoan.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date(), decidedBy: req.user.sub } });
      const amtCents = body.approvedAmountCents ?? Number(loan.appliedAmountCents) * 100;
      const term = body.termMonths ?? loan.termMonths;
      const installment = loanInstallmentCents(amtCents, term);
      const updated = await tx.employeeLoan.update({
        where: { id },
        data: { status: "ACTIVE", approvedAmountCents: (amtCents / 100).toFixed(2), termMonths: term, installmentCents: (installment / 100).toFixed(2), decidedAt: new Date(), decidedBy: req.user.sub },
      });
      await tx.loanLedgerEntry.create({ data: { loanId: id, type: "DISBURSEMENT", amountCents: (amtCents / 100).toFixed(2), refType: "SYSTEM", memo: "Loan proceeds disbursed", actorId: req.user.sub } });
      for (let i = 1; i <= term; i++)
        await tx.loanPaymentSchedule.create({ data: { loanId: id, seq: i, dueLabel: `Installment ${i} of ${term}`, amountCents: (installment / 100).toFixed(2) } });
      return updated;
    });
  }

  @Post(":id/payments")
  @RequirePermissions("loans.manage")
  @Audited("loan.manual_payment", "EmployeeLoan")
  async pay(@Param("id") id: string, @Body() body: { amountCents: number; memo: string }, @Req() req: AuthedReq) {
    return this.prisma.tx(async (tx) => {
      const loan = await tx.employeeLoan.findUnique({ where: { id } });
      if (!loan || loan.status !== "ACTIVE") throw new BadRequestException({ code: "INVALID_STATE", message: "Only ACTIVE loans accept payments." });
      await tx.loanLedgerEntry.create({ data: { loanId: id, type: "MANUAL_PAYMENT", amountCents: (body.amountCents / 100).toFixed(2), refType: "MANUAL", memo: body.memo, actorId: req.user.sub } });
      const due = await tx.loanPaymentSchedule.findFirst({ where: { loanId: id, paidAt: null }, orderBy: { seq: "asc" } });
      if (due) await tx.loanPaymentSchedule.update({ where: { id: due.id }, data: { paidAt: new Date(), paidVia: "Manual payment" } });
      return loan;
    });
  }
}

@Module({ controllers: [DeductionsController, AllowancesController, LoansController], providers: [PrismaService] })
export class MoneyModule {}
