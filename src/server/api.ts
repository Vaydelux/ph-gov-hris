/**
 * AUTHORITATIVE SERVICE LAYER — PREVIEW ADAPTER.
 *
 * This is the in-browser implementation of the exact same API contract the
 * NestJS application (`apps/api`) exposes over REST. The web UI only ever
 * talks to this interface (`src/lib/api.ts` swaps this adapter for the HTTP
 * client in production mode). Business rules — payroll math, state machines,
 * RBAC, auditing, idempotency — live HERE (and in the NestJS mirror), never
 * inside React components.
 */
import { addDaysISO, sumCents, toCSV, todayISO, toCents, uid, workingDays } from "../lib/core";
import { config } from "../lib/config";
import { audit, emit, getDB, mutate, notify, persist, sessionUser, setSession, clearSession } from "./db";
import {
  computeMatchScore, computePayroll, loanInstallmentCents, processAttendance,
  resolveEffectiveRule, stepSalaryCents,
} from "./engine";
import { can, PERMISSIONS, ROLES, ROLE_PERMISSIONS, roleMatrix } from "./rbac";
import {
  ApiError,
  type Application, type AttendanceAdjustment, type CandidateStatus, type DB, type Employee,
  type EmployeePayroll, type LeaveRequest, type Page, type PageQuery, type PayrollRun, type PayrollRunStatus,
  type Permission, type ReportRun, type ReportType, type Role, type UserProfile,
} from "../lib/contracts";

export { can, PERMISSIONS, ROLES, ROLE_PERMISSIONS, roleMatrix };

const delay = (ms = 240) => new Promise<void>((r) => setTimeout(r, ms + Math.random() * 120));

/* ================= RBAC enforcement ================= */
const requireUser = (): UserProfile => {
  const u = sessionUser();
  if (!u) throw new ApiError("UNAUTHORIZED", "Session expired. Please sign in again.");
  return u;
};
const requirePerm = (perm: Permission): UserProfile => {
  const u = requireUser();
  if (!can(u, perm)) throw new ApiError("FORBIDDEN", `Your role (${u.role}) does not hold "${perm}".`);
  return u;
};
const visibleEmployeeIds = (u: UserProfile): Set<string> | "ALL" => {
  if (["SYSTEM_ADMIN", "ADMINISTRATOR", "HR_OFFICER", "PAYROLL_OFFICER", "ACCOUNTING", "HIRING_MANAGER"].includes(u.role)) return "ALL";
  const mine = u.employeeId;
  if (u.role === "EMPLOYEE") return new Set(mine ? [mine] : []);
  const d = getDB();
  const me = d.employees.find((e) => e.id === mine);
  if (u.role === "DEPARTMENT_HEAD" && me) return new Set(d.employees.filter((e) => e.departmentId === me.departmentId).map((e) => e.id));
  if (u.role === "SUPERVISOR") return new Set(d.employees.filter((e) => e.supervisorId === mine || e.id === mine).map((e) => e.id));
  return new Set(mine ? [mine] : []);
};
const assertVisible = (u: UserProfile, employeeId: string) => {
  const scope = visibleEmployeeIds(u);
  if (scope !== "ALL" && !scope.has(employeeId))
    throw new ApiError("FORBIDDEN", "You do not have access to this employee record.");
};
const paginate = <T,>(rows: T[], q: PageQuery, pageSize = 12): Page<T> => {
  const page = Math.max(1, q.page ?? 1);
  const size = Math.min(100, q.pageSize ?? pageSize);
  return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size };
};

/* ================= AUTH ================= */
export async function login(email: string, password: string): Promise<UserProfile> {
  await delay(420);
  const u = getDB().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u || u.password !== password) throw new ApiError("INVALID_CREDENTIALS", "Invalid email or password.");
  if (!u.active) throw new ApiError("ACCOUNT_DISABLED", "This account has been deactivated.");
  setSession(u.id);
  mutate((d) => { const x = d.users.find((y) => y.id === u.id)!; x.lastLoginAt = new Date().toISOString(); });
  audit(u, "auth.login", "UserProfile", u.id, null, { email: u.email });
  persist();
  return u;
}
export async function logout(): Promise<void> {
  const u = sessionUser();
  if (u) { audit(u, "auth.logout", "UserProfile", u.id); persist(); }
  clearSession();
}
export async function me(): Promise<UserProfile | null> { await delay(60); return sessionUser(); }
export async function forgotPassword(email: string): Promise<string> {
  await delay(600);
  const u = getDB().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (u) audit(u, "auth.password_reset_requested", "UserProfile", u.id);
  return "If the account exists, a reset link has been queued for email delivery (background worker).";
}
/** PREVIEW-ONLY persona switch. Does not exist in the production HTTP API. */
export async function previewLoginAs(userId: string): Promise<UserProfile> {
  if (!config.isPreview) throw new ApiError("FORBIDDEN", "Preview persona switching is disabled in production mode.");
  const u = getDB().users.find((x) => x.id === userId);
  if (!u) throw new ApiError("NOT_FOUND", "Persona not found.");
  setSession(u.id);
  audit(u, "preview.persona_switch", "UserProfile", u.id, null, { role: u.role });
  persist();
  return u;
}

/* ================= DASHBOARDS ================= */
export async function adminDashboard() {
  await delay();
  const d = getDB(); const today = todayISO();
  const todays = d.attendance.filter((a) => a.date === today);
  const present = todays.filter((a) => a.clockIn != null || ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME", "OFFICIAL_BUSINESS"].includes(a.status)).length;
  const late = todays.filter((a) => a.lateMin > 0).length;
  const onLeave = todays.filter((a) => a.status === "ON_LEAVE").length;
  const active = d.employees.filter((e) => e.status === "ACTIVE");
  const absent = Math.max(0, active.length - present - onLeave);
  const trend: Array<{ date: string; present: number; late: number }> = [];
  for (let back = 13; back >= 0; back--) {
    const date = addDaysISO(today, -back);
    const rows = d.attendance.filter((a) => a.date === date);
    if (!rows.length) continue;
    trend.push({ date: date.slice(5), present: rows.filter((a) => a.status !== "ABSENT" && a.status !== "ON_LEAVE").length, late: rows.filter((a) => a.lateMin > 0).length });
  }
  const byDept = d.departments.map((dep) => ({ name: dep.name.replace(" Division", "").replace(" Office", ""), count: d.employees.filter((e) => e.departmentId === dep.id && e.status === "ACTIVE").length }));
  return {
    totalEmployees: active.length, presentToday: present, lateToday: late, absentOrLeave: absent + onLeave,
    attendanceRate: active.length ? Math.round(((present + onLeave) / active.length) * 100) : 0,
    pendingLeave: d.leaveRequests.filter((r) => r.status === "PENDING_SUPERVISOR" || r.status === "PENDING_HR").length,
    pendingAdjustments: d.adjustments.filter((a) => a.status === "PENDING").length,
    openVacancies: d.jobs.filter((j) => j.status === "OPEN").reduce((s, j) => s + j.openings, 0),
    latestRun: d.runs.find((r) => !["CANCELLED", "FAILED"].includes(r.status)),
    trend, byDept, recentActivity: d.audit.slice(0, 9),
    pendingApplications: d.applications.filter((a) => a.status === "NEW").length,
  };
}
export async function myDashboard() {
  const u = requireUser(); await delay();
  const d = getDB(); const today = todayISO();
  const emp = d.employees.find((e) => e.id === u.employeeId);
  if (!emp) throw new ApiError("NO_EMPLOYEE_PROFILE", "No employee profile is linked to this account.");
  const todayAtt = d.attendance.find((a) => a.employeeId === emp.id && a.date === today);
  const ym = today.slice(0, 7);
  const month = d.attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(ym));
  const balances = d.leaveTypes.map((lt) => {
    const daysH = d.leaveLedger.filter((l) => l.employeeId === emp.id && l.leaveTypeId === lt.id).reduce((s, e) => s + (e.type === "DEBIT" ? -e.daysH : e.daysH), 0);
    return { ...lt, daysH, days: daysH / 100 };
  });
  const latestPayslip = d.payslips.filter((p) => p.employeeId === emp.id).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))[0];
  const ep = latestPayslip ? d.employeePayrolls.find((x) => x.id === latestPayslip.employeePayrollId) : undefined;
  const run = latestPayslip ? d.runs.find((r) => r.id === latestPayslip.runId) : undefined;
  const period = run ? d.periods.find((p) => p.id === run.periodId) : undefined;
  const loans = d.loans.filter((l) => l.employeeId === emp.id && ["ACTIVE", "UNDER_REVIEW", "SUBMITTED"].includes(l.status));
  return {
    employee: emp, todayAtt,
    monthStats: {
      present: month.filter((a) => ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME"].includes(a.status)).length,
      late: month.filter((a) => a.lateMin > 0).length,
      otMin: month.reduce((s, a) => s + a.otMin, 0),
      lateMin: month.reduce((s, a) => s + a.lateMin + a.undertimeMin, 0),
    },
    balances,
    latestPayslip: latestPayslip && ep ? { payslip: latestPayslip, ep, periodLabel: period?.label ?? "" } : null,
    loans: loans.map((l) => ({ ...l, typeName: d.loanTypes.find((t) => t.id === l.loanTypeId)!.name })),
    notifications: d.notifications.filter((n) => n.userId === u.id && !n.read).slice(0, 5),
    salaryCents: (() => { const g = d.salaryGrades.find((x) => x.grade === emp.salaryGrade)!; return stepSalaryCents(g.step1Cents, emp.salaryStep); })(),
  };
}

