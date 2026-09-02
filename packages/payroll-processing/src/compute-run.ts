/**
 * Shared payroll-run computation — the single code path used by BOTH the
 * NestJS API slice and the BullMQ worker, so their behavior can never drift.
 * Pure orchestration over @gov-hris/contracts (pure engine) + Prisma.
 *
 * Safety properties:
 *  - never recomputes RELEASED runs (immutable history)
 *  - effective-dated rule resolution pinned to the period end date
 *  - stores resolved rule ids in EmployeePayroll.rulesUsed (reproducibility)
 *  - money handled as integer centavos; Decimal only at the Prisma boundary
 */
import type { PrismaClient } from "@prisma/client";
import { computePayroll, resolveEffectiveRule, stepSalaryCents } from "@gov-hris/contracts";

const cents = (d: { toString(): string }) => Math.round(Number(d) * 100);
const phpOf = (c: number) => (c / 100).toFixed(2);

export async function computeRun(prisma: PrismaClient, runId: string): Promise<void> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { period: true } });
  if (!run || run.status === "RELEASED") return;
  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "COMPUTING", progress: 5 } });

  const asOf = run.period.to.toISOString().slice(0, 10);
  const rules = await prisma.governmentContributionRule.findMany({
    where: { effectiveFrom: { lte: run.period.to } },
    include: { taxBrackets: true, scheme: true },
  });
  const pick = (code: string) =>
    resolveEffectiveRule(
      rules
        .filter((r) => r.scheme.code === code)
        .map((r) => ({
          id: r.id, schemeId: r.schemeId, effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
          employeeBps: r.employeeBps ?? undefined, employerBps: r.employerBps ?? undefined,
          monthlyCapCents: r.monthlyCap ? cents(r.monthlyCap) : undefined,
          monthlyFloorCents: r.monthlyFloor ? cents(r.monthlyFloor) : undefined,
          note: r.note, demo: r.demo,
        })),
      asOf,
    );
  const gsis = pick("GSIS"); const ph = pick("PHILHEALTH"); const pi = pick("PAGIBIG"); const wtax = pick("WTAX");
  if (!gsis || !ph || !pi || !wtax) throw new Error(`No effective government rules for period ending ${asOf} — publish rule versions first.`);
  const brackets = rules.find((r) => r.id === wtax.id)!.taxBrackets.map((b) => ({
    id: b.id, ruleId: b.ruleId, fromCents: cents(b.fromAmt), toCents: b.toAmt ? cents(b.toAmt) : null,
    baseCents: cents(b.baseAmt), rateBps: b.rateBps,
  }));

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: {
      position: true, department: true, schedule: true,
      attendanceDays: { where: { date: { gte: run.period.from, lte: run.period.to } } },
      allowances: { where: { active: true }, include: { allowanceType: true } },
      loans: { where: { status: "ACTIVE" }, take: 1 },
    },
  });

  let gross = 0; let deduct = 0; let net = 0;
  await prisma.employeePayroll.deleteMany({ where: { runId } }); // safe pre-verification only
  for (const e of employees) {
    const grade = await prisma.salaryGrade.findUnique({
      where: { scheduleId_grade: { scheduleId: e.scheduleId, grade: e.salaryGrade } }, include: { steps: true },
    });
    if (!grade) throw new Error(`Missing salary grade SG${e.salaryGrade} for schedule ${e.scheduleId}`);
    const step1 = cents(grade.steps.find((s) => s.step === 1)!.rate);
    const att = e.attendanceDays;
    const snap = {
      present: att.filter((a) => ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME", "OFFICIAL_BUSINESS"].includes(a.status)).length,
      lateDays: att.filter((a) => a.lateMin > 0).length,
      absent: att.filter((a) => a.status === "ABSENT").length,
      otMin: att.reduce((s, a) => s + a.otMin, 0),
      lateMin: att.reduce((s, a) => s + a.lateMin, 0),
      utMin: att.reduce((s, a) => s + a.undertimeMin, 0),
    };
    const res = computePayroll({
      monthlyBasicCents: stepSalaryCents(step1, e.salaryStep),
      allowanceLines: e.allowances.map((a) => ({ label: a.allowanceType.name, cents: cents(a.monthly) })),
      otMin: snap.otMin, lateMin: snap.lateMin, utMin: snap.utMin,
      gsisRule: gsis, philhealthRule: ph, pagibigRule: pi, taxBrackets: brackets,
      loanInstallmentCents: e.loans[0] ? cents(e.loans[0].installment) : 0,
      attendanceSnapshot: snap,
    });
    gross += res.grossCents; deduct += res.totalDeductCents; net += res.netCents;
    await prisma.employeePayroll.create({
      data: {
        runId, employeeId: e.id,
        snapshot: {
          name: `${e.firstName} ${e.lastName}`, position: e.position.title, department: e.department.name,
          grade: e.salaryGrade, step: e.salaryStep, schedule: e.schedule.name, employeeNo: e.employeeNo,
        },
        basic: phpOf(res.basicCents), ot: phpOf(res.otCents), lateDeduct: phpOf(res.lateDeductCents), gross: phpOf(res.grossCents),
        gsis: phpOf(res.gsisCents), philhealth: phpOf(res.philhealthCents), pagibig: phpOf(res.pagibigCents), wtax: phpOf(res.wtaxCents),
        loan: phpOf(res.loanCents), totalDeduct: phpOf(res.totalDeductCents), net: phpOf(res.netCents),
        rulesUsed: { gsis: gsis.id, philhealth: ph.id, pagibig: pi.id, wtax: wtax.id, asOf },
        earnings: { create: res.earningLines.map((l) => ({ label: l.label, amount: phpOf(l.cents) })) },
        deductions: { create: res.deductionLines.map((l) => ({ label: l.label, amount: phpOf(l.cents) })) },
        attendance: { create: snap },
      },
    });
  }
  await prisma.payrollRun.update({
    where: { id: runId },
    data: {
      status: "COMPUTED", progress: 100, employeeCount: employees.length,
      gross: phpOf(gross), deductions: phpOf(deduct), net: phpOf(net),
      stage: "Computed", log: { push: "Computed & persisted immutably" },
    },
  });
}
