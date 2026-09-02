/**
 * DEVELOPMENT SEED — fictional Philippine government demo data.
 *
 *   pnpm db:seed          (run from apps/api or wherever prisma is configured)
 *
 * SAFETY: refuses to run when NODE_ENV=production. Demo government rates are
 * inserted with demo=true and must be replaced with legally verified
 * configuration before real payroll. Historical payroll lines in this seed
 * are computed with the same @gov-hris/contracts engine the worker uses, so
 * the seeded history is internally consistent and reproducible.
 */
import { PrismaClient } from "@prisma/client";
import { buildSeed } from "../src/server/seed";
import { computePayroll, resolveEffectiveRule } from "../packages/contracts/src/engine";

const php = (cents: number) => (cents / 100).toFixed(2);

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data in production. Use a controlled data load instead.");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const s = buildSeed();
  console.log(`[seed] fictional dataset: ${s.employees.length} employees, ${s.departments.length} departments`);

  /* org + schedules */
  const agency = await prisma.agency.upsert({ where: { code: s.agency.code }, update: {}, create: { code: s.agency.code, name: s.agency.name } });
  const office = await prisma.office.upsert({ where: { code: "HQ" }, update: {}, create: { agencyId: agency.id, code: "HQ", name: "Central Office" } });
  const deptIds = new Map<string, string>();
  for (const d of s.departments) {
    const rec = await prisma.department.upsert({ where: { code: d.code }, update: {}, create: { officeId: office.id, code: d.code, name: d.name } });
    deptIds.set(d.id, rec.id);
  }
  const posIds = new Map<string, string>();
  for (const p of s.positions) {
    const rec = await prisma.position.upsert({ where: { code: p.code }, update: {}, create: { departmentId: deptIds.get(p.departmentId)!, code: p.code, title: p.title, salaryGrade: p.salaryGrade } });
    posIds.set(p.id, rec.id);
  }
  const schedIds = new Map<string, string>();
  for (const ss of s.salarySchedules) {
    const rec = await prisma.salarySchedule.upsert({ where: { id: ss.id }, update: {}, create: { id: ss.id, name: ss.name, effectiveFrom: new Date(ss.effectiveFrom) } });
    schedIds.set(ss.id, rec.id);
  }
  for (const g of s.salaryGrades) {
    const grade = await prisma.salaryGrade.upsert({
      where: { scheduleId_grade: { scheduleId: schedIds.get(g.scheduleId)!, grade: g.grade } }, update: {},
      create: { scheduleId: schedIds.get(g.scheduleId)!, grade: g.grade },
    });
    for (let step = 1; step <= 8; step++) {
      await prisma.salaryStep.upsert({
        where: { gradeId_step: { gradeId: grade.id, step } }, update: {},
        create: { gradeId: grade.id, step, rate: php(g.step1Cents + (step - 1) * 200000) },
      });
    }
  }
  const shiftIds = new Map<string, string>();
  for (const sh of s.shifts) {
    const rec = await prisma.shift.upsert({ where: { id: sh.id }, update: {}, create: { id: sh.id, name: sh.name, startMin: sh.startMin, endMin: sh.endMin, graceMin: sh.graceMin, lunchMin: sh.lunchMin } });
    shiftIds.set(sh.id, rec.id);
  }
  for (const h of s.holidays) await prisma.holiday.upsert({ where: { date: new Date(h.date) }, update: {}, create: { date: new Date(h.date), name: h.name, type: h.type } });

  /* identity + employees */
  for (const u of s.users) {
    await prisma.userProfile.upsert({ where: { email: u.email }, update: { fullName: u.fullName, active: u.active }, create: { email: u.email, fullName: u.fullName, active: u.active } });
  }
  const empIds = new Map<string, string>();
  for (const e of s.employees) {
    const rec = await prisma.employee.upsert({
      where: { employeeNo: e.employeeNo }, update: {},
      create: {
        employeeNo: e.employeeNo, firstName: e.firstName, middleName: e.middleName, lastName: e.lastName,
        email: e.email, phone: e.phone, departmentId: deptIds.get(e.departmentId)!, positionId: posIds.get(e.positionId)!,
        salaryGrade: e.salaryGrade, salaryStep: e.salaryStep, scheduleId: schedIds.get(e.scheduleId)!, shiftId: shiftIds.get(e.shiftId)!,
        appointmentType: e.appointmentType, status: e.status, hiredAt: new Date(e.hiredAt),
        birthDate: e.birthDate ? new Date(e.birthDate) : null, gender: e.gender, address: e.address,
        tin: e.tin, gsisNo: e.gsisNo, philhealthNo: e.philhealthNo, pagibigNo: e.pagibigNo,
        bankName: e.bankName, avatarHue: e.avatarHue,
      },
    });
    empIds.set(e.id, rec.id);
  }

  /* government schemes + DEMO-flagged rules */
  for (const sch of s.schemes) {
    const rec = await prisma.governmentContributionScheme.upsert({ where: { code: sch.code }, update: {}, create: { code: sch.code, name: sch.name, description: sch.description } });
    for (const r of s.contributionRules.filter((x) => x.schemeId === sch.id)) {
      const rule = await prisma.governmentContributionRule.create({
        data: {
          schemeId: rec.id, effectiveFrom: new Date(r.effectiveFrom), employeeBps: r.employeeBps, employerBps: r.employerBps,
          monthlyCap: r.monthlyCapCents != null ? php(r.monthlyCapCents) : null, monthlyFloor: r.monthlyFloorCents != null ? php(r.monthlyFloorCents) : null,
          note: r.note, demo: true, // DEMO DATA — replace with legally verified tables before real payroll
        },
      });
      for (const b of s.taxBrackets.filter((x) => x.ruleId === r.id)) {
        await prisma.taxBracket.create({ data: { ruleId: rule.id, fromAmt: php(b.fromCents), toAmt: b.toCents != null ? php(b.toCents) : null, baseAmt: php(b.baseCents), rateBps: b.rateBps } });
      }
    }
  }

  /* leave types, allowance types + grants, loan types + ledger */
  for (const lt of s.leaveTypes) await prisma.leaveType.upsert({ where: { code: lt.code }, update: {}, create: { code: lt.code, name: lt.name, annualDays: lt.annualDays, requiresDoc: lt.requiresDoc, color: lt.color } });
  for (const at of s.allowanceTypes) await prisma.allowanceType.upsert({ where: { code: at.code }, update: {}, create: { code: at.code, name: at.name, monthly: php(at.monthlyCents), taxable: at.taxable, active: at.active } });
  for (const lnt of s.loanTypes) await prisma.loanType.upsert({ where: { code: lnt.code }, update: {}, create: { code: lnt.code, name: lnt.name, maxAmount: php(lnt.maxAmountCents), maxTermMonths: lnt.maxTermMonths } });

  /* periods + released runs — recomputed with the real engine for consistency */
  const schemeRule = (code: string, asOf: string) =>
    resolveEffectiveRule(s.contributionRules.filter((r) => s.schemes.find((x) => x.id === r.schemeId)?.code === code), asOf)!;
  for (const p of s.periods) {
    const period = await prisma.payrollPeriod.upsert({ where: { label: p.label }, update: {}, create: { label: p.label, from: new Date(p.from), to: new Date(p.to), cutoff: new Date(p.cutoff), closed: p.closed } });
    const existing = await prisma.payrollRun.findUnique({ where: { idempotencyKey: `run:${p.id}` } });
    if (existing) continue; // idempotent re-seed
    const run = await prisma.payrollRun.create({
      data: {
        periodId: period.id, status: "RELEASED", idempotencyKey: `run:${p.id}`, progress: 100,
        stage: "Released", log: ["Seeded historical run"], employeeCount: 0, gross: 0, deductions: 0, net: 0,
        releasedAt: new Date(`${p.to}T18:00:00Z`),
      },
    });
    let gross = 0, deduct = 0, net = 0;
    for (const e of s.employees.filter((x) => x.status === "ACTIVE")) {
      const grade = s.salaryGrades.find((g) => g.grade === e.salaryGrade)!;
      const basic = grade.step1Cents + (e.salaryStep - 1) * 200000;
      const res = computePayroll({
        monthlyBasicCents: basic, allowanceLines: [], otMin: 0, lateMin: 0, utMin: 0,
        gsisRule: schemeRule("GSIS", p.to), philhealthRule: schemeRule("PHILHEALTH", p.to), pagibigRule: schemeRule("PAGIBIG", p.to),
        taxBrackets: s.taxBrackets.filter((b) => b.ruleId === schemeRule("WTAX", p.to).id),
        loanInstallmentCents: 0, attendanceSnapshot: { present: 10, lateDays: 0, absent: 0, otMin: 0, lateMin: 0, utMin: 0 },
      });
      gross += res.grossCents; deduct += res.totalDeductCents; net += res.netCents;
      await prisma.employeePayroll.create({
        data: {
          runId: run.id, employeeId: empIds.get(e.id)!,
          snapshot: { name: `${e.firstName} ${e.lastName}`, position: s.positions.find((x) => x.id === e.positionId)?.title, grade: e.salaryGrade, step: e.salaryStep, employeeNo: e.employeeNo },
          basic: php(res.basicCents), gross: php(res.grossCents), gsis: php(res.gsisCents), philhealth: php(res.philhealthCents),
          pagibig: php(res.pagibigCents), wtax: php(res.wtaxCents), totalDeduct: php(res.totalDeductCents), net: php(res.netCents),
          rulesUsed: { note: "demo rules effective at period end", asOf: p.to },
          attendance: { create: { present: 10, lateDays: 0, absent: 0, otMin: 0, lateMin: 0, utMin: 0 } },
          earnings: { create: res.earningLines.map((l) => ({ label: l.label, amount: php(l.cents) })) },
          deductions: { create: res.deductionLines.map((l) => ({ label: l.label, amount: php(l.cents) })) },
        },
      });
    }
    await prisma.payrollRun.update({ where: { id: run.id }, data: { employeeCount: s.employees.filter((x) => x.status === "ACTIVE").length, gross: php(gross), deductions: php(deduct), net: php(net) } });
    console.log(`[seed] run ${p.label}: net ${php(net)}`);
  }

  /* recruitment */
  for (const j of s.jobs) {
    await prisma.jobPosting.upsert({
      where: { slug: j.slug }, update: {},
      create: {
        slug: j.slug, title: j.title, departmentId: deptIds.get(j.departmentId)!, positionTitle: j.positionTitle, salaryGrade: j.salaryGrade,
        employmentType: j.employmentType, workLocation: j.workLocation, summary: j.summary, responsibilities: j.responsibilities,
        qualifications: j.qualifications, keywords: j.keywords, openings: j.openings, deadline: new Date(j.deadline), status: j.status,
      },
    });
  }
  console.log("[seed] done. All government rates in this seed are flagged demo=true.");
}

main().catch((e) => { console.error(e); process.exit(1); });
