/**
 * Mandatory payroll/attendance calculation tests.
 * Run with: npx vitest run
 * The same assertions apply to packages/contracts (identical engine).
 */
import { describe, expect, it } from "vitest";
import {
  computePayroll, contributionCents, loanInstallmentCents, processAttendance,
  resolveEffectiveRule, stepSalaryCents, withholdingTaxCents, computeMatchScore,
} from "./engine";
import type { ContributionRule, TaxBracket, WorkShift } from "../lib/contracts";

const SHIFT: WorkShift = { id: "sh1", name: "Regular", startMin: 480, endMin: 1020, graceMin: 15, lunchMin: 60 };
const gsis: ContributionRule = { id: "g", schemeId: "sch_gsis", effectiveFrom: "2024-01-01", employeeBps: 900, employerBps: 1250, note: "demo", demo: true };
const ph: ContributionRule = { id: "p", schemeId: "sch_ph", effectiveFrom: "2024-01-01", employeeBps: 250, monthlyCapCents: 10_000_000, note: "demo", demo: true };
const pi: ContributionRule = { id: "h", schemeId: "sch_pi", effectiveFrom: "2024-01-01", employeeBps: 200, monthlyCapCents: 1_000_000, note: "demo", demo: true };
const BRACKETS: TaxBracket[] = [
  { id: "b1", ruleId: "t", fromCents: 0, toCents: 2_083_300, baseCents: 0, rateBps: 0 },
  { id: "b2", ruleId: "t", fromCents: 2_083_300, toCents: 3_333_300, baseCents: 0, rateBps: 1500 },
  { id: "b3", ruleId: "t", fromCents: 3_333_300, toCents: 6_666_700, baseCents: 187_500, rateBps: 2000 },
];

describe("attendance: late / undertime / overtime", () => {
  it("on-time arrival within grace period is ON_TIME", () => {
    const r = processAttendance({ clockIn: 490, clockOut: 1020, shift: SHIFT, isHoliday: false, isRestDay: false });
    expect(r.status).toBe("ON_TIME");
    expect(r.lateMin).toBe(0);
    expect(r.totalMin).toBe(480); // 540 worked - 60 lunch
  });
  it("arrival past grace is LATE with exact minutes", () => {
    const r = processAttendance({ clockIn: 520, clockOut: 1020, shift: SHIFT, isHoliday: false, isRestDay: false });
    expect(r.lateMin).toBe(25); // 520 - (480 + 15)
    expect(r.status).toBe("LATE");
  });
  it("early departure is UNDERTIME; both yields LATE_AND_UNDERTIME", () => {
    const r = processAttendance({ clockIn: 480, clockOut: 990, shift: SHIFT, isHoliday: false, isRestDay: false });
    expect(r.undertimeMin).toBe(30);
    expect(r.status).toBe("UNDERTIME");
    const both = processAttendance({ clockIn: 530, clockOut: 960, shift: SHIFT, isHoliday: false, isRestDay: false });
    expect(both.status).toBe("LATE_AND_UNDERTIME");
    expect(both.lateMin).toBe(35);
    expect(both.undertimeMin).toBe(60);
  });
  it("OT credited only beyond 60 minutes past shift end", () => {
    const r = processAttendance({ clockIn: 480, clockOut: 1140, shift: SHIFT, isHoliday: false, isRestDay: false });
    expect(r.otMin).toBe(60); // 1140-1020=120 - 60 threshold
  });
  it("holidays and rest days carry no late/UT", () => {
    expect(processAttendance({ clockIn: 600, clockOut: 900, shift: SHIFT, isHoliday: true, isRestDay: false }).status).toBe("HOLIDAY");
    expect(processAttendance({ clockIn: 600, clockOut: 900, shift: SHIFT, isHoliday: false, isRestDay: true }).status).toBe("REST_DAY");
  });
});

describe("effective-date rule resolution", () => {
  const rules: ContributionRule[] = [
    { id: "old", schemeId: "s", effectiveFrom: "2023-01-01", employeeBps: 875, note: "", demo: true },
    { id: "new", schemeId: "s", effectiveFrom: "2024-01-01", employeeBps: 900, note: "", demo: true },
  ];
  it("picks newest rule effective on/before the date", () => {
    expect(resolveEffectiveRule(rules, "2024-06-15")?.id).toBe("new");
    expect(resolveEffectiveRule(rules, "2023-12-31")?.id).toBe("old");
  });
  it("returns null before any effectivity (refuse-to-compute guard)", () => {
    expect(resolveEffectiveRule(rules, "2022-01-01")).toBeNull();
  });
});

