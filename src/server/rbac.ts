/**
 * Centralized permission matrix — preview copy of `packages/contracts` RBAC.
 * Production: NestJS PermissionsGuard enforces this server-side; the web app
 * only uses it to hide UI it is not allowed to see.
 */
import type { Permission, Role, UserProfile } from "../lib/contracts";

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
  SUPERVISOR: ["employees.read", "attendance.read", "attendance.adjust", "leave.file", "leave.approve.supervisor",
    "leave.view.team", "loans.apply"],
  DEPARTMENT_HEAD: ["employees.read", "attendance.read", "attendance.adjust", "leave.file", "leave.approve.supervisor",
    "leave.view.team", "loans.apply", "payroll.approve", "reports.view"],
  EMPLOYEE: ["leave.file", "loans.apply"],
  HIRING_MANAGER: ["recruitment.manage", "employees.read", "reports.view"],
  APPLICANT: [],
};
export const can = (user: UserProfile | null, perm: Permission): boolean => {
  if (!user) return false;
  const set = ROLE_PERMISSIONS[user.role];
  return set === "ALL" || set.includes(perm);
};
export const roleMatrix = () =>
  ROLES.map((r) => ({ role: r, permissions: ROLE_PERMISSIONS[r] === "ALL" ? PERMISSIONS : (ROLE_PERMISSIONS[r] as Permission[]) }));
