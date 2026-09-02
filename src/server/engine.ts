/**
 * PURE DOMAIN ENGINE — integer-centavo money math, effective-dated rule
 * resolution, attendance & payroll computations. No UI, no storage, no clock.
 *
 * Production note: this file is the authoritative computation reference. In
 * the monorepo it lives at `packages/contracts/src/engine.ts` and is consumed
 * by the NestJS API and the BullMQ worker — never by React for real payroll.
 */
import { sumCents } from "../lib/core";
import type { ContributionRule, TaxBracket, WorkShift } from "../lib/contracts";

/* ---------- salary schedule (Standardized Salary Schedule) ---------- */
export const stepSalaryCents = (step1Cents: number, step: number) =>
  step1Cents + (step - 1) * 2_000_00; // ₱2,000 step increment (demo SSL convention)

/* ---------- attendance ---------- */
export interface AttendanceInput { clockIn: number; clockOut: number; shift: WorkShift; isHoliday: boolean; isRestDay: boolean; }
export interface AttendanceComputed {
  totalMin: number; lateMin: number; undertimeMin: number; otMin: number;
  status: "ON_TIME" | "LATE" | "UNDERTIME" | "LATE_AND_UNDERTIME" | "HOLIDAY" | "REST_DAY";
}
export function processAttendance(i: AttendanceInput): AttendanceComputed {
  if (i.isHoliday) return { totalMin: Math.max(0, i.clockOut - i.clockIn), lateMin: 0, undertimeMin: 0, otMin: 0, status: "HOLIDAY" };
  if (i.isRestDay) return { totalMin: Math.max(0, i.clockOut - i.clockIn), lateMin: 0, undertimeMin: 0, otMin: 0, status: "REST_DAY" };
  const scheduledMin = i.shift.endMin - i.shift.startMin - i.shift.lunchMin;
  const lateMin = Math.max(0, i.clockIn - (i.shift.startMin + i.shift.graceMin));
  const undertimeMin = Math.max(0, i.shift.endMin - i.clockOut);
  const otMin = Math.max(0, i.clockOut - i.shift.endMin - 60); // OT credited beyond 1h past shift end
  const workedMin = Math.max(0, i.clockOut - i.clockIn - i.shift.lunchMin);
  const totalMin = Math.min(workedMin, scheduledMin);
  const status = lateMin > 0 && undertimeMin > 0 ? "LATE_AND_UNDERTIME"
    : lateMin > 0 ? "LATE" : undertimeMin > 0 ? "UNDERTIME" : "ON_TIME";
  return { totalMin, lateMin, undertimeMin, otMin, status };
}

/* ---------- government rules: effective-date resolution ----------
   Rule versions are immutable once published; a run resolves the newest rule
   whose effectiveFrom <= asOf. Released payroll keeps the resolved version. */
export function resolveEffectiveRule<T extends ContributionRule>(rules: T[], asOfISO: string): T | null {
  const applicable = rules.filter((r) => r.effectiveFrom <= asOfISO);
  if (!applicable.length) return null;
  return applicable.reduce((a, b) => (b.effectiveFrom > a.effectiveFrom ? b : a));
}

/* ---------- contributions (basis points on monthly compensation) ---------- */
export const bpsOf = (basisCents: number, bps: number) => Math.round((basisCents * bps) / 10_000);
export function contributionCents(rule: ContributionRule, monthlyCents: number): number {
  let basis = monthlyCents;
  if (rule.monthlyFloorCents != null) basis = Math.max(basis, rule.monthlyFloorCents);
  if (rule.monthlyCapCents != null) basis = Math.min(basis, rule.monthlyCapCents);
  return bpsOf(basis, rule.employeeBps ?? 0);
}

/* ---------- withholding tax (semi-monthly brackets, excess-over method) ---------- */
export function withholdingTaxCents(brackets: TaxBracket[], taxableCents: number): number {
  if (taxableCents <= 0) return 0;
  const sorted = [...brackets].sort((a, b) => a.fromCents - b.fromCents);
  const b = [...sorted].reverse().find((x) => taxableCents > x.fromCents) ?? sorted[0];
  if (!b) return 0;
  return b.baseCents + bpsOf(taxableCents - b.fromCents, b.rateBps);
}

