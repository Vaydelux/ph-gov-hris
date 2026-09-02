/**
 * CENTRALIZED TYPED API LAYER.
 *
 * Every UI component imports this module — never the adapters directly.
 *
 *   VITE_APP_MODE=preview     → PreviewAdapter  (src/server/* in-browser engine + fixtures)
 *   VITE_APP_MODE=production  → HttpApiAdapter  (real NestJS REST endpoints, Supabase JWT)
 *
 * Production architecture: Browser → Next.js/Vite → NestJS (/api/v1) → Prisma → PostgreSQL,
 * with BullMQ workers for payroll/reports. This file is the seam where the
 * preview adapter is swapped out; pages never change.
 */
import { config } from "./config";
import * as preview from "../server/api";
import { ApiError, type PageQuery } from "./contracts";

export type ApiAdapter = typeof preview;

/* ================= HTTP adapter (production) ================= */
const TOKEN_KEY = "govhris.token";
export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

async function http<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (config.misconfigured) throw new ApiError("MISCONFIGURED", config.misconfigured);
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Client": "gov-hris-web" };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, { method, headers, body: body == null ? undefined : JSON.stringify(body), signal });
  } catch {
    throw new ApiError("API_UNAVAILABLE", `The Government HRIS API is unreachable at ${config.apiUrl}. In production mode the UI never falls back to demo data — start the API (pnpm dev:api) or switch VITE_APP_MODE to preview.`);
  }
  if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new CustomEvent("govhris:unauthorized")); throw new ApiError("UNAUTHORIZED", "Your session expired. Please sign in again."); }
  if (res.status === 403) throw new ApiError("FORBIDDEN", "You are not authorized to perform this action.");
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const err = json as { message?: string; code?: string; correlationId?: string } | null;
    throw new ApiError(err?.code ?? `HTTP_${res.status}`, err?.message ?? `Request failed (${res.status}). Correlation: ${res.headers.get("x-correlation-id") ?? "—"}`);
  }
  return json as T;
}

const qs = (params?: object) => {
  if (!params) return "";
  const s = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  return s ? `?${s}` : "";
};

/**
 * REST contract — implemented by apps/api (NestJS). Routes follow the PRD:
 * /api/v1/employees, /api/v1/attendance, /api/v1/payroll/:id/generate …
 */
