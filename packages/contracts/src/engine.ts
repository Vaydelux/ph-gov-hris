/**
 * PURE DOMAIN ENGINE — authoritative computation reference for payroll,
 * attendance, government deductions, leave and loans. Integer-centavo money.
 * Consumed by the NestJS API (apps/api) and BullMQ worker (apps/worker).
 * Mirrored by the web preview adapter at src/server/engine.ts.
 */

export interface WorkShiftLike { startMin: number; endMin: number; graceMin: number; lunchMin: number; }
export interface ContributionRuleLike { effectiveFrom: string; employeeBps?: number; employerBps?: number; monthlyFloorCents?: number; monthlyCapCents?: number; }
export interface TaxBracketLike { fromCents: number; toCents: number | null; baseCents: number; rateBps: number; }

/* ---------- salary schedule ---------- */
export const stepSalaryCents = (step1Cents: number, step: number) => step1Cents + (step - 1) * 2_000_00;

/* ---------- attendance ---------- */
export interface AttendanceInput { clockIn: number; clockOut: number; shift: WorkShiftLike; isHoliday: boolean; isRestDay: boolean; }
export interface AttendanceComputed { totalMin: number; lateMin: number; undertimeMin: number; otMin: number; status: "ON_TIME" | "LATE" | "UNDERTIME" | "LATE_AND_UNDERTIME" | "HOLIDAY" | "REST_DAY"; }
export function processAttendance(i: AttendanceInput): AttendanceComputed {
  const worked = Math.max(0, i.clockOut - i.clockIn);
  if (i.isHoliday) return { totalMin: worked, lateMin: 0, undertimeMin: 0, otMin: 0, status: "HOLIDAY" };
  if (i.isRestDay) return { totalMin: worked, lateMin: 0, undertimeMin: 0, otMin: 0, status: "REST_DAY" };
  const scheduledMin = i.shift.endMin - i.shift.startMin - i.shift.lunchMin;
  const lateMin = Math.max(0, i.clockIn - (i.shift.startMin + i.shift.graceMin));
  const undertimeMin = Math.max(0, i.shift.endMin - i.clockOut);
  const otMin = Math.max(0, i.clockOut - i.shift.endMin - 60);
  const totalMin = Math.min(Math.max(0, worked - i.shift.lunchMin), scheduledMin);
  const status = lateMin > 0 && undertimeMin > 0 ? "LATE_AND_UNDERTIME" : lateMin > 0 ? "LATE" : undertimeMin > 0 ? "UNDERTIME" : "ON_TIME";
  return { totalMin, lateMin, undertimeMin, otMin, status };
}

/* ---------- effective-date resolution ---------- */
export function resolveEffectiveRule<T extends ContributionRuleLike>(rules: T[], asOfISO: string): T | null {
  const applicable = rules.filter((r) => r.effectiveFrom <= asOfISO);
  if (!applicable.length) return null;
  return applicable.reduce((a, b) => (b.effectiveFrom > a.effectiveFrom ? b : a));
}

/* ---------- contributions ---------- */
export const bpsOf = (basisCents: number, bps: number) => Math.round((basisCents * bps) / 10_000);
export function contributionCents(rule: ContributionRuleLike, monthlyCents: number): number {
  let basis = monthlyCents;
  if (rule.monthlyFloorCents != null) basis = Math.max(basis, rule.monthlyFloorCents);
  if (rule.monthlyCapCents != null) basis = Math.min(basis, rule.monthlyCapCents);
  return bpsOf(basis, rule.employeeBps ?? 0);
}