/* ---------- payroll ---------- */
export interface PayrollComputeInput {
  monthlyBasicCents: number;
  allowanceLines: Array<{ label: string; cents: number }>;
  otMin: number; lateMin: number; utMin: number;
  gsisRule: ContributionRule; philhealthRule: ContributionRule; pagibigRule: ContributionRule;
  taxBrackets: TaxBracket[];
  loanInstallmentCents: number;
  attendanceSnapshot: { present: number; lateDays: number; absent: number; otMin: number; lateMin: number; utMin: number; };
}
export interface PayrollComputeResult {
  basicCents: number; otCents: number; lateDeductCents: number; grossCents: number;
  gsisCents: number; philhealthCents: number; pagibigCents: number; wtaxCents: number;
  loanCents: number; totalDeductCents: number; netCents: number;
  earningLines: Array<{ label: string; cents: number }>;
  deductionLines: Array<{ label: string; cents: number }>;
}
const dailyRateCents = (monthlyCents: number) => Math.round(monthlyCents / 22);
export function computePayroll(i: PayrollComputeInput): PayrollComputeResult {
  const basic = i.monthlyBasicCents;
  const daily = dailyRateCents(basic);
  const otCents = Math.round((daily / 8) * 1.25 * (i.otMin / 60));
  const lateDeductCents = Math.round((daily / 480) * (i.lateMin + i.utMin)); // 480 min/day
  const earningLines = [
    { label: "Basic Salary (SG)", cents: basic },
    ...i.allowanceLines,
    ...(otCents > 0 ? [{ label: "Overtime Pay (25%)", cents: otCents }] : []),
    ...(lateDeductCents > 0 ? [{ label: "Late / Undertime", cents: -lateDeductCents }] : []),
  ];
  const grossCents = sumCents(earningLines.map((l) => l.cents));
  const gsisCents = contributionCents(i.gsisRule, basic);
  const philhealthCents = contributionCents(i.philhealthRule, basic);
  const pagibigCents = contributionCents(i.pagibigRule, basic);
  const statutory = gsisCents + philhealthCents + pagibigCents;
  const wtaxCents = withholdingTaxCents(i.taxBrackets, Math.max(0, grossCents - statutory));
  const loanCents = Math.min(i.loanInstallmentCents, Math.max(0, grossCents - statutory - wtaxCents));
  const totalDeductCents = statutory + wtaxCents + loanCents;
  const deductionLines = [
    { label: "GSIS Premium", cents: gsisCents },
    { label: "PhilHealth", cents: philhealthCents },
    { label: "Pag-IBIG", cents: pagibigCents },
    { label: "Withholding Tax", cents: wtaxCents },
    ...(loanCents > 0 ? [{ label: "Loan Amortization", cents: loanCents }] : []),
  ];
  return { basicCents: basic, otCents, lateDeductCents, grossCents, gsisCents, philhealthCents, pagibigCents, wtaxCents, loanCents, totalDeductCents, netCents: grossCents - totalDeductCents, earningLines, deductionLines };
}

/* ---------- loans ---------- */
export function loanInstallmentCents(principalCents: number, months: number, annualRateBps = 600): number {
  const r = annualRateBps / 10_000 / 12;
  if (months <= 0) return principalCents;
  if (r === 0) return Math.ceil(principalCents / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principalCents * r * f) / (f - 1));
}

/* ---------- recruitment: keyword match (decision-support ONLY) ---------- */
export function computeMatchScore(resumeText: string, keywords: string[]): number {
  if (!keywords.length) return 50;
  const hay = resumeText.toLowerCase();
  const hits = keywords.filter((k) => hay.includes(k.trim().toLowerCase())).length;
  return Math.min(97, Math.round((hits / keywords.length) * 82 + 10));
}
