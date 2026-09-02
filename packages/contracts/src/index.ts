/**
 * @gov-hris/contracts — neutral shared package.
 * Types/enums + RBAC matrix + pure engine. Importable by apps/api,
 * apps/worker, and (in the Next.js port) apps/web for type safety only.
 * The web app NEVER imports authoritative business services from here —
 * those live in apps/api and are reached over /api/v1.
 */
export * from "./engine";

/* ---------- RBAC ---------- */
export type Role =
  | "SYSTEM_ADMIN" | "ADMINISTRATOR" | "HR_OFFICER" | "PAYROLL_OFFICER" | "ACCOUNTING"
  | "SUPERVISOR" | "DEPARTMENT_HEAD" | "EMPLOYEE" | "HIRING_MANAGER" | "APPLICANT";

export type Permission =
  | "employees.read" | "employees.create" | "employees.update"
  | "attendance.read" | "attendance.manage" | "attendance.adjust"
  | "leave.file" | "leave.approve.supervisor" | "leave.approve.hr" | "leave.view.team"
  | "payroll.read" | "payroll.generate" | "payroll.verify" | "payroll.approve" | "payroll.release" | "payroll.export"
  | "deductions.manage" | "allowances.manage" | "loans.apply" | "loans.manage" | "recruitment.manage"
  | "reports.view" | "audit.view" | "users.manage" | "roles.manage" | "settings.manage";

export const PERMISSIONS: Permission[] = [
  "employees.read", "employees.create", "employees.update",
  "attendance.read", "attendance.manage", "attendance.adjust",
  "leave.file", "leave.approve.supervisor", "leave.approve.hr", "leave.view.team",
  "payroll.read", "payroll.generate", "payroll.verify", "payroll.approve", "payroll.release", "payroll.export",
  "deductions.manage", "allowances.manage", "loans.apply", "loans.manage", "recruitment.manage",
  "reports.view", "audit.view", "users.manage", "roles.manage", "settings.manage",
];
export const ROLES: Role[] = [
  "SYSTEM_ADMIN", "ADMINISTRATOR", "HR_OFFICER", "PAYROLL_OFFICER", "ACCOUNTING",
  "SUPERVISOR", "DEPARTMENT_HEAD", "EMPLOYEE", "HIRING_MANAGER", "APPLICANT",
];
export const ROLE_PERMISSIONS: Record<Role, Permission[] | "ALL"> = {
  SYSTEM_ADMIN: "ALL",
  ADMINISTRATOR: "ALL",
  HR_OFFICER: ["employees.read", "employees.create", "employees.update", "attendance.read", "attendance.manage", "attendance.adjust",
    "leave.file", "leave.approve.hr", "leave.view.team", "allowances.manage", "loans.manage", "recruitment.manage", "reports.view"],
  PAYROLL_OFFICER: ["employees.read", "attendance.read", "leave.file", "payroll.read", "payroll.generate", "payroll.export",
    "deductions.manage", "loans.manage", "reports.view", "loans.apply"],
  ACCOUNTING: ["employees.read", "payroll.read", "payroll.verify", "payroll.export", "loans.manage", "reports.view"],
  SUPERVISOR: ["employees.read", "attendance.read", "attendance.adjust", "leave.file", "leave.approve.supervisor", "leave.view.team", "loans.apply"],
  DEPARTMENT_HEAD: ["employees.read", "attendance.read", "attendance.adjust", "leave.file", "leave.approve.supervisor",
    "leave.view.team", "loans.apply", "payroll.approve", "reports.view"],
  EMPLOYEE: ["leave.file", "loans.apply"],
  HIRING_MANAGER: ["recruitment.manage", "employees.read", "reports.view"],
  APPLICANT: [],
};
export const roleHas = (role: Role, perm: Permission): boolean => {
  const set = ROLE_PERMISSIONS[role];
  return set === "ALL" || set.includes(perm);
};

/* ---------- API envelope ---------- */
export interface ApiEnvelope<T> { data: T; correlationId: string; }
export interface ApiErrorBody { code: string; message: string; details?: unknown; correlationId: string; }
export interface Page<T> { rows: T[]; total: number; page: number; pageSize: number; }
export interface PageQuery { page?: number; pageSize?: number; q?: string; sort?: string; dir?: "asc" | "desc"; }

/* ---------- DTO validation schemas (Zod) ---------- */
export { leaveRequestSchema, payrollGenerateSchema, loanApplySchema, employeeCreateSchema } from "./schemas";