describe("government deduction math (integer centavos)", () => {
  it("GSIS 9% of ₱30,000 = ₱2,700", () => {
    expect(contributionCents(gsis, 3_000_000)).toBe(270_000);
  });
  it("PhilHealth respects the monthly cap", () => {
    expect(contributionCents(ph, 20_000_000)).toBe(250_00 * 100); // 2.5% of capped ₱100k = ₱2,500
  });
  it("Pag-IBIG caps at ₱10,000 basis → ₱200", () => {
    expect(contributionCents(pi, 5_000_000)).toBe(20_000);
  });
  it("withholding tax uses excess-over brackets", () => {
    expect(withholdingTaxCents(BRACKETS, 1_000_000)).toBe(0); // below threshold
    expect(withholdingTaxCents(BRACKETS, 2_500_000)).toBe(62_500); // 15% of 416,700 over 2,083,300
    expect(withholdingTaxCents(BRACKETS, 4_000_000)).toBe(187_500 + 133_340); // base + 20% excess
    expect(withholdingTaxCents(BRACKETS, 0)).toBe(0);
  });
  it("produces whole centavos — never floats", () => {
    const v = contributionCents(gsis, 3_333_333);
    expect(Number.isInteger(v)).toBe(true);
  });
});

describe("payroll computation end-to-end", () => {
  const base = {
    monthlyBasicCents: 3_000_000, allowanceLines: [{ label: "PERA", cents: 100_000 }],
    otMin: 120, lateMin: 30, utMin: 0, gsisRule: gsis, philhealthRule: ph, pagibigRule: pi,
    taxBrackets: BRACKETS, loanInstallmentCents: 0,
    attendanceSnapshot: { present: 10, lateDays: 1, absent: 0, otMin: 120, lateMin: 30, utMin: 0 },
  };
  it("gross = basic + allowances + OT − late deduction", () => {
    const r = computePayroll(base);
    const daily = Math.round(3_000_000 / 22);
    const expectedOt = Math.round((daily / 8) * 1.25 * 2);
    const expectedLate = Math.round((daily / 480) * 30);
    expect(r.otCents).toBe(expectedOt);
    expect(r.lateDeductCents).toBe(expectedLate);
    expect(r.grossCents).toBe(3_000_000 + 100_000 + expectedOt - expectedLate);
  });
  it("net = gross − (GSIS + PH + PI + WTax + loan) exactly", () => {
    const r = computePayroll(base);
    expect(r.netCents).toBe(r.grossCents - r.totalDeductCents);
    expect(r.totalDeductCents).toBe(r.gsisCents + r.philhealthCents + r.pagibigCents + r.wtaxCents + r.loanCents);
  });
  it("loan deduction never exceeds take-home and never goes negative", () => {
    const r = computePayroll({ ...base, loanInstallmentCents: 999_999_999 });
    expect(r.loanCents).toBeLessThanOrEqual(r.grossCents - r.gsisCents - r.philhealthCents - r.pagibigCents - r.wtaxCents);
    expect(r.netCents).toBeGreaterThanOrEqual(0);
  });
  it("salary steps: each step adds ₱2,000", () => {
    expect(stepSalaryCents(2_000_000, 3)).toBe(2_000_000 + 2 * 200_000);
  });
});

describe("loan amortization & match score", () => {
  it("installments sum to ≥ principal (interest) and are whole centavos", () => {
    const inst = loanInstallmentCents(8_000_000, 24);
    expect(Number.isInteger(inst)).toBe(true);
    expect(inst * 24).toBeGreaterThanOrEqual(8_000_000);
  });
  it("match score is bounded decision-support", () => {
    expect(computeMatchScore("sql excel analytics", ["sql", "excel", "analytics"])).toBeLessThanOrEqual(97);
    expect(computeMatchScore("unrelated", ["sql"])).toBeLessThan(50);
  });
});