/* ================= EMPLOYEES ================= */
export async function listEmployees(q: PageQuery & { departmentId?: string; status?: string }) {
  const u = requirePerm("employees.read"); await delay();
  const d = getDB();
  const scope = visibleEmployeeIds(u);
  let rows = d.employees.filter((e) => (scope === "ALL" ? true : scope.has(e.id)));
  if (q.departmentId) rows = rows.filter((e) => e.departmentId === q.departmentId);
  if (q.status) rows = rows.filter((e) => e.status === q.status);
  if (q.q) {
    const s = q.q.toLowerCase();
    rows = rows.filter((e) => `${e.firstName} ${e.lastName} ${e.employeeNo} ${e.email}`.toLowerCase().includes(s) ||
      (d.positions.find((p) => p.id === e.positionId)?.title.toLowerCase().includes(s) ?? false));
  }
  const enriched = [...rows].sort((a, b) => a.lastName.localeCompare(b.lastName)).map((e) => ({
    ...e,
    fullName: `${e.lastName}, ${e.firstName}`,
    position: d.positions.find((p) => p.id === e.positionId)!.title,
    department: d.departments.find((x) => x.id === e.departmentId)!.name,
    salaryCents: stepSalaryCents(d.salaryGrades.find((g) => g.grade === e.salaryGrade)!.step1Cents, e.salaryStep),
  }));
  return paginate(enriched, q, 12);
}
export async function getEmployee(id: string) {
  const u = requirePerm("employees.read"); await delay();
  assertVisible(u, id);
  const d = getDB();
  const emp = d.employees.find((e) => e.id === id);
  if (!emp) throw new ApiError("NOT_FOUND", "Employee not found.");
  const balances = d.leaveTypes.map((lt) => ({ ...lt, daysH: d.leaveLedger.filter((l) => l.employeeId === id && l.leaveTypeId === lt.id).reduce((s, e) => s + (e.type === "DEBIT" ? -e.daysH : e.daysH), 0) }));
  const att30 = d.attendance.filter((a) => a.employeeId === id && a.date >= addDaysISO(todayISO(), -30));
  return {
    employee: emp,
    position: d.positions.find((p) => p.id === emp.positionId)!,
    department: d.departments.find((x) => x.id === emp.departmentId)!,
    supervisor: d.employees.find((e) => e.id === emp.supervisorId),
    shift: d.shifts.find((s) => s.id === emp.shiftId)!,
    salaryCents: stepSalaryCents(d.salaryGrades.find((g) => g.grade === emp.salaryGrade)!.step1Cents, emp.salaryStep),
    schedule: d.salarySchedules.find((s) => s.id === emp.scheduleId)!,
    balances,
    allowances: d.employeeAllowances.filter((a) => a.employeeId === id && a.active).map((a) => ({ ...a, typeName: d.allowanceTypes.find((t) => t.id === a.allowanceTypeId)!.name })),
    loans: d.loans.filter((l) => l.employeeId === id).map((l) => ({ ...l, typeName: d.loanTypes.find((t) => t.id === l.loanTypeId)!.name })),
    att30: { present: att30.filter((a) => ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME"].includes(a.status)).length, late: att30.filter((a) => a.lateMin > 0).length, otMin: att30.reduce((s, a) => s + a.otMin, 0) },
    history: d.audit.filter((a) => a.entity === "Employee" && a.entityId === id).slice(0, 12),
    recentAttendance: d.attendance.filter((a) => a.employeeId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
  };
}
export async function updateEmployee(id: string, patch: Partial<Employee>) {
  const u = requirePerm("employees.update"); await delay();
  return mutate((d) => {
    const emp = d.employees.find((e) => e.id === id);
    if (!emp) throw new ApiError("NOT_FOUND", "Employee not found.");
    const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
    (Object.keys(patch) as Array<keyof Employee>).forEach((k) => {
      if (patch[k] !== undefined && patch[k] !== emp[k]) { before[k as string] = emp[k] as unknown; after[k as string] = patch[k] as unknown; }
    });
    Object.assign(emp, patch);
    audit(u, patch.status === "SEPARATED" ? "employee.separate" : "employee.update", "Employee", id, before, after);
    return emp;
  });
}
export async function createEmployee(input: { firstName: string; lastName: string; gender: "M" | "F"; email: string; departmentId: string; positionId: string; salaryStep: number; hiredAt: string }) {
  const u = requirePerm("employees.create"); await delay();
  return mutate((d) => {
    if (d.employees.some((e) => e.email.toLowerCase() === input.email.toLowerCase()))
      throw new ApiError("DUPLICATE_EMAIL", "An employee with this email already exists.");
    const pos = d.positions.find((p) => p.id === input.positionId);
    if (!pos || pos.departmentId !== input.departmentId) throw new ApiError("VALIDATION", "Position does not belong to the selected department.");
    const emp: Employee = {
      id: uid("emp"), employeeNo: `DCS-${new Date().getFullYear()}-${`${d.employees.length + 1}`.padStart(4, "0")}`,
      firstName: input.firstName, lastName: input.lastName, gender: input.gender, email: input.email,
      phone: "—", departmentId: input.departmentId, positionId: input.positionId,
      salaryGrade: pos.salaryGrade, salaryStep: input.salaryStep, scheduleId: "ss1", shiftId: "sh1",
      appointmentType: "PERMANENT", status: "ACTIVE", hiredAt: input.hiredAt, birthDate: "1990-01-01",
      address: "—", tin: "—", gsisNo: "—", philhealthNo: "—", pagibigNo: "—", avatarHue: Math.floor(Math.random() * 360),
    };
    d.employees.push(emp);
    audit(u, "employee.create", "Employee", emp.id, null, { name: `${emp.firstName} ${emp.lastName}`, employeeNo: emp.employeeNo });
    return emp;
  });
}

/* ================= ATTENDANCE ================= */
export async function attendanceOverview(date = todayISO()) {
  requirePerm("attendance.read"); await delay();
  const d = getDB();
  const rows = d.attendance.filter((a) => a.date === date);
  const active = d.employees.filter((e) => e.status === "ACTIVE").length;
  const present = rows.filter((a) => a.clockIn != null || ["OFFICIAL_BUSINESS"].includes(a.status)).length;
  return {
    date, totalEmployees: active, present,
    late: rows.filter((a) => a.lateMin > 0).length,
    absentOrLeave: rows.filter((a) => a.status === "ABSENT" || a.status === "ON_LEAVE").length,
    incomplete: rows.filter((a) => a.status === "INCOMPLETE").length,
  };
}
export async function listAttendance(q: PageQuery & { date?: string; departmentId?: string; status?: string }) {
  const u = requirePerm("attendance.read"); await delay();
  const d = getDB(); const date = q.date ?? todayISO();
  const scope = visibleEmployeeIds(u);
  let rows = d.attendance.filter((a) => a.date === date && (scope === "ALL" ? true : scope.has(a.employeeId)));
  if (q.departmentId) rows = rows.filter((a) => d.employees.find((e) => e.id === a.employeeId)?.departmentId === q.departmentId);
  if (q.status) rows = rows.filter((a) => a.status === q.status);
  if (q.q) {
    const s = q.q.toLowerCase();
    rows = rows.filter((a) => { const e = d.employees.find((x) => x.id === a.employeeId)!; return `${e.firstName} ${e.lastName} ${e.employeeNo}`.toLowerCase().includes(s); });
  }
  const enriched = rows.map((a) => {
    const e = d.employees.find((x) => x.id === a.employeeId)!;
    return { ...a, fullName: `${e.firstName} ${e.lastName}`, employeeNo: e.employeeNo, department: d.departments.find((x) => x.id === e.departmentId)!.name, hue: e.avatarHue };
  }).sort((a, b) => a.fullName.localeCompare(b.fullName));
  return paginate(enriched, q, 12);
}
export async function getDTR(employeeId: string, ym: string) {
  const u = requireUser(); await delay();
  if (can(u, "attendance.read")) assertVisible(u, employeeId);
  else if (u.employeeId !== employeeId) throw new ApiError("FORBIDDEN", "Not authorized.");
  const d = getDB();
  const emp = d.employees.find((e) => e.id === employeeId);
  if (!emp) throw new ApiError("NOT_FOUND", "Employee not found.");
  const rows = d.attendance.filter((a) => a.employeeId === employeeId && a.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
  return {
    employee: emp,
    position: d.positions.find((p) => p.id === emp.positionId)!.title,
    days: rows,
    summary: {
      present: rows.filter((a) => ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME", "OFFICIAL_BUSINESS"].includes(a.status)).length,
      lateMin: rows.reduce((s, a) => s + a.lateMin, 0),
      utMin: rows.reduce((s, a) => s + a.undertimeMin, 0),
      otMin: rows.reduce((s, a) => s + a.otMin, 0),
      absent: rows.filter((a) => a.status === "ABSENT").length,
      leave: rows.filter((a) => a.status === "ON_LEAVE").length,
    },
    holidays: d.holidays.filter((h) => h.date.startsWith(ym)),
  };
}
export async function requestAdjustment(input: { employeeId: string; date: string; kind: AttendanceAdjustment["kind"]; newValue: string; reason: string }) {
  const u = requireUser(); await delay();
  if (u.role === "EMPLOYEE" && u.employeeId !== input.employeeId) throw new ApiError("FORBIDDEN", "You may only request adjustments for yourself.");
  return mutate((d) => {
    const att = d.attendance.find((a) => a.employeeId === input.employeeId && a.date === input.date);
    const oldValue = input.kind === "CLOCK_IN" ? (att?.clockIn != null ? `${Math.floor(att.clockIn / 60)}:${`${att.clockIn % 60}`.padStart(2, "0")}` : "—")
      : input.kind === "CLOCK_OUT" ? (att?.clockOut != null ? `${Math.floor(att.clockOut / 60)}:${`${att.clockOut % 60}`.padStart(2, "0")}` : "—")
      : att?.status ?? "—";
    const adj: AttendanceAdjustment = {
      id: uid("adj"), employeeId: input.employeeId, date: input.date, kind: input.kind,
      oldValue, newValue: input.newValue, reason: input.reason, status: "PENDING",
      requestedBy: u.id, createdAt: new Date().toISOString(),
    };
    d.adjustments.unshift(adj);
    audit(u, "attendance.adjustment_requested", "AttendanceAdjustment", adj.id, { oldValue }, { newValue: input.newValue });
    notify({ type: "ATTENDANCE", title: "Attendance adjustment pending", body: `${u.fullName} requested a ${input.kind.replace("_", " ").toLowerCase()} correction.`, link: "/attendance/adjustments" });
    return adj;
  });
}
export async function listAdjustments(q: PageQuery & { status?: string }) {
  const u = requireUser(); await delay();
  const d = getDB();
  const scope = visibleEmployeeIds(u);
  let rows = d.adjustments.filter((a) => (scope === "ALL" ? true : scope.has(a.employeeId) || a.requestedBy === u.id));
  if (q.status) rows = rows.filter((a) => a.status === q.status);
  const enriched = rows.map((a) => {
    const e = d.employees.find((x) => x.id === a.employeeId);
    return { ...a, employeeName: e ? `${e.firstName} ${e.lastName}` : "—" };
  });
  return paginate(enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), q, 10);
}
export async function decideAdjustment(id: string, approve: boolean, note?: string) {
  const u = requirePerm("attendance.adjust"); await delay();
  return mutate((d) => {
    const adj = d.adjustments.find((a) => a.id === id);
    if (!adj) throw new ApiError("NOT_FOUND", "Adjustment not found.");
    if (adj.status !== "PENDING") throw new ApiError("INVALID_STATE", "This adjustment was already decided.");
    adj.status = approve ? "APPROVED" : "REJECTED";
    adj.approvedBy = u.id; adj.decidedAt = new Date().toISOString();
    if (approve) {
      let att = d.attendance.find((a) => a.employeeId === adj.employeeId && a.date === adj.date);
      if (!att) {
        att = { id: uid("att"), employeeId: adj.employeeId, date: adj.date, totalMin: 0, lateMin: 0, undertimeMin: 0, otMin: 0, status: "INCOMPLETE", finalized: false, source: "ADJUSTMENT" };
        d.attendance.push(att);
      }
      const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
      if (adj.kind === "CLOCK_IN") att.clockIn = toMin(adj.newValue);
      if (adj.kind === "CLOCK_OUT") att.clockOut = toMin(adj.newValue);
      if (adj.kind === "STATUS") att.status = adj.newValue as AttendanceDay["status"];
      att.source = "ADJUSTMENT"; att.note = note || adj.reason;
      if (att.clockIn != null && att.clockOut != null) {
        const emp = d.employees.find((e) => e.id === adj.employeeId)!;
        const shift = d.shifts.find((s) => s.id === emp.shiftId)!;
        Object.assign(att, processAttendance({ clockIn: att.clockIn, clockOut: att.clockOut, shift, isHoliday: false, isRestDay: false }));
      }
    }
    audit(u, approve ? "attendance.adjustment_approved" : "attendance.adjustment_rejected", "AttendanceAdjustment", id, { status: "PENDING" }, { status: adj.status });
    const emp = d.employees.find((e) => e.id === adj.employeeId);
    if (emp?.userId) notify({ userId: emp.userId, type: "ATTENDANCE", title: `Adjustment ${approve ? "approved" : "rejected"}`, body: `Your ${adj.kind.replace("_", " ").toLowerCase()} correction for ${adj.date} was ${approve ? "approved" : "rejected"}.`, link: "/attendance" });
    return adj;
  });
}
type AttendanceDay = DB["attendance"][number];
export async function runBiometricSync(deviceId: string, records = 12) {
  const u = requirePerm("attendance.manage"); await delay(700);
  return mutate((d) => {
    const dev = d.devices.find((x) => x.id === deviceId);
    if (!dev) throw new ApiError("NOT_FOUND", "Device not found.");
    const today = todayISO();
    let created = 0, dupes = 0;
    const candidates = d.employees.filter((e) => e.status === "ACTIVE" && !d.attendance.some((a) => a.employeeId === e.id && a.date === today && a.clockIn != null));
    for (const emp of candidates.slice(0, records)) {
      if (d.rawLogs.some((r) => r.employeeNo === emp.employeeNo && r.at.startsWith(today))) { dupes++; continue; }
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      const clockIn = Math.max(450, mins);
      d.rawLogs.push({ id: uid("raw"), deviceId, employeeNo: emp.employeeNo, at: `${today}T${`${Math.floor(clockIn / 60)}`.padStart(2, "0")}:${`${clockIn % 60}`.padStart(2, "0")}:00`, source: "BIOMETRIC" });
      d.attendance.push({ id: uid("att"), employeeId: emp.id, date: today, clockIn, totalMin: 0, lateMin: Math.max(0, clockIn - 495), undertimeMin: 0, otMin: 0, status: "INCOMPLETE", finalized: false, source: "DEVICE" });
      created++;
    }
    dev.lastSyncAt = new Date().toISOString();
    d.imports.unshift({ id: uid("imp"), deviceId, fileName: `live_sync_${today}.csv`, records: created + dupes, duplicates: dupes, importedBy: u.id, at: new Date().toISOString() });
    audit(u, "biometric.sync", "BiometricDevice", deviceId, null, { created, duplicates: dupes });
    return { created, dupes };
  });
}
export async function deviceList() { requirePerm("attendance.read"); await delay(120); return getDB().devices; }
export async function importHistory() { requirePerm("attendance.read"); await delay(120); return getDB().imports.slice(0, 8); }

/* ================= LEAVE ================= */
const balanceDaysH = (d: DB, employeeId: string, leaveTypeId: string) =>
  d.leaveLedger.filter((l) => l.employeeId === employeeId && l.leaveTypeId === leaveTypeId)
    .reduce((s, e) => s + (e.type === "DEBIT" ? -e.daysH : e.daysH), 0);

export async function leaveBalances(employeeId?: string) {
  const u = requireUser(); await delay();
  const empId = employeeId ?? u.employeeId;
  if (!empId) throw new ApiError("NO_EMPLOYEE_PROFILE", "No employee profile linked.");
  if (!can(u, "leave.view.team")) assertVisible(u, empId);
  const d = getDB();
  return d.leaveTypes.map((lt) => ({ ...lt, daysH: balanceDaysH(d, empId, lt.id), days: balanceDaysH(d, empId, lt.id) / 100 }));
}
export async function listLeaveRequests(q: PageQuery & { scope?: "mine" | "team" | "all"; status?: string }) {
  const u = requireUser(); await delay();
  const d = getDB();
  const scopeQ = q.scope ?? (can(u, "leave.view.team") ? "all" : "mine");
  let rows: LeaveRequest[];
  if (scopeQ === "mine" || !can(u, "leave.view.team")) rows = d.leaveRequests.filter((r) => r.employeeId === u.employeeId);
  else {
    const vis = visibleEmployeeIds(u);
    rows = d.leaveRequests.filter((r) => (vis === "ALL" ? true : vis.has(r.employeeId)));
  }
  if (q.status) rows = rows.filter((r) => r.status === q.status);
  const enriched = rows.map((r) => {
    const e = d.employees.find((x) => x.id === r.employeeId);
    return { ...r, employeeName: e ? `${e.firstName} ${e.lastName}` : "—", leaveType: d.leaveTypes.find((t) => t.id === r.leaveTypeId)! };
  }).sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  return paginate(enriched, q, 10);
}
export async function fileLeave(input: { leaveTypeId: string; startDate: string; endDate: string; reason: string; docName?: string }) {
  const u = requireUser(); await delay();
  if (!can(u, "leave.file")) throw new ApiError("FORBIDDEN", "Your role cannot file leave.");
  if (!u.employeeId) throw new ApiError("NO_EMPLOYEE_PROFILE", "Your account has no linked employee profile.");
  const empId = u.employeeId;
  return mutate((d) => {
    if (input.endDate < input.startDate) throw new ApiError("VALIDATION", "End date must be on or after start date.");
    const overlap = d.leaveRequests.some((r) => r.employeeId === empId && !["REJECTED", "CANCELLED"].includes(r.status) && input.startDate <= r.endDate && input.endDate >= r.startDate);
    if (overlap) throw new ApiError("OVERLAP", "You already have a pending or approved leave covering these dates.");
    const holidays = new Set(d.holidays.map((h) => h.date));
    const days = workingDays(input.startDate, input.endDate, holidays);
    if (days <= 0) throw new ApiError("VALIDATION", "Selected range contains no working days.");
    const bal = balanceDaysH(d, empId, input.leaveTypeId);
    if (bal < days * 100) throw new ApiError("INSUFFICIENT_BALANCE", `Available balance (${bal / 100} day/s) is less than the ${days} working day/s requested.`);
    const req: LeaveRequest = {
      id: uid("lr"), employeeId: empId, leaveTypeId: input.leaveTypeId, startDate: input.startDate, endDate: input.endDate,
      workingDays: days, reason: input.reason, docName: input.docName, status: "PENDING_SUPERVISOR",
      filedAt: new Date().toISOString(), approvals: [],
    };
    d.leaveRequests.unshift(req);
    audit(u, "leave.file", "LeaveRequest", req.id, null, { type: input.leaveTypeId, from: input.startDate, to: input.endDate, days });
    const emp = d.employees.find((e) => e.id === empId);
    const supUser = emp?.supervisorId ? d.users.find((x) => x.employeeId === emp.supervisorId) : undefined;
    if (supUser) notify({ userId: supUser.id, type: "LEAVE", title: "Leave awaiting your approval", body: `${emp!.firstName} ${emp!.lastName} filed ${days} day/s of leave.`, link: "/leave" });
    return req;
  });
}
export async function decideLeave(id: string, action: "APPROVE" | "REJECT", note?: string) {
  const u = requireUser(); await delay();
  return mutate((d) => {
    const req = d.leaveRequests.find((r) => r.id === id);
    if (!req) throw new ApiError("NOT_FOUND", "Leave request not found.");
    const stage = req.status === "PENDING_SUPERVISOR" ? "SUPERVISOR" : req.status === "PENDING_HR" ? "HR" : null;
    if (!stage) throw new ApiError("INVALID_STATE", "This request is no longer pending a decision.");
    const perm: Permission = stage === "SUPERVISOR" ? "leave.approve.supervisor" : "leave.approve.hr";
    if (!can(u, perm)) throw new ApiError("FORBIDDEN", `Stage requires "${perm}".`);
    req.approvals.push({ stage, actorId: u.id, actorName: u.fullName, action, at: new Date().toISOString(), note });
    if (action === "REJECT") { req.status = "REJECTED"; req.rejectionNote = note; }
    else if (stage === "SUPERVISOR") req.status = "PENDING_HR";
    else {
      req.status = "APPROVED";
      d.leaveLedger.push({ id: uid("ll"), employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, type: "DEBIT", daysH: req.workingDays * 100, refType: "REQUEST", refId: req.id, memo: `Approved ${d.leaveTypes.find((t) => t.id === req.leaveTypeId)!.code} ${req.startDate} → ${req.endDate}`, at: new Date().toISOString(), actorId: u.id });
    }
    audit(u, `leave.${action.toLowerCase()}`, "LeaveRequest", id, { status: "PENDING" }, { status: req.status, stage });
    const emp = d.employees.find((e) => e.id === req.employeeId);
    if (emp?.userId) notify({ userId: emp.userId, type: "LEAVE", title: `Leave ${req.status === "APPROVED" ? "approved" : req.status === "REJECTED" ? "rejected" : "forwarded to HR"}`, body: `Your ${d.leaveTypes.find((t) => t.id === req.leaveTypeId)!.name} (${req.startDate} → ${req.endDate}).`, link: "/leave" });
    return req;
  });
}
export async function cancelLeave(id: string) {
  const u = requireUser(); await delay();
  return mutate((d) => {
    const req = d.leaveRequests.find((r) => r.id === id);
    if (!req) throw new ApiError("NOT_FOUND", "Leave request not found.");
    if (req.employeeId !== u.employeeId && !can(u, "leave.approve.hr")) throw new ApiError("FORBIDDEN", "Not authorized.");
    if (!["PENDING_SUPERVISOR", "PENDING_HR", "APPROVED"].includes(req.status)) throw new ApiError("INVALID_STATE", "This leave can no longer be cancelled.");
    const wasApproved = req.status === "APPROVED";
    req.status = "CANCELLED";
    if (wasApproved) d.leaveLedger.push({ id: uid("ll"), employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, type: "REVERSAL", daysH: req.workingDays * 100, refType: "REQUEST", refId: req.id, memo: "Cancelled approved leave — credit restored", at: new Date().toISOString(), actorId: u.id });
    audit(u, "leave.cancel", "LeaveRequest", id, { status: wasApproved ? "APPROVED" : "PENDING" }, { status: "CANCELLED" });
    return req;
  });
}
export async function leaveLedger(employeeId: string) {
  const u = requireUser(); await delay(150);
  if (!can(u, "leave.view.team")) assertVisible(u, employeeId);
  const d = getDB();
  return d.leaveLedger.filter((l) => l.employeeId === employeeId).sort((a, b) => b.at.localeCompare(a.at))
    .map((l) => ({ ...l, typeName: d.leaveTypes.find((t) => t.id === l.leaveTypeId)!.name, typeCode: d.leaveTypes.find((t) => t.id === l.leaveTypeId)!.code }));
}
export async function teamLeaveCalendar(ym: string) {
  const u = requireUser(); await delay(150);
  const d = getDB();
  const vis = visibleEmployeeIds(u);
  return d.leaveRequests.filter((r) => r.status === "APPROVED" && (vis === "ALL" ? true : vis.has(r.employeeId)))
    .filter((r) => r.startDate.startsWith(ym) || r.endDate.startsWith(ym))
    .map((r) => {
      const e = d.employees.find((x) => x.id === r.employeeId)!;
      return { id: r.id, name: `${e.firstName} ${e.lastName}`, start: r.startDate, end: r.endDate, type: d.leaveTypes.find((t) => t.id === r.leaveTypeId)! };
    });
}

/* ================= PAYROLL (async worker pipeline) ================= */
const PAYROLL_STAGES = [
  "Validating period & idempotency key", "Resolving eligible employees", "Resolving effective salary schedule",
  "Snapshotting compensation", "Loading finalized attendance", "Computing earnings & overtime",
  "Resolving effective government rules", "Computing government deductions", "Computing loan amortizations",
  "Validating totals", "Persisting immutable payroll details", "Finalizing run",
];
const workers = new Map<string, ReturnType<typeof setInterval>>();

function finalizeRun(runId: string) {
  const d = getDB();
  const run = d.runs.find((r) => r.id === runId)!;
  const period = d.periods.find((p) => p.id === run.periodId)!;
  const asOf = period.to;
  const gsisRule = resolveEffectiveRule(d.contributionRules.filter((r) => r.schemeId === "sch_gsis"), asOf);
  const phRule = resolveEffectiveRule(d.contributionRules.filter((r) => r.schemeId === "sch_ph"), asOf);
  const piRule = resolveEffectiveRule(d.contributionRules.filter((r) => r.schemeId === "sch_pi"), asOf);
  const wtaxRule = resolveEffectiveRule(d.contributionRules.filter((r) => r.schemeId === "sch_wtax"), asOf);
  const brackets = d.taxBrackets.filter((b) => b.ruleId === wtaxRule!.id);
  const eligible = d.employees.filter((e) => e.status === "ACTIVE");
  const rows: EmployeePayroll[] = [];
  for (const emp of eligible) {
    const monthly = stepSalaryCents(d.salaryGrades.find((g) => g.grade === emp.salaryGrade)!.step1Cents, emp.salaryStep);
    const lines = d.employeeAllowances
      .filter((a) => a.employeeId === emp.id && a.active && a.effectiveFrom <= asOf && (!a.effectiveTo || a.effectiveTo >= period.from))
      .map((a) => ({ label: d.allowanceTypes.find((t) => t.id === a.allowanceTypeId)!.name, cents: Math.round(a.monthlyCents / 2) }));
    const att = d.attendance.filter((a) => a.employeeId === emp.id && a.date >= period.from && a.date <= period.to);
    const snap = {
      present: att.filter((a) => ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME", "OFFICIAL_BUSINESS"].includes(a.status)).length,
      lateDays: att.filter((a) => a.lateMin > 0).length,
      absent: att.filter((a) => a.status === "ABSENT").length,
      otMin: att.reduce((s, a) => s + a.otMin, 0),
      lateMin: att.reduce((s, a) => s + a.lateMin, 0),
      utMin: att.reduce((s, a) => s + a.undertimeMin, 0),
    };
    const loan = d.loans.find((l) => l.employeeId === emp.id && l.status === "ACTIVE");
    const res = computePayroll({
      monthlyBasicCents: monthly, allowanceLines: lines, otMin: snap.otMin, lateMin: snap.lateMin, utMin: snap.utMin,
      gsisRule: gsisRule!, philhealthRule: phRule!, pagibigRule: piRule!, taxBrackets: brackets,
      loanInstallmentCents: loan ? loan.installmentCents : 0, attendanceSnapshot: snap,
    });
    rows.push({
      id: uid("ep"), runId, employeeId: emp.id,
      snapshot: {
        fullName: `${emp.firstName} ${emp.lastName}`, position: d.positions.find((p) => p.id === emp.positionId)!.title,
        department: d.departments.find((x) => x.id === emp.departmentId)!.name, grade: emp.salaryGrade, step: emp.salaryStep,
        scheduleName: d.salarySchedules.find((s) => s.id === emp.scheduleId)!.name, employeeNo: emp.employeeNo,
      },
      ...res, attendanceSnapshot: snap,
    });
  }
  mutate((dd) => {
    const r = dd.runs.find((x) => x.id === runId)!;
    dd.employeePayrolls.push(...rows);
    r.employeeCount = rows.length;
    r.grossCents = sumCents(rows.map((x) => x.grossCents));
    r.deductionsCents = sumCents(rows.map((x) => x.totalDeductCents));
    r.netCents = sumCents(rows.map((x) => x.netCents));
    r.status = "COMPUTED"; r.progress = 100; r.stage = "Computed — ready for verification";
    r.log.push("Payroll details persisted immutably", "Run finalized: COMPUTED");
    audit(dd.users.find((x) => x.id === r.createdBy) ?? null, "payroll.generate", "PayrollRun", runId, { status: "COMPUTING" }, { status: "COMPUTED", employees: rows.length, net: r.netCents });
    dd.users.filter((x) => x.role === "ACCOUNTING" || x.role === "ADMINISTRATOR" || x.role === "SYSTEM_ADMIN").forEach((x) =>
      notify({ userId: x.id, type: "PAYROLL", title: "Payroll computed — verification queue", body: `${dd.periods.find((p) => p.id === r.periodId)!.label} run is ready for verification.`, link: `/payroll/${runId}` }));
  });
}
function startWorker(runId: string) {
  if (workers.has(runId)) return;
  const iv = setInterval(() => {
    const d = getDB();
    const run = d.runs.find((r) => r.id === runId);
    if (!run || !["QUEUED", "COMPUTING"].includes(run.status)) { clearInterval(iv); workers.delete(runId); return; }
    run.status = "COMPUTING";
    run.progress = Math.min(100, run.progress + 5 + Math.random() * 8);
    const stage = PAYROLL_STAGES[Math.min(PAYROLL_STAGES.length - 1, Math.floor((run.progress / 100) * PAYROLL_STAGES.length))];
    if (run.log[run.log.length - 1] !== stage) run.log.push(stage);
    run.stage = stage;
    persist(); emit();
    if (run.progress >= 100) { clearInterval(iv); workers.delete(runId); finalizeRun(runId); }
  }, 480);
  workers.set(runId, iv);
}
export async function payrollOverview() {
  requirePerm("payroll.read"); await delay();
  const d = getDB();
  return {
    periods: d.periods.map((p) => ({ ...p, run: d.runs.find((r) => r.periodId === p.id && !["CANCELLED"].includes(r.status)) ?? null })),
    runs: d.runs.map((r) => ({ ...r, periodLabel: d.periods.find((p) => p.id === r.periodId)!.label })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
export async function generatePayroll(periodId: string) {
  const u = requirePerm("payroll.generate"); await delay(300);
  return mutate((d) => {
    const period = d.periods.find((p) => p.id === periodId);
    if (!period) throw new ApiError("NOT_FOUND", "Payroll period not found.");
    if (period.closed) throw new ApiError("PERIOD_CLOSED", "This payroll period is closed.");
    const key = `run:${periodId}`;
    const existing = d.runs.find((r) => r.idempotencyKey === key && !["CANCELLED", "FAILED"].includes(r.status));
    if (existing) return existing; // idempotent: repeated requests never duplicate runs
    const run: PayrollRun = {
      id: uid("run"), periodId, status: "QUEUED", progress: 2, stage: "Queued for background worker",
      log: ["Payroll generation queued (BullMQ-style worker)"], createdBy: u.id, createdAt: new Date().toISOString(),
      employeeCount: 0, grossCents: 0, deductionsCents: 0, netCents: 0, idempotencyKey: key,
    };
    d.runs.unshift(run);
    audit(u, "payroll.queue_generate", "PayrollRun", run.id, null, { period: period.label });
    startWorker(run.id);
    return run;
  });
}
export async function getRun(id: string) {
  const u = requirePerm("payroll.read"); await delay();
  const d = getDB();
  const run = d.runs.find((r) => r.id === id);
  if (!run) throw new ApiError("NOT_FOUND", "Payroll run not found.");
  // Worker-crash recovery: resume a run stranded mid-pipeline (e.g., after a reload).
  if (["QUEUED", "COMPUTING"].includes(run.status)) startWorker(run.id);
  let rows = d.employeePayrolls.filter((e) => e.runId === id);
  if (u.role === "EMPLOYEE" || u.role === "SUPERVISOR") rows = rows.filter((r) => r.employeeId === u.employeeId);
  if (u.role === "DEPARTMENT_HEAD") {
    const me = d.employees.find((e) => e.id === u.employeeId);
    rows = rows.filter((r) => d.employees.find((e) => e.id === r.employeeId)?.departmentId === me?.departmentId);
  }
  const period = d.periods.find((p) => p.id === run.periodId)!;
  const rulesUsed = {
    gsis: resolveEffectiveRule(d.contributionRules.filter((r) => r.schemeId === "sch_gsis"), period.to),
    philhealth: resolveEffectiveRule(d.contributionRules.filter((r) => r.schemeId === "sch_ph"), period.to),
    pagibig: resolveEffectiveRule(d.contributionRules.filter((r) => r.schemeId === "sch_pi"), period.to),
    wtax: resolveEffectiveRule(d.contributionRules.filter((r) => r.schemeId === "sch_wtax"), period.to),
  };
  return { run: { ...run, periodLabel: period.label, period }, rows: rows.sort((a, b) => a.snapshot.fullName.localeCompare(b.snapshot.fullName)), rulesUsed, period };
}
async function advanceRun(id: string, from: PayrollRunStatus[], to: PayrollRunStatus, perm: Permission, action: string, field: "verifiedBy" | "approvedBy" | "releasedBy", stamp: "verifiedAt" | "approvedAt" | "releasedAt") {
  const u = requirePerm(perm); await delay();
  return mutate((d) => {
    const run = d.runs.find((r) => r.id === id);
    if (!run) throw new ApiError("NOT_FOUND", "Payroll run not found.");
    if (!from.includes(run.status)) throw new ApiError("INVALID_STATE", `Run is ${run.status}; expected ${from.join(" or ")}.`);
    run.status = to; run[field] = u.id; run[stamp] = new Date().toISOString();
    run.log.push(`${u.fullName}: ${action} → ${to}`);
    audit(u, `payroll.${action}`, "PayrollRun", id, { status: from[0] }, { status: to });
    return run;
  });
}
export const verifyRun = (id: string) => advanceRun(id, ["COMPUTED"], "VERIFIED", "payroll.verify", "verify", "verifiedBy", "verifiedAt");
export const approveRun = (id: string) => advanceRun(id, ["VERIFIED"], "APPROVED", "payroll.approve", "approve", "approvedBy", "approvedAt");
export async function releaseRun(id: string) {
  const u = requirePerm("payroll.release"); await delay(500);
  const pre = getDB().runs.find((r) => r.id === id);
  if (!pre) throw new ApiError("NOT_FOUND", "Payroll run not found.");
  if (pre.status !== "APPROVED") throw new ApiError("INVALID_STATE", `Run is ${pre.status}; only APPROVED runs can be released.`);
  return mutate((d) => {
    const run = d.runs.find((r) => r.id === id)!;
    const period = d.periods.find((p) => p.id === run.periodId)!;
    const rows = d.employeePayrolls.filter((e) => e.runId === id);
    let loanPosts = 0, slips = 0;
    for (const row of rows) {
      if (row.loanCents > 0) {
        const loan = d.loans.find((l) => l.employeeId === row.employeeId && l.status === "ACTIVE");
        if (loan && !d.loanLedger.some((l) => l.loanId === loan.id && l.refId === run.id)) { // idempotent deduction
          d.loanLedger.push({ id: uid("llg"), loanId: loan.id, type: "PAYROLL_PAYMENT", amountCents: row.loanCents, refType: "PAYROLL_RUN", refId: run.id, memo: `Amortization — ${period.label}`, at: new Date().toISOString(), actorId: "system" });
          loan.balanceCents -= row.loanCents;
          const due = d.loanSchedules.find((s) => s.loanId === loan.id && !s.paidAt);
          if (due) { due.paidAt = new Date().toISOString(); due.paidVia = `Payroll — ${period.label}`; }
          if (loan.balanceCents <= 0) loan.status = "PAID";
          loanPosts++;
          const emp = d.employees.find((e) => e.id === row.employeeId);
          if (emp?.userId) notify({ userId: emp.userId, type: "LOAN", title: "Loan amortization posted", body: `${period.label} deduction applied to ${d.loanTypes.find((t) => t.id === loan.loanTypeId)!.name}.`, link: "/loans" });
        }
      }
      if (!d.payslips.some((p) => p.employeePayrollId === row.id)) {
        d.payslips.push({ id: uid("ps"), number: `${period.to.slice(0, 7).replace("-", "")}-${`${d.payslips.length + 1}`.padStart(4, "0")}`, employeePayrollId: row.id, employeeId: row.employeeId, runId: id, releasedAt: new Date().toISOString() });
        slips++;
        const emp = d.employees.find((e) => e.id === row.employeeId);
        if (emp?.userId) notify({ userId: emp.userId, type: "PAYROLL", title: "Payslip released", body: `Your payslip for ${period.label} is available.`, link: "/payslips" });
      }
    }
    d.attendance.forEach((a) => { if (a.date >= period.from && a.date <= period.to) a.finalized = true; });
    run.status = "RELEASED"; run.releasedBy = u.id; run.releasedAt = new Date().toISOString(); run.progress = 100; run.stage = "Released";
    run.log.push(`Released — ${slips} payslips issued, ${loanPosts} loan deductions posted`, "Period attendance finalized (immutable)");
    audit(u, "payroll.release", "PayrollRun", id, { status: "APPROVED" }, { status: "RELEASED", net: run.netCents, slips, loanPosts });
    return run;
  });
}
export async function cancelRun(id: string) {
  const u = requirePerm("payroll.generate"); await delay();
  return mutate((d) => {
    const run = d.runs.find((r) => r.id === id);
    if (!run) throw new ApiError("NOT_FOUND", "Run not found.");
    if (!["DRAFT", "QUEUED", "COMPUTING", "COMPUTED"].includes(run.status)) throw new ApiError("INVALID_STATE", "Only pre-verification runs can be cancelled.");
    run.status = "CANCELLED"; run.log.push(`${u.fullName}: cancelled run`);
    d.employeePayrolls = d.employeePayrolls.filter((e) => e.runId !== id);
    audit(u, "payroll.cancel", "PayrollRun", id, null, { status: "CANCELLED" });
    return run;
  });
}
export async function myPayslips() {
  const u = requireUser(); await delay();
  const d = getDB();
  return d.payslips.filter((p) => p.employeeId === u.employeeId).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))
    .map((p) => ({ ...p, ep: d.employeePayrolls.find((e) => e.id === p.employeePayrollId)!, periodLabel: d.periods.find((x) => x.id === d.runs.find((r) => r.id === p.runId)!.periodId)!.label }));
}
export async function bankFile(runId: string) {
  const u = requirePerm("payroll.export"); await delay(400);
  const d = getDB();
  const run = d.runs.find((r) => r.id === runId);
  if (!run) throw new ApiError("NOT_FOUND", "Run not found.");
  if (run.status !== "RELEASED") throw new ApiError("INVALID_STATE", "Bank file is available only for RELEASED runs.");
  const rows = d.employeePayrolls.filter((e) => e.runId === runId);
  const period = d.periods.find((p) => p.id === run.periodId)!;
  const csv = toCSV([
    ["BANK DISBURSEMENT FILE (BOUNDARY EXPORT) — DO NOT EDIT"],
    ["Run", runId, "Period", period.label, "Generated", new Date().toISOString()],
    [], ["Employee No", "Account No", "Account Name", "Bank", "Net Pay (PHP)"],
    ...rows.map((r) => {
      const emp = d.employees.find((e) => e.id === r.employeeId)!;
      return [r.snapshot.employeeNo, emp.bankAccount ?? "—", r.snapshot.fullName, emp.bankName ?? "—", (r.netCents / 100).toFixed(2)];
    }),
    [], ["TOTAL", "", "", "", (run.netCents / 100).toFixed(2)],
  ]);
  audit(u, "payroll.bank_export", "PayrollRun", runId, null, { records: rows.length });
  return { filename: `bankfile_${period.label.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.csv`, csv };
}

/* ================= GOVERNMENT DEDUCTIONS ================= */
export async function deductionSchemes() {
  requireUser(); await delay();
  const d = getDB();
  return d.schemes.map((s) => ({
    ...s,
    rules: d.contributionRules.filter((r) => r.schemeId === s.id).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    brackets: s.code === "WTAX" ? d.taxBrackets.filter((b) => b.ruleId === d.contributionRules.filter((r) => r.schemeId === s.id && r.effectiveFrom <= todayISO()).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]!.id) : [],
  }));
}
export async function addContributionRule(schemeId: string, input: { effectiveFrom: string; employeeBps?: number; employerBps?: number; monthlyCapCents?: number; monthlyFloorCents?: number; note: string }) {
  const u = requirePerm("deductions.manage"); await delay();
  return mutate((d) => {
    const scheme = d.schemes.find((s) => s.id === schemeId);
    if (!scheme) throw new ApiError("NOT_FOUND", "Scheme not found.");
    const latest = d.contributionRules.filter((r) => r.schemeId === schemeId).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    if (latest && input.effectiveFrom <= latest.effectiveFrom)
      throw new ApiError("EFFECTIVE_DATE", `New rule must be effective after the latest (${latest.effectiveFrom}). Historical rules are immutable.`);
    const rule = { id: uid("cr"), schemeId, effectiveFrom: input.effectiveFrom, employeeBps: input.employeeBps, employerBps: input.employerBps, monthlyCapCents: input.monthlyCapCents, monthlyFloorCents: input.monthlyFloorCents, note: input.note, demo: false };
    d.contributionRules.push(rule);
    audit(u, "deduction.rule_added", "ContributionRule", rule.id, null, { scheme: scheme.code, effectiveFrom: input.effectiveFrom });
    return rule;
  });
}
export async function remittanceSummary(runId: string) {
  requirePerm("payroll.read"); await delay();
  const d = getDB();
  const rows = d.employeePayrolls.filter((e) => e.runId === runId);
  return {
    gsis: sumCents(rows.map((r) => r.gsisCents)), philhealth: sumCents(rows.map((r) => r.philhealthCents)),
    pagibig: sumCents(rows.map((r) => r.pagibigCents)), wtax: sumCents(rows.map((r) => r.wtaxCents)),
    perEmployee: rows.map((r) => ({ name: r.snapshot.fullName, gsis: r.gsisCents, philhealth: r.philhealthCents, pagibig: r.pagibigCents, wtax: r.wtaxCents })),
  };
}

/* ================= ALLOWANCES ================= */
export async function allowanceTypes() { requireUser(); await delay(150); return getDB().allowanceTypes; }
export async function allowanceAssignments(q: PageQuery & { typeId?: string; active?: string }) {
  requirePerm("allowances.manage"); await delay();
  const d = getDB();
  let rows = [...d.employeeAllowances];
  if (q.typeId) rows = rows.filter((a) => a.allowanceTypeId === q.typeId);
  if (q.active) rows = rows.filter((a) => (q.active === "active" ? a.active : !a.active));
  if (q.q) { const s = q.q.toLowerCase(); rows = rows.filter((a) => { const e = d.employees.find((x) => x.id === a.employeeId); return e ? `${e.firstName} ${e.lastName}`.toLowerCase().includes(s) : false; }); }
  const enriched = rows.map((a) => ({
    ...a, employeeName: `${d.employees.find((e) => e.id === a.employeeId)!.firstName} ${d.employees.find((e) => e.id === a.employeeId)!.lastName}`,
    typeName: d.allowanceTypes.find((t) => t.id === a.allowanceTypeId)!.name,
  })).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return paginate(enriched, q, 12);
}
export async function grantAllowance(input: { employeeId: string; allowanceTypeId: string; monthlyCents: number; effectiveFrom: string }) {
  const u = requirePerm("allowances.manage"); await delay();
  return mutate((d) => {
    if (d.employeeAllowances.some((a) => a.employeeId === input.employeeId && a.allowanceTypeId === input.allowanceTypeId && a.active))
      throw new ApiError("DUPLICATE", "Employee already has an active assignment of this allowance.");
    const rec = { id: uid("ea"), ...input, active: true, grantedBy: u.id };
    d.employeeAllowances.push(rec);
    audit(u, "allowance.grant", "EmployeeAllowance", rec.id, null, { employee: input.employeeId, type: input.allowanceTypeId, monthly: input.monthlyCents });
    return rec;
  });
}
export async function setAllowanceActive(id: string, active: boolean) {
  const u = requirePerm("allowances.manage"); await delay(150);
  return mutate((d) => {
    const rec = d.employeeAllowances.find((a) => a.id === id);
    if (!rec) throw new ApiError("NOT_FOUND", "Assignment not found.");
    rec.active = active;
    audit(u, active ? "allowance.activate" : "allowance.deactivate", "EmployeeAllowance", id, { active: !active }, { active });
    return rec;
  });
}

/* ================= LOANS ================= */
export async function listLoans(q: PageQuery & { status?: string; mine?: boolean }) {
  const u = requireUser(); await delay();
  const d = getDB();
  const showMine = q.mine || !can(u, "loans.manage");
  let rows = d.loans.filter((l) => (showMine ? l.employeeId === u.employeeId : true));
  if (q.status) rows = rows.filter((l) => l.status === q.status);
  if (q.q) { const s = q.q.toLowerCase(); rows = rows.filter((l) => { const e = d.employees.find((x) => x.id === l.employeeId); return e ? `${e.firstName} ${e.lastName} ${l.refNo}`.toLowerCase().includes(s) : false; }); }
  const enriched = rows.map((l) => ({
    ...l, employeeName: `${d.employees.find((e) => e.id === l.employeeId)!.firstName} ${d.employees.find((e) => e.id === l.employeeId)!.lastName}`,
    typeName: d.loanTypes.find((t) => t.id === l.loanTypeId)!.name,
    paidCents: d.loanLedger.filter((x) => x.loanId === l.id && ["PAYROLL_PAYMENT", "MANUAL_PAYMENT"].includes(x.type)).reduce((s, x) => s + x.amountCents, 0),
  })).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  return paginate(enriched, q, 10);
}
export async function applyLoan(input: { loanTypeId: string; amountCents: number; termMonths: number }) {
  const u = requireUser(); await delay();
  if (!can(u, "loans.apply") && !can(u, "loans.manage")) throw new ApiError("FORBIDDEN", "Not authorized to apply for loans.");
  if (!u.employeeId) throw new ApiError("NO_EMPLOYEE_PROFILE", "Your account has no linked employee profile.");
  const empId = u.employeeId;
  return mutate((d) => {
    const type = d.loanTypes.find((t) => t.id === input.loanTypeId);
    if (!type) throw new ApiError("NOT_FOUND", "Loan type not found.");
    if (input.amountCents > type.maxAmountCents) throw new ApiError("VALIDATION", `Amount exceeds the ${type.name} ceiling.`);
    if (d.loans.some((l) => l.employeeId === empId && ["SUBMITTED", "UNDER_REVIEW", "ACTIVE"].includes(l.status)))
      throw new ApiError("EXISTING_LOAN", "You already have a pending or active loan.");
    const loan = { id: uid("loan"), refNo: `${type.code}-${Math.floor(10000 + Math.random() * 89999)}`, employeeId: empId, loanTypeId: input.loanTypeId, appliedAmountCents: input.amountCents, termMonths: input.termMonths, installmentCents: loanInstallmentCents(input.amountCents, input.termMonths), balanceCents: input.amountCents, status: "SUBMITTED" as const, appliedAt: new Date().toISOString() };
    d.loans.unshift(loan);
    audit(u, "loan.apply", "EmployeeLoan", loan.id, null, { type: type.code, amount: input.amountCents, term: input.termMonths });
    d.users.filter((x) => x.role === "PAYROLL_OFFICER").forEach((x) => notify({ userId: x.id, type: "LOAN", title: "Loan application submitted", body: `${u.fullName} applied for ${type.name}.`, link: "/loans" }));
    return loan;
  });
}
export async function reviewLoan(id: string, action: "START_REVIEW" | "APPROVE" | "REJECT", approvedAmountCents?: number, termMonths?: number) {
  const u = requirePerm("loans.manage"); await delay();
  return mutate((d) => {
    const loan = d.loans.find((l) => l.id === id);
    if (!loan) throw new ApiError("NOT_FOUND", "Loan not found.");
    const emp = d.employees.find((e) => e.id === loan.employeeId)!;
    if (action === "START_REVIEW") {
      if (loan.status !== "SUBMITTED") throw new ApiError("INVALID_STATE", "Only SUBMITTED loans can enter review.");
      loan.status = "UNDER_REVIEW";
    } else if (action === "APPROVE") {
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(loan.status)) throw new ApiError("INVALID_STATE", "Loan is not in a reviewable state.");
      const amt = approvedAmountCents ?? loan.appliedAmountCents;
      const term = termMonths ?? loan.termMonths;
      loan.approvedAmountCents = amt; loan.termMonths = term;
      loan.installmentCents = loanInstallmentCents(amt, term);
      loan.balanceCents = amt; loan.status = "ACTIVE"; loan.decidedAt = new Date().toISOString(); loan.decidedBy = u.id;
      d.loanLedger.push({ id: uid("llg"), loanId: loan.id, type: "DISBURSEMENT", amountCents: amt, refType: "SYSTEM", memo: "Loan proceeds disbursed via payroll credit", at: new Date().toISOString(), actorId: u.id });
      for (let i = 1; i <= term; i++) d.loanSchedules.push({ id: uid("ls"), loanId: loan.id, seq: i, dueLabel: `Installment ${i} of ${term}`, amountCents: loan.installmentCents });
      if (emp.userId) notify({ userId: emp.userId, type: "LOAN", title: "Loan approved & active", body: `Amortization of ₱${(loan.installmentCents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })} will be deducted each payroll.`, link: "/loans" });
    } else {
      if (!["SUBMITTED", "UNDER_REVIEW"].includes(loan.status)) throw new ApiError("INVALID_STATE", "Loan is not in a reviewable state.");
      loan.status = "REJECTED"; loan.decidedAt = new Date().toISOString(); loan.decidedBy = u.id;
      if (emp.userId) notify({ userId: emp.userId, type: "LOAN", title: "Loan application rejected", body: "Contact the payroll office for details.", link: "/loans" });
    }
    audit(u, `loan.${action.toLowerCase()}`, "EmployeeLoan", id, null, { status: loan.status });
    return loan;
  });
}
export async function postLoanPayment(id: string, amountCents: number, memo: string) {
  const u = requirePerm("loans.manage"); await delay();
  return mutate((d) => {
    const loan = d.loans.find((l) => l.id === id);
    if (!loan) throw new ApiError("NOT_FOUND", "Loan not found.");
    if (loan.status !== "ACTIVE") throw new ApiError("INVALID_STATE", "Only ACTIVE loans accept payments.");
    if (amountCents <= 0 || amountCents > loan.balanceCents) throw new ApiError("VALIDATION", "Invalid payment amount.");
    d.loanLedger.push({ id: uid("llg"), loanId: id, type: "MANUAL_PAYMENT", amountCents, refType: "MANUAL", memo, at: new Date().toISOString(), actorId: u.id });
    loan.balanceCents -= amountCents;
    const due = d.loanSchedules.find((s) => s.loanId === id && !s.paidAt);
    if (due) { due.paidAt = new Date().toISOString(); due.paidVia = `Manual payment — ${u.fullName}`; }
    if (loan.balanceCents <= 0) loan.status = "PAID";
    audit(u, "loan.manual_payment", "EmployeeLoan", id, { balance: loan.balanceCents + amountCents }, { balance: loan.balanceCents });
    return loan;
  });
}
export async function loanDetail(id: string) {
  const u = requireUser(); await delay();
  const d = getDB();
  const loan = d.loans.find((l) => l.id === id);
  if (!loan) throw new ApiError("NOT_FOUND", "Loan not found.");
  if (!can(u, "loans.manage") && loan.employeeId !== u.employeeId) throw new ApiError("FORBIDDEN", "Not authorized.");
  const emp = d.employees.find((e) => e.id === loan.employeeId)!;
  return {
    loan: { ...loan, employeeName: `${emp.firstName} ${emp.lastName}`, typeName: d.loanTypes.find((t) => t.id === loan.loanTypeId)!.name },
    ledger: d.loanLedger.filter((l) => l.loanId === id).sort((a, b) => b.at.localeCompare(a.at)),
    schedule: d.loanSchedules.filter((s) => s.loanId === id).sort((a, b) => a.seq - b.seq),
  };
}
export async function loanTypes() { requireUser(); await delay(100); return getDB().loanTypes; }

/* ================= RECRUITMENT ================= */
export async function publicJobs() {
  await delay();
  const d = getDB();
  return d.jobs.filter((j) => j.status === "OPEN").map((j) => ({ ...j, department: d.departments.find((x) => x.id === j.departmentId)!.name }));
}
export async function publicJob(slug: string) {
  await delay();
  const d = getDB();
  const job = d.jobs.find((j) => j.slug === slug);
  if (!job) throw new ApiError("NOT_FOUND", "Job posting not found.");
  return { ...job, department: d.departments.find((x) => x.id === job.departmentId)!.name };
}
export async function submitApplication(input: { jobSlug: string; fullName: string; email: string; phone: string; coverLetter: string; resumeText: string; docName?: string }) {
  await delay(700);
  return mutate((d) => {
    const job = d.jobs.find((j) => j.slug === input.jobSlug && j.status === "OPEN");
    if (!job) throw new ApiError("NOT_FOUND", "This job posting is no longer open.");
    let applicant = d.applicants.find((a) => a.email.toLowerCase() === input.email.toLowerCase());
    if (!applicant) {
      applicant = { id: uid("ap"), fullName: input.fullName, email: input.email, phone: input.phone, password: "applicant", createdAt: new Date().toISOString() };
      d.applicants.push(applicant);
    }
    if (d.applications.some((a) => a.jobPostingId === job.id && a.applicantId === applicant!.id))
      throw new ApiError("DUPLICATE_APPLICATION", "You have already applied for this position.");
    const app: Application = {
      id: uid("app"), jobPostingId: job.id, applicantId: applicant.id, status: "NEW",
      matchScore: computeMatchScore(input.resumeText, job.keywords),
      coverLetter: input.coverLetter, resumeText: input.resumeText, docName: input.docName ?? `resume_${input.fullName.split(" ").pop()?.toLowerCase()}.pdf`,
      appliedAt: new Date().toISOString(), tags: [], history: [{ status: "NEW", at: new Date().toISOString(), by: "Applicant Portal" }],
    };
    d.applications.unshift(app);
    audit(null, "recruitment.application_received", "Application", app.id, null, { job: job.title });
    d.users.filter((x) => ["HR_OFFICER", "HIRING_MANAGER"].includes(x.role)).forEach((x) =>
      notify({ userId: x.id, type: "RECRUITMENT", title: "New application", body: `${input.fullName} applied for ${job.title}.`, link: "/recruitment" }));
    return { app, applicant };
  });
}
export async function applicantLogin(email: string, password: string) {
  await delay(400);
  const a = getDB().applicants.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!a || a.password !== password) throw new ApiError("INVALID_CREDENTIALS", "Invalid applicant credentials. Demo password: applicant");
  localStorage.setItem("govhris.applicant", a.id);
  return a;
}
export async function applicantSession() {
  const id = localStorage.getItem("govhris.applicant");
  return id ? getDB().applicants.find((a) => a.id === id) ?? null : null;
}
export async function applicantLogout() { localStorage.removeItem("govhris.applicant"); emit(); }
export async function myApplications() {
  const a = await applicantSession();
  if (!a) throw new ApiError("UNAUTHORIZED", "Applicant session expired.");
  await delay();
  const d = getDB();
  return d.applications.filter((x) => x.applicantId === a.id).map((x) => ({
    ...x, job: { ...d.jobs.find((j) => j.id === x.jobPostingId)!, department: d.departments.find((dep) => dep.id === d.jobs.find((j) => j.id === x.jobPostingId)!.departmentId)?.name ?? "" },
  })).sort((p, q) => q.appliedAt.localeCompare(p.appliedAt));
}
export async function internalJobs() {
  requirePerm("recruitment.manage"); await delay();
  const d = getDB();
  return d.jobs.map((j) => ({
    ...j, department: d.departments.find((x) => x.id === j.departmentId)!.name,
    applicantCount: d.applications.filter((a) => a.jobPostingId === j.id).length,
  }));
}
export async function createJob(input: { title: string; departmentId: string; positionTitle: string; salaryGrade: number; summary: string; qualifications: string[]; keywords: string[]; deadline: string; openings: number }) {
  const u = requirePerm("recruitment.manage"); await delay();
  return mutate((d) => {
    const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + `-${uid("s").slice(-4)}`;
    const job = {
      id: uid("job"), slug, ...input, employmentType: "Permanent — Plantilla", workLocation: "Central Office, Quezon City",
      responsibilities: ["Perform duties aligned with the agency mandate.", "Prepare required reports and certifications.", "Undertake related tasks as directed."],
      postedAt: new Date().toISOString(), status: "OPEN" as const,
    };
    d.jobs.unshift(job);
    audit(u, "recruitment.job_posted", "JobPosting", job.id, null, { title: input.title, grade: input.salaryGrade });
    return job;
  });
}
export async function setJobStatus(id: string, status: "OPEN" | "CLOSED" | "DRAFT") {
  const u = requirePerm("recruitment.manage"); await delay(150);
  return mutate((d) => {
    const job = d.jobs.find((j) => j.id === id);
    if (!job) throw new ApiError("NOT_FOUND", "Job not found.");
    job.status = status;
    audit(u, `recruitment.job_${status.toLowerCase()}`, "JobPosting", id, null, { status });
    return job;
  });
}
export async function kanban(jobId?: string) {
  requirePerm("recruitment.manage"); await delay();
  const d = getDB();
  let apps = d.applications;
  if (jobId) apps = apps.filter((a) => a.jobPostingId === jobId);
  return apps.map((a) => ({
    ...a, applicant: d.applicants.find((x) => x.id === a.applicantId)!,
    job: d.jobs.find((j) => j.id === a.jobPostingId)!,
    interview: d.interviews.find((i) => i.applicationId === a.id),
  }));
}
export async function applicationDetail(id: string) {
  requirePerm("recruitment.manage"); await delay();
  const d = getDB();
  const app = d.applications.find((a) => a.id === id);
  if (!app) throw new ApiError("NOT_FOUND", "Application not found.");
  const job = d.jobs.find((j) => j.id === app.jobPostingId)!;
  return {
    app: { ...app, applicant: d.applicants.find((x) => x.id === app.applicantId)!, job: { ...job, department: d.departments.find((dep) => dep.id === job.departmentId)?.name ?? "" } },
    evaluations: d.evaluations.filter((e) => e.applicationId === id),
    interview: d.interviews.find((i) => i.applicationId === id),
  };
}
export async function moveApplication(id: string, status: CandidateStatus, note?: string) {
  const u = requirePerm("recruitment.manage"); await delay(200);
  return mutate((d) => {
    const app = d.applications.find((a) => a.id === id);
    if (!app) throw new ApiError("NOT_FOUND", "Application not found.");
    if (app.status === status) return app;
    if (["HIRED", "REJECTED", "WITHDRAWN"].includes(app.status)) throw new ApiError("INVALID_STATE", "Terminal statuses are locked.");
    const prev = app.status;
    app.status = status;
    app.history.push({ status, at: new Date().toISOString(), by: u.fullName, note });
    if (["REJECTED", "WITHDRAWN"].includes(status)) app.tags = [...new Set([...app.tags, "Closed"])];
    audit(u, "recruitment.status_change", "Application", id, { status: prev }, { status });
    return app;
  });
}
export async function addTag(id: string, tag: string) {
  const u = requirePerm("recruitment.manage"); await delay(100);
  return mutate((d) => {
    const app = d.applications.find((a) => a.id === id)!;
    if (!app.tags.includes(tag)) app.tags.push(tag);
    audit(u, "recruitment.tag_added", "Application", id, null, { tag });
    return app;
  });
}
export async function addEvaluation(id: string, rating: number, note: string) {
  const u = requirePerm("recruitment.manage"); await delay(150);
  return mutate((d) => {
    d.evaluations.unshift({ id: uid("ev"), applicationId: id, authorName: u.fullName, rating, note, at: new Date().toISOString() });
    audit(u, "recruitment.evaluation_added", "Application", id, null, { rating });
  });
}
export async function scheduleInterview(id: string, input: { scheduledAt: string; mode: "ONSITE" | "ONLINE"; location?: string; participants: string[] }) {
  const u = requirePerm("recruitment.manage"); await delay();
  return mutate((d) => {
    const app = d.applications.find((a) => a.id === id)!;
    const existing = d.interviews.find((i) => i.applicationId === id);
    if (existing) Object.assign(existing, input);
    else d.interviews.push({ id: uid("iv"), applicationId: id, ...input });
    if (app.status === "SHORTLISTED" || app.status === "UNDER_REVIEW") { app.status = "INTERVIEW_SCHEDULED"; app.history.push({ status: "INTERVIEW_SCHEDULED", at: new Date().toISOString(), by: u.fullName }); }
    audit(u, "recruitment.interview_scheduled", "Application", id, null, { at: input.scheduledAt });
    return d.interviews.find((i) => i.applicationId === id)!;
  });
}
export async function recruitmentAnalytics() {
  requirePerm("recruitment.manage"); await delay(150);
  const d = getDB();
  const statuses: CandidateStatus[] = ["NEW", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEWED", "FOR_FINAL_REVIEW", "HIRED", "REJECTED", "WITHDRAWN"];
  return {
    byStatus: statuses.map((s) => ({ status: s, count: d.applications.filter((a) => a.status === s).length })),
    byJob: d.jobs.map((j) => {
      const apps = d.applications.filter((a) => a.jobPostingId === j.id);
      return { title: j.title, count: apps.length, avgScore: apps.length ? Math.round(apps.reduce((s, a) => s + a.matchScore, 0) / apps.length) : 0 };
    }),
    total: d.applications.length,
  };
}

/* ================= REPORTS (worker-simulated) ================= */
function buildReportCSV(type: ReportType, params: Record<string, string>): string {
  const d = getDB();
  switch (type) {
    case "EMPLOYEE_LIST":
      return toCSV([["Employee No", "Name", "Position", "Department", "SG-Step", "Status", "Hired"],
      ...d.employees.map((e) => [e.employeeNo, `${e.lastName}, ${e.firstName}`, d.positions.find((p) => p.id === e.positionId)!.title, d.departments.find((x) => x.id === e.departmentId)!.name, `${e.salaryGrade}-${e.salaryStep}`, e.status, e.hiredAt])]);
    case "PAYROLL_REGISTER": {
      const rows = d.employeePayrolls.filter((e) => e.runId === params.runId);
      return toCSV([["Employee", "Position", "Basic", "Gross", "GSIS", "PhilHealth", "Pag-IBIG", "Tax", "Loan", "Total Ded.", "Net"],
      ...rows.map((r) => [r.snapshot.fullName, r.snapshot.position, (r.basicCents / 100).toFixed(2), (r.grossCents / 100).toFixed(2), (r.gsisCents / 100).toFixed(2), (r.philhealthCents / 100).toFixed(2), (r.pagibigCents / 100).toFixed(2), (r.wtaxCents / 100).toFixed(2), (r.loanCents / 100).toFixed(2), (r.totalDeductCents / 100).toFixed(2), (r.netCents / 100).toFixed(2)])]);
    }
    case "REMITTANCE": {
      const rows = d.employeePayrolls.filter((e) => e.runId === params.runId);
      return toCSV([["Employee", "GSIS (PHP)", "PhilHealth (PHP)", "Pag-IBIG (PHP)", "WTAX (PHP)"],
      ...rows.map((r) => [r.snapshot.fullName, (r.gsisCents / 100).toFixed(2), (r.philhealthCents / 100).toFixed(2), (r.pagibigCents / 100).toFixed(2), (r.wtaxCents / 100).toFixed(2)]),
      ["TOTAL", (sumCents(rows.map((r) => r.gsisCents)) / 100).toFixed(2), (sumCents(rows.map((r) => r.philhealthCents)) / 100).toFixed(2), (sumCents(rows.map((r) => r.pagibigCents)) / 100).toFixed(2), (sumCents(rows.map((r) => r.wtaxCents)) / 100).toFixed(2)]]);
    }
    case "ATTENDANCE_SUMMARY": {
      const ym = params.ym;
      return toCSV([["Employee", "Present", "Late (days)", "Late+UT (min)", "OT (min)", "Absent", "On Leave"],
      ...d.employees.filter((e) => e.status === "ACTIVE").map((e) => {
        const rows = d.attendance.filter((a) => a.employeeId === e.id && a.date.startsWith(ym));
        return [`${e.lastName}, ${e.firstName}`, rows.filter((a) => ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME"].includes(a.status)).length,
        rows.filter((a) => a.lateMin > 0).length, rows.reduce((s, a) => s + a.lateMin + a.undertimeMin, 0), rows.reduce((s, a) => s + a.otMin, 0),
        rows.filter((a) => a.status === "ABSENT").length, rows.filter((a) => a.status === "ON_LEAVE").length];
      })]);
    }
    case "DTR": {
      const emp = d.employees.find((e) => e.id === params.employeeId)!;
      const rows = d.attendance.filter((a) => a.employeeId === params.employeeId && a.date.startsWith(params.ym));
      const f = (m?: number) => (m == null ? "—" : `${`${Math.floor(m / 60)}`.padStart(2, "0")}:${`${m % 60}`.padStart(2, "0")}`);
      return toCSV([[`DAILY TIME RECORD — ${emp.firstName} ${emp.lastName} (${params.ym})`], [],
      ["Date", "AM In", "PM Out", "Hours", "Late (min)", "UT (min)", "OT (min)", "Status"],
      ...rows.sort((a, b) => a.date.localeCompare(b.date)).map((a) => [a.date, f(a.clockIn), f(a.clockOut), (a.totalMin / 60).toFixed(2), a.lateMin, a.undertimeMin, a.otMin, a.status])]);
    }
    case "LEAVE_REPORT":
      return toCSV([["Employee", "Type", "From", "To", "Days", "Status", "Filed"],
      ...d.leaveRequests.map((r) => { const e = d.employees.find((x) => x.id === r.employeeId); return [e ? `${e.lastName}, ${e.firstName}` : "—", d.leaveTypes.find((t) => t.id === r.leaveTypeId)!.name, r.startDate, r.endDate, r.workingDays, r.status, r.filedAt.slice(0, 10)]; })]);
    case "LOAN_LEDGER": {
      const loan = d.loans.find((l) => l.id === params.loanId)!;
      return toCSV([[`LOAN LEDGER — ${loan.refNo}`], [], ["Date", "Type", "Amount (PHP)", "Memo"],
      ...d.loanLedger.filter((l) => l.loanId === params.loanId).map((l) => [l.at.slice(0, 10), l.type, (l.amountCents / 100).toFixed(2), l.memo])]);
    }
    case "PAYSLIP": {
      const ep = d.employeePayrolls.find((e) => e.id === params.employeePayrollId);
      if (!ep) return "Employee payroll line not found";
      return toCSV([[`PAYSLIP ${params.number ?? ""}`], ["Employee", ep.snapshot.fullName], ["Position", ep.snapshot.position], [],
      ...ep.earningLines.map((l) => [l.label, (l.cents / 100).toFixed(2)]), ["GROSS", (ep.grossCents / 100).toFixed(2)], [],
      ...ep.deductionLines.map((l) => [l.label, (l.cents / 100).toFixed(2)]), ["TOTAL DEDUCTIONS", (ep.totalDeductCents / 100).toFixed(2)], [],
      ["NET PAY", (ep.netCents / 100).toFixed(2)]]);
    }
  }
}
export async function requestReport(type: ReportType, params: Record<string, string>, paramsLabel: string) {
  const u = requirePerm("reports.view"); await delay(200);
  const report: ReportRun = { id: uid("rep"), type, paramsLabel, status: "QUEUED", progress: 4, requestedBy: u.id, createdAt: new Date().toISOString() };
  mutate((d) => { d.reports.unshift(report); audit(u, "report.request", "ReportRun", report.id, null, { type }); });
  setTimeout(() => {
    const d = getDB(); const r = d.reports.find((x) => x.id === report.id);
    if (!r) return;
    r.status = "PROCESSING"; r.progress = 45; persist(); emit();
    setTimeout(() => {
      mutate((dd) => {
        const rr = dd.reports.find((x) => x.id === report.id)!;
        try {
          const csv = buildReportCSV(type, params);
          const file = { id: uid("file"), name: `${type.toLowerCase()}_${new Date().toISOString().slice(0, 10)}_${rr.id.slice(-4)}.csv`, mime: "text/csv", content: csv, createdAt: new Date().toISOString(), sizeKb: Math.max(1, Math.round(csv.length / 1024)) };
          dd.files.unshift(file);
          rr.fileId = file.id; rr.status = "DONE"; rr.progress = 100; rr.completedAt = new Date().toISOString();
          audit(u, "report.completed", "ReportRun", rr.id, null, { file: file.name });
          notify({ userId: u.id, type: "REPORT", title: "Report ready", body: `${type.replace(/_/g, " ")} has been generated and stored privately.`, link: "/reports" });
        } catch {
          rr.status = "FAILED";
          audit(u, "report.failed", "ReportRun", rr.id, null, { type });
        }
      });
    }, 1500);
  }, 900);
  return report;
}
export async function listReports() {
  const u = requirePerm("reports.view"); await delay(150);
  const d = getDB();
  const staleCutoff = Date.now() - 45_000;
  d.reports.forEach((r) => {
    if (["QUEUED", "PROCESSING"].includes(r.status) && new Date(r.createdAt).getTime() < staleCutoff) {
      r.status = "FAILED"; r.progress = 0;
      audit(u, "report.failed", "ReportRun", r.id, null, { reason: "worker_timeout" });
    }
  });
  persist();
  return d.reports.map((r) => ({ ...r, requestedByName: d.users.find((x) => x.id === r.requestedBy)?.fullName ?? "—", file: r.fileId ? d.files.find((f) => f.id === r.fileId) : undefined }));
}
export async function reportFile(fileId: string) {
  requirePerm("reports.view");
  const f = getDB().files.find((x) => x.id === fileId);
  if (!f) throw new ApiError("NOT_FOUND", "File not found.");
  return f;
}

/* ================= NOTIFICATIONS / AUDIT / SEARCH ================= */
export async function myNotifications() {
  const u = requireUser(); await delay(120);
  return getDB().notifications.filter((n) => n.userId === u.id).slice(0, 40);
}
export async function unreadCount() {
  const u = sessionUser();
  if (!u) return 0;
  return getDB().notifications.filter((n) => n.userId === u.id && !n.read).length;
}
export async function markRead(id: string) {
  requireUser();
  mutate((d) => { const n = d.notifications.find((x) => x.id === id); if (n) n.read = true; });
}
export async function markAllRead() {
  const u = requireUser();
  mutate((d) => { d.notifications.forEach((n) => { if (n.userId === u.id) n.read = true; }); });
}
export async function auditLog(q: PageQuery & { action?: string; entity?: string }) {
  requirePerm("audit.view"); await delay();
  const d = getDB();
  let rows = [...d.audit];
  if (q.action) rows = rows.filter((r) => r.action === q.action);
  if (q.entity) rows = rows.filter((r) => r.entity === q.entity);
  if (q.q) { const s = q.q.toLowerCase(); rows = rows.filter((r) => `${r.actorName} ${r.action} ${r.entity} ${r.entityId}`.toLowerCase().includes(s)); }
  return paginate(rows, q, 14);
}
export async function globalSearch(q: string) {
  const u = requireUser(); await delay(150);
  const d = getDB();
  const s = q.toLowerCase();
  const scope = visibleEmployeeIds(u);
  const emps = d.employees.filter((e) => (scope === "ALL" ? true : scope.has(e.id)) && `${e.firstName} ${e.lastName} ${e.employeeNo}`.toLowerCase().includes(s)).slice(0, 5)
    .map((e) => ({ kind: "Employee" as const, id: e.id, label: `${e.firstName} ${e.lastName}`, sub: d.positions.find((p) => p.id === e.positionId)!.title, to: `/employees/${e.id}` }));
  const jobs = can(u, "recruitment.manage") ? d.jobs.filter((j) => j.title.toLowerCase().includes(s)).slice(0, 3).map((j) => ({ kind: "Job" as const, id: j.id, label: j.title, sub: `SG ${j.salaryGrade}`, to: "/recruitment" })) : [];
  return [...emps, ...jobs];
}

/* ================= SETTINGS / ADMIN ================= */
export async function orgOverview() {
  requireUser(); await delay(150);
  const d = getDB();
  return {
    agency: d.agency,
    departments: d.departments.map((dep) => ({
      ...dep, head: d.employees.find((e) => e.id === dep.headEmployeeId),
      count: d.employees.filter((e) => e.departmentId === dep.id && e.status === "ACTIVE").length,
      positions: d.positions.filter((p) => p.departmentId === dep.id).length,
    })),
    positions: d.positions.map((p) => ({ ...p, department: d.departments.find((x) => x.id === p.departmentId)!.name })),
  };
}
export async function salaryTables() {
  requireUser(); await delay(150);
  const d = getDB();
  return {
    schedules: d.salarySchedules,
    grades: d.salaryGrades.map((g) => ({ grade: g.grade, steps: Array.from({ length: 8 }, (_, i) => stepSalaryCents(g.step1Cents, i + 1)) })),
  };
}
export async function holidaysList() { requireUser(); await delay(120); return getDB().holidays.sort((a, b) => a.date.localeCompare(b.date)); }
export async function upsertHoliday(input: { id?: string; date: string; name: string; type: "REGULAR" | "SPECIAL" }) {
  const u = requirePerm("settings.manage"); await delay();
  return mutate((d) => {
    if (input.id) {
      const h = d.holidays.find((x) => x.id === input.id)!;
      audit(u, "holiday.update", "Holiday", h.id, { date: h.date, name: h.name }, { date: input.date, name: input.name });
      Object.assign(h, input);
      return h;
    }
    if (d.holidays.some((h) => h.date === input.date)) throw new ApiError("DUPLICATE", "A holiday already exists on this date.");
    const h = { id: uid("hol"), ...input };
    d.holidays.push(h);
    audit(u, "holiday.create", "Holiday", h.id, null, { date: input.date, name: input.name });
    return h;
  });
}
export async function deleteHoliday(id: string) {
  const u = requirePerm("settings.manage"); await delay(150);
  return mutate((d) => {
    const h = d.holidays.find((x) => x.id === id);
    if (!h) throw new ApiError("NOT_FOUND", "Holiday not found.");
    d.holidays = d.holidays.filter((x) => x.id !== id);
    audit(u, "holiday.delete", "Holiday", id, { date: h.date, name: h.name }, null);
  });
}
export async function usersList() {
  requirePerm("users.manage"); await delay(150);
  const d = getDB();
  return d.users.map((x) => ({ ...x, employee: d.employees.find((e) => e.id === x.employeeId) }));
}
export async function setUserRole(id: string, role: Role) {
  const u = requirePerm("users.manage"); await delay();
  return mutate((d) => {
    const target = d.users.find((x) => x.id === id);
    if (!target) throw new ApiError("NOT_FOUND", "User not found.");
    audit(u, "user.role_change", "UserProfile", id, { role: target.role }, { role });
    target.role = role;
    return target;
  });
}
export async function shiftsList() { requireUser(); await delay(100); return getDB().shifts; }
export async function systemSettings() { requireUser(); await delay(100); return getDB().settings; }
export async function dtrCsvDownload(employeeId: string, ym: string) {
  const u = requireUser(); await delay(150);
  const d = getDB();
  const emp = d.employees.find((e) => e.id === employeeId);
  if (!emp) throw new ApiError("NOT_FOUND", "Employee not found.");
  if (!can(u, "attendance.read") && u.employeeId !== employeeId) throw new ApiError("FORBIDDEN", "Not authorized.");
  audit(u, "attendance.dtr_export", "Employee", employeeId, null, { ym });
  return buildReportCSV("DTR", { employeeId, ym });
}
export { toCents };