/* ---------- withholding tax (excess-over) ---------- */
export function withholdingTaxCents(brackets: TaxBracketLike[], taxableCents: number): number {
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
  gsisRule: ContributionRuleLike; philhealthRule: ContributionRuleLike; pagibigRule: ContributionRuleLike;
  taxBrackets: TaxBracketLike[];
  loanInstallmentCents: number;
}
export interface PayrollComputeResult {
  basicCents: number; otCents: number; lateDeductCents: number; grossCents: number;
  gsisCents: number; philhealthCents: number; pagibigCents: number; wtaxCents: number;
  loanCents: number; totalDeductCents: number; netCents: number;
  earningLines: Array<{ label: string; cents: number }>;
  deductionLines: Array<{ label: string; cents: number }>;
}
export function computePayroll(i: PayrollComputeInput): PayrollComputeResult {
  const basic = i.monthlyBasicCents;
  const daily = Math.round(basic / 22);
  const otCents = Math.round((daily / 8) * 1.25 * (i.otMin / 60));
  const lateDeductCents = Math.round((daily / 480) * (i.lateMin + i.utMin));
  const earningLines = [
    { label: "Basic Salary (SG)", cents: basic },
    ...i.allowanceLines,
    ...(otCents > 0 ? [{ label: "Overtime Pay (25%)", cents: otCents }] : []),
    ...(lateDeductCents > 0 ? [{ label: "Late / Undertime", cents: -lateDeductCents }] : []),
  ];
  const grossCents = earningLines.reduce((s, l) => s + l.cents, 0);
  const gsisCents = contributionCents(i.gsisRule, basic);
  const philhealthCents = contributionCents(i.philhealthRule, basic);
  const pagibigCents = contributionCents(i.pagibigRule, basic);
  const statutory = gsisCents + philhealthCents + pagibigCents;
  const wtaxCents = withholdingTaxCents(i.taxBrackets, Math.max(0, grossCents - statutory));
  const loanCents = Math.min(i.loanInstallmentCents, Math.max(0, grossCents - statutory - wtaxCents));
  const totalDeductCents = statutory + wtaxCents + loanCents;
  return {
    basicCents: basic, otCents, lateDeductCents, grossCents, gsisCents, philhealthCents, pagibigCents, wtaxCents,
    loanCents, totalDeductCents, netCents: grossCents - totalDeductCents,
    earningLines,
    deductionLines: [
      { label: "GSIS Premium", cents: gsisCents }, { label: "PhilHealth", cents: philhealthCents },
      { label: "Pag-IBIG", cents: pagibigCents }, { label: "Withholding Tax", cents: wtaxCents },
      ...(loanCents > 0 ? [{ label: "Loan Amortization", cents: loanCents }] : []),
    ],
  };
}

/* ---------- loans ---------- */
export function loanInstallmentCents(principalCents: number, months: number, annualRateBps = 600): number {
  const r = annualRateBps / 10_000 / 12;
  if (months <= 0) return principalCents;
  if (r === 0) return Math.ceil(principalCents / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principalCents * r * f) / (f - 1));
}

/* ---------- payroll workflow state machine ---------- */
export type PayrollStatus = "DRAFT" | "QUEUED" | "COMPUTING" | "COMPUTED" | "VERIFIED" | "APPROVED" | "RELEASED" | "FAILED" | "CANCELLED";
export const PAYROLL_TRANSITIONS: Record<PayrollStatus, PayrollStatus[]> = {
  DRAFT: ["QUEUED", "CANCELLED"],
  QUEUED: ["COMPUTING", "CANCELLED", "FAILED"],
  COMPUTING: ["COMPUTED", "FAILED", "CANCELLED"],
  COMPUTED: ["VERIFIED", "CANCELLED"],
  VERIFIED: ["APPROVED"],
  APPROVED: ["RELEASED"],
  RELEASED: [], // terminal & immutable
  FAILED: ["QUEUED"],
  CANCELLED: [],
};
export const assertPayrollTransition = (from: PayrollStatus, to: PayrollStatus): void => {
  if (!PAYROLL_TRANSITIONS[from]?.includes(to)) throw new Error(`INVALID_STATE: payroll run cannot move ${from} → ${to}`);
};

/* ---------- recruitment (decision-support only) ---------- */
export function computeMatchScore(resumeText: string, keywords: string[]): number {
  if (!keywords.length) return 50;
  const hay = resumeText.toLowerCase();
  const hits = keywords.filter((k) => hay.includes(k.trim().toLowerCase())).length;
  return Math.min(97, Math.round((hits / keywords.length) * 82 + 10));
}