const httpAdapter = {
  /* auth */
  login: async (email: string, password: string) => {
    const r = await http<{ accessToken: string; user: Awaited<ReturnType<ApiAdapter["login"]>> }>("POST", "/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, r.accessToken);
    return r.user;
  },
  logout: async () => { localStorage.removeItem(TOKEN_KEY); await http("POST", "/auth/logout").catch(() => undefined); },
  me: () => http<Awaited<ReturnType<ApiAdapter["me"]>>>("GET", "/auth/me"),
  forgotPassword: (email: string) => http<string>("POST", "/auth/forgot-password", { email }),
  previewLoginAs: async () => { throw new ApiError("FORBIDDEN", "Preview persona switching is disabled in production mode."); },

  /* dashboards */
  adminDashboard: () => http<Unwrap<typeof preview.adminDashboard>>("GET", "/dashboard/admin"),
  myDashboard: () => http<Unwrap<typeof preview.myDashboard>>("GET", "/dashboard/me"),

  /* employees */
  listEmployees: (q: PageQuery & { departmentId?: string; status?: string }) => http<Unwrap<typeof preview.listEmployees>>("GET", `/employees${qs(q)}`),
  getEmployee: (id: string) => http<Unwrap<typeof preview.getEmployee>>("GET", `/employees/${id}`),
  updateEmployee: (id: string, patch: unknown) => http<Unwrap<typeof preview.updateEmployee>>("PATCH", `/employees/${id}`, patch),
  createEmployee: (input: unknown) => http<Unwrap<typeof preview.createEmployee>>("POST", "/employees", input),

  /* attendance */
  attendanceOverview: (date?: string) => http<Unwrap<typeof preview.attendanceOverview>>("GET", `/attendance/overview${qs({ date })}`),
  listAttendance: (q: PageQuery & { date?: string; departmentId?: string; status?: string }) => http<Unwrap<typeof preview.listAttendance>>("GET", `/attendance${qs(q)}`),
  getDTR: (employeeId: string, ym: string) => http<Unwrap<typeof preview.getDTR>>("GET", `/attendance/dtr/${employeeId}${qs({ ym })}`),
  requestAdjustment: (input: unknown) => http<Unwrap<typeof preview.requestAdjustment>>("POST", "/attendance/adjustments", input),
  listAdjustments: (q: PageQuery & { status?: string }) => http<Unwrap<typeof preview.listAdjustments>>("GET", `/attendance/adjustments${qs(q)}`),
  decideAdjustment: (id: string, approve: boolean, note?: string) => http<Unwrap<typeof preview.decideAdjustment>>("POST", `/attendance/adjustments/${id}/decide`, { approve, note }),
  runBiometricSync: (deviceId: string, records?: number) => http<Unwrap<typeof preview.runBiometricSync>>("POST", `/attendance/biometric/${deviceId}/sync`, { records }),
  deviceList: () => http<Unwrap<typeof preview.deviceList>>("GET", "/attendance/biometric/devices"),
  importHistory: () => http<Unwrap<typeof preview.importHistory>>("GET", "/attendance/biometric/imports"),
  dtrCsvDownload: (employeeId: string, ym: string) => http<string>("GET", `/attendance/dtr/${employeeId}/export${qs({ ym })}`),

  /* leave */
  leaveBalances: (employeeId?: string) => http<Unwrap<typeof preview.leaveBalances>>("GET", `/leaves/balances${qs({ employeeId })}`),
  listLeaveRequests: (q: PageQuery & { scope?: string; status?: string }) => http<Unwrap<typeof preview.listLeaveRequests>>("GET", `/leaves${qs(q)}`),
  fileLeave: (input: unknown) => http<Unwrap<typeof preview.fileLeave>>("POST", "/leaves", input),
  decideLeave: (id: string, action: "APPROVE" | "REJECT", note?: string) => http<Unwrap<typeof preview.decideLeave>>("POST", `/leaves/${id}/decide`, { action, note }),
  cancelLeave: (id: string) => http<Unwrap<typeof preview.cancelLeave>>("POST", `/leaves/${id}/cancel`),
  leaveLedger: (employeeId: string) => http<Unwrap<typeof preview.leaveLedger>>("GET", `/leaves/ledger/${employeeId}`),
  teamLeaveCalendar: (ym: string) => http<Unwrap<typeof preview.teamLeaveCalendar>>("GET", `/leaves/calendar${qs({ ym })}`),

  /* payroll */
  payrollOverview: () => http<Unwrap<typeof preview.payrollOverview>>("GET", "/payroll"),
  generatePayroll: (periodId: string) => http<Unwrap<typeof preview.generatePayroll>>("POST", `/payroll/generate`, { periodId }),
  getRun: (id: string) => http<Unwrap<typeof preview.getRun>>("GET", `/payroll/${id}`),
  verifyRun: (id: string) => http<Unwrap<typeof preview.verifyRun>>("POST", `/payroll/${id}/verify`),
  approveRun: (id: string) => http<Unwrap<typeof preview.approveRun>>("POST", `/payroll/${id}/approve`),
  releaseRun: (id: string) => http<Unwrap<typeof preview.releaseRun>>("POST", `/payroll/${id}/release`),
  cancelRun: (id: string) => http<Unwrap<typeof preview.cancelRun>>("POST", `/payroll/${id}/cancel`),
  myPayslips: () => http<Unwrap<typeof preview.myPayslips>>("GET", "/payroll/payslips/mine"),
  bankFile: (runId: string) => http<Unwrap<typeof preview.bankFile>>("GET", `/payroll/${runId}/bank-file`),

  /* deductions / allowances / loans */
  deductionSchemes: () => http<Unwrap<typeof preview.deductionSchemes>>("GET", "/deductions/schemes"),
  addContributionRule: (schemeId: string, input: unknown) => http<Unwrap<typeof preview.addContributionRule>>("POST", `/deductions/schemes/${schemeId}/rules`, input),
  remittanceSummary: (runId: string) => http<Unwrap<typeof preview.remittanceSummary>>("GET", `/deductions/remittance${qs({ runId })}`),
  allowanceTypes: () => http<Unwrap<typeof preview.allowanceTypes>>("GET", "/allowances/types"),
  allowanceAssignments: (q: PageQuery & { typeId?: string; active?: string }) => http<Unwrap<typeof preview.allowanceAssignments>>("GET", `/allowances${qs(q)}`),
  grantAllowance: (input: unknown) => http<Unwrap<typeof preview.grantAllowance>>("POST", "/allowances", input),
  setAllowanceActive: (id: string, active: boolean) => http<Unwrap<typeof preview.setAllowanceActive>>("PATCH", `/allowances/${id}`, { active }),
  listLoans: (q: PageQuery & { status?: string; mine?: boolean }) => http<Unwrap<typeof preview.listLoans>>("GET", `/loans${qs(q)}`),
  applyLoan: (input: unknown) => http<Unwrap<typeof preview.applyLoan>>("POST", "/loans", input),
  reviewLoan: (id: string, action: "START_REVIEW" | "APPROVE" | "REJECT", approvedAmountCents?: number, termMonths?: number) => http<Unwrap<typeof preview.reviewLoan>>("POST", `/loans/${id}/review`, { action, approvedAmountCents, termMonths }),
  postLoanPayment: (id: string, amountCents: number, memo: string) => http<Unwrap<typeof preview.postLoanPayment>>("POST", `/loans/${id}/payments`, { amountCents, memo }),
  loanDetail: (id: string) => http<Unwrap<typeof preview.loanDetail>>("GET", `/loans/${id}`),
  loanTypes: () => http<Unwrap<typeof preview.loanTypes>>("GET", "/loans/types"),

  /* recruitment */
  publicJobs: () => http<Unwrap<typeof preview.publicJobs>>("GET", "/jobs/public"),
  publicJob: (slug: string) => http<Unwrap<typeof preview.publicJob>>("GET", `/jobs/public/${slug}`),
  submitApplication: (input: unknown) => http<Unwrap<typeof preview.submitApplication>>("POST", "/applications", input),
  applicantLogin: async (email: string, password: string) => {
    const r = await http<{ token: string; applicant: Unwrap<typeof preview.applicantLogin> }>("POST", "/applications/auth", { email, password });
    localStorage.setItem("govhris.applicant", r.applicant.id);
    return r.applicant;
  },
  applicantSession: () => http<Unwrap<typeof preview.applicantSession>>("GET", "/applications/auth/me"),
  applicantLogout: async () => { localStorage.removeItem("govhris.applicant"); },
  myApplications: () => http<Unwrap<typeof preview.myApplications>>("GET", "/applications/mine"),
  internalJobs: () => http<Unwrap<typeof preview.internalJobs>>("GET", "/jobs"),
  createJob: (input: unknown) => http<Unwrap<typeof preview.createJob>>("POST", "/jobs", input),
  setJobStatus: (id: string, status: "OPEN" | "CLOSED" | "DRAFT") => http<Unwrap<typeof preview.setJobStatus>>("PATCH", `/jobs/${id}`, { status }),
  kanban: (jobId?: string) => http<Unwrap<typeof preview.kanban>>("GET", `/applications${qs({ jobId })}`),
  applicationDetail: (id: string) => http<Unwrap<typeof preview.applicationDetail>>("GET", `/applications/${id}`),
  moveApplication: (id: string, status: unknown, note?: string) => http<Unwrap<typeof preview.moveApplication>>("POST", `/applications/${id}/status`, { status, note }),
  addTag: (id: string, tag: string) => http<Unwrap<typeof preview.addTag>>("POST", `/applications/${id}/tags`, { tag }),
  addEvaluation: (id: string, rating: number, note: string) => http<Unwrap<typeof preview.addEvaluation>>("POST", `/applications/${id}/evaluations`, { rating, note }),
  scheduleInterview: (id: string, input: unknown) => http<Unwrap<typeof preview.scheduleInterview>>("POST", `/applications/${id}/interviews`, input),
  recruitmentAnalytics: () => http<Unwrap<typeof preview.recruitmentAnalytics>>("GET", "/applications/analytics"),

  /* reports / notifications / audit / search */
  requestReport: (type: unknown, params: Record<string, string>, paramsLabel: string) => http<Unwrap<typeof preview.requestReport>>("POST", "/reports", { type, params, paramsLabel }),
  listReports: () => http<Unwrap<typeof preview.listReports>>("GET", "/reports"),
  reportFile: (fileId: string) => http<Unwrap<typeof preview.reportFile>>("GET", `/reports/files/${fileId}`),
  myNotifications: () => http<Unwrap<typeof preview.myNotifications>>("GET", "/notifications"),
  unreadCount: () => http<number>("GET", "/notifications/unread-count"),
  markRead: (id: string) => http<void>("POST", `/notifications/${id}/read`),
  markAllRead: () => http<void>("POST", "/notifications/read-all"),
  auditLog: (q: PageQuery & { action?: string; entity?: string }) => http<Unwrap<typeof preview.auditLog>>("GET", `/audit${qs(q)}`),
  globalSearch: (q: string) => http<Unwrap<typeof preview.globalSearch>>("GET", `/search${qs({ q })}`),

  /* settings */
  orgOverview: () => http<Unwrap<typeof preview.orgOverview>>("GET", "/settings/organization"),
  salaryTables: () => http<Unwrap<typeof preview.salaryTables>>("GET", "/settings/salary-grades"),
  holidaysList: () => http<Unwrap<typeof preview.holidaysList>>("GET", "/settings/holidays"),
  upsertHoliday: (input: unknown) => http<Unwrap<typeof preview.upsertHoliday>>("POST", "/settings/holidays", input),
  deleteHoliday: (id: string) => http<Unwrap<typeof preview.deleteHoliday>>("DELETE", `/settings/holidays/${id}`),
  usersList: () => http<Unwrap<typeof preview.usersList>>("GET", "/settings/users"),
  setUserRole: (id: string, role: unknown) => http<Unwrap<typeof preview.setUserRole>>("PATCH", `/settings/users/${id}`, { role }),
  shiftsList: () => http<Unwrap<typeof preview.shiftsList>>("GET", "/settings/schedules"),
  systemSettings: () => http<Unwrap<typeof preview.systemSettings>>("GET", "/settings"),
} as Partial<ApiAdapter>;

type Unwrap<T> = T extends (...args: never[]) => Promise<infer R> ? R : never;

/* ================= mode selection =================
   PREVIEW  → the in-browser adapter is the implementation.
   PRODUCTION → ONLY the HTTP adapter is reachable. Pure display helpers
   (permission matrix, formatters) are allow-listed; any other preview export
   throws instead of silently touching demo data — production never falls back. */
const STATIC_ALLOWLIST = new Set(["can", "ROLES", "PERMISSIONS", "ROLE_PERMISSIONS", "roleMatrix", "toCents"]);
const productionAdapter = new Proxy(httpAdapter as Record<string | symbol, unknown>, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === "string" && STATIC_ALLOWLIST.has(prop)) return (preview as Record<string, unknown>)[prop];
    if (typeof prop === "string") {
      return () => {
        throw new ApiError("NOT_AVAILABLE_IN_PRODUCTION",
          `"${prop}" has no production API implementation. Production mode never falls back to preview fixtures.`);
      };
    }
    return Reflect.get(target, prop);
  },
}) as unknown as ApiAdapter;

const adapter: ApiAdapter = config.isPreview ? preview : productionAdapter;

export default adapter;
export { preview as previewAdapter, httpAdapter };
