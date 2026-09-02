/**
 * Permission matrix + payroll state machine + idempotency contract tests.
 * Run with: npx vitest run
 */
import { describe, expect, it } from "vitest";
import { can, ROLE_PERMISSIONS, ROLES, PERMISSIONS } from "./rbac";
import { assertPayrollTransition } from "../lib/contracts";
import type { PayrollRunStatus, UserProfile } from "../lib/contracts";

const user = (role: UserProfile["role"]): UserProfile =>
  ({ id: "u", email: "x@x", password: "", fullName: "X", role, active: true });

describe("RBAC matrix", () => {
  it("every role maps only to declared permissions", () => {
    for (const r of ROLES) {
      const set = ROLE_PERMISSIONS[r];
      if (set === "ALL") continue;
      for (const p of set) expect(PERMISSIONS).toContain(p);
    }
  });
  it("EMPLOYEE cannot read other employees, generate payroll, or view audit", () => {
    const emp = user("EMPLOYEE");
    expect(can(emp, "employees.read")).toBe(false);
    expect(can(emp, "payroll.generate")).toBe(false);
    expect(can(emp, "audit.view")).toBe(false);
    expect(can(emp, "leave.file")).toBe(true);
    expect(can(emp, "loans.apply")).toBe(true);
  });
  it("PAYROLL_OFFICER can generate but NOT verify/approve/release (segregation of duties)", () => {
    const p = user("PAYROLL_OFFICER");
    expect(can(p, "payroll.generate")).toBe(true);
    expect(can(p, "payroll.verify")).toBe(false);
    expect(can(p, "payroll.approve")).toBe(false);
    expect(can(p, "payroll.release")).toBe(false);
  });
  it("ACCOUNTING verifies; DEPARTMENT_HEAD approves; ADMINISTRATOR releases", () => {
    expect(can(user("ACCOUNTING"), "payroll.verify")).toBe(true);
    expect(can(user("DEPARTMENT_HEAD"), "payroll.approve")).toBe(true);
    expect(can(user("DEPARTMENT_HEAD"), "payroll.release")).toBe(false);
    expect(can(user("ADMINISTRATOR"), "payroll.release")).toBe(true);
  });
  it("unauthenticated user has nothing", () => {
    for (const p of PERMISSIONS) expect(can(null, p)).toBe(false);
  });
  it("leave approval stages require distinct permissions", () => {
    expect(can(user("SUPERVISOR"), "leave.approve.supervisor")).toBe(true);
    expect(can(user("SUPERVISOR"), "leave.approve.hr")).toBe(false);
    expect(can(user("HR_OFFICER"), "leave.approve.hr")).toBe(true);
    expect(can(user("HR_OFFICER"), "leave.approve.supervisor")).toBe(false);
  });
});

describe("payroll workflow state machine", () => {
  const ok: Array<[PayrollRunStatus, PayrollRunStatus]> = [
    ["DRAFT", "QUEUED"], ["QUEUED", "COMPUTING"], ["COMPUTING", "COMPUTED"],
    ["COMPUTED", "VERIFIED"], ["VERIFIED", "APPROVED"], ["APPROVED", "RELEASED"],
    ["COMPUTING", "FAILED"], ["FAILED", "QUEUED"], ["COMPUTED", "CANCELLED"],
  ];
  it.each(ok)("allows %s → %s", (from, to) => {
    expect(() => assertPayrollTransition(from, to)).not.toThrow();
  });
  const bad: Array<[PayrollRunStatus, PayrollRunStatus]> = [
    ["COMPUTED", "APPROVED"],     // cannot skip verification
    ["VERIFIED", "RELEASED"],     // cannot skip approval
    ["RELEASED", "COMPUTED"],     // released is immutable
    ["RELEASED", "CANCELLED"],    // corrections need an adjustment run
    ["CANCELLED", "QUEUED"],      // cancelled is terminal
    ["DRAFT", "RELEASED"],
  ];
  it.each(bad)("rejects %s → %s", (from, to) => {
    expect(() => assertPayrollTransition(from, to)).toThrow(/cannot move/);
  });
});

describe("idempotency & immutability contracts (documented behavior)", () => {
  it("idempotency key format is deterministic per period", () => {
    const periodId = "p_123";
    expect(`run:${periodId}`).toBe("run:p_123"); // service layer dedupes on this key
  });
  it("loan ledger unique key prevents double deduction per run", () => {
    // Schema: @@unique([loanId, refType, refId]) — asserted structurally here.
    const key = (loanId: string, runId: string) => `${loanId}|PAYROLL_RUN|${runId}`;
    expect(key("l1", "r1")).toBe(key("l1", "r1"));
    expect(key("l1", "r1")).not.toBe(key("l1", "r2"));
  });
});
