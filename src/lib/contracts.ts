/**
 * Neutral domain contracts — mirrors `packages/contracts` in the production
 * monorepo. No React, no Prisma, no NestJS. Money = integer centavos.
 */

export type Role =
  | "SYSTEM_ADMIN" | "ADMINISTRATOR" | "HR_OFFICER" | "PAYROLL_OFFICER" | "ACCOUNTING"
  | "SUPERVISOR" | "DEPARTMENT_HEAD" | "EMPLOYEE" | "HIRING_MANAGER" | "APPLICANT";

export type Permission =
  | "employees.read" | "employees.create" | "employees.update"
  | "attendance.read" | "attendance.manage" | "attendance.adjust"
  | "leave.file" | "leave.approve.supervisor" | "leave.approve.hr" | "leave.view.team"
  | "payroll.read" | "payroll.generate" | "payroll.verify" | "payroll.approve" | "payroll.release" | "payroll.export"
  | "deductions.manage" | "allowances.manage"
  | "loans.apply" | "loans.manage"
  | "recruitment.manage"
  | "reports.view" | "audit.view" | "users.manage" | "roles.manage" | "settings.manage";

export interface UserProfile {
  id: string; email: string; password: string; // password is PREVIEW-ONLY (Supabase Auth owns identity in production)
  fullName: string; role: Role; employeeId?: string; active: boolean; lastLoginAt?: string;
}
export interface Session { userId: string; issuedAt: number; expiresAt: number; }

/* ---------- organization ---------- */
export interface Agency { id: string; code: string; name: string; }
export interface Department { id: string; code: string; name: string; headEmployeeId?: string; }
export interface PositionRec { id: string; code: string; title: string; salaryGrade: number; departmentId: string; }
export interface SalarySchedule { id: string; name: string; effectiveFrom: string; note: string; }
export interface SalaryGradeRow { id: string; scheduleId: string; grade: number; step1Cents: number; }
export interface WorkShift { id: string; name: string; startMin: number; endMin: number; graceMin: number; lunchMin: number; }
export interface Holiday { id: string; date: string; name: string; type: "REGULAR" | "SPECIAL"; }

/* ---------- employees ---------- */
export type AppointmentType = "PERMANENT" | "CASUAL" | "JOB_ORDER" | "COS";
export type EmployeeStatus = "ACTIVE" | "SEPARATED" | "ON_LEAVE";
export interface Employee {
  id: string; employeeNo: string; userId?: string;
  firstName: string; middleName?: string; lastName: string; preferredName?: string;
  email: string; phone: string;
  departmentId: string; positionId: string;
  salaryGrade: number; salaryStep: number; scheduleId: string; shiftId: string;
  appointmentType: AppointmentType; status: EmployeeStatus;
  supervisorId?: string; hiredAt: string; separatedAt?: string;
  birthDate: string; gender: "M" | "F"; address: string;
  tin: string; gsisNo: string; philhealthNo: string; pagibigNo: string;
  bankName?: string; bankAccount?: string; avatarHue: number;
}

/* ---------- attendance ---------- */
export type AttendanceStatus =
  | "ON_TIME" | "LATE" | "UNDERTIME" | "LATE_AND_UNDERTIME" | "ABSENT" | "ON_LEAVE"
  | "HOLIDAY" | "REST_DAY" | "OFFICIAL_BUSINESS" | "INCOMPLETE";
export interface BiometricDevice { id: string; name: string; model: string; location: string; lastSyncAt: string; }
export interface RawTimeLog { id: string; deviceId: string; employeeNo: string; at: string; source: "BIOMETRIC" | "MANUAL"; }
export interface BiometricImport { id: string; deviceId: string; fileName: string; records: number; duplicates: number; importedBy: string; at: string; }
export interface AttendanceDay {
  id: string; employeeId: string; date: string;
  clockIn?: number; clockOut?: number; // minutes of day
  totalMin: number; lateMin: number; undertimeMin: number; otMin: number;
  status: AttendanceStatus; note?: string; finalized: boolean; source: "DEVICE" | "MANUAL" | "ADJUSTMENT";
}
export interface AttendanceAdjustment {
  id: string; employeeId: string; date: string;
  kind: "CLOCK_IN" | "CLOCK_OUT" | "FULL_DAY" | "STATUS";
  oldValue: string; newValue: string; reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedBy: string; approvedBy?: string; decidedAt?: string; createdAt: string;
}

/* ---------- leave ---------- */
export type LeaveStatus = "PENDING_SUPERVISOR" | "PENDING_HR" | "APPROVED" | "REJECTED" | "CANCELLED";
export type LedgerType = "CREDIT" | "DEBIT" | "ADJUSTMENT" | "REVERSAL" | "EXPIRY";
export interface LeaveType { id: string; code: string; name: string; annualDays: number; requiresDoc: boolean; color: string; }
export interface LeaveLedgerEntry {
  id: string; employeeId: string; leaveTypeId: string; type: LedgerType;
  daysH: number; // hundredths of a day
  refType?: "REQUEST" | "SYSTEM" | "ADMIN"; refId?: string; memo: string; at: string; actorId: string;
}
export interface ApprovalStep { stage: "SUPERVISOR" | "HR"; actorId: string; actorName: string; action: "APPROVE" | "REJECT"; at: string; note?: string; }
export interface LeaveRequest {
  id: string; employeeId: string; leaveTypeId: string;
  startDate: string; endDate: string;
  workingDays: number; reason: string; docName?: string;
  status: LeaveStatus; filedAt: string; approvals: ApprovalStep[]; rejectionNote?: string;
}

/* ---------- government deductions ---------- */
export type SchemeCode = "GSIS" | "PHILHEALTH" | "PAGIBIG" | "WTAX";
export interface DeductionScheme { id: string; code: SchemeCode; name: string; description: string; }
export interface ContributionRule {
  id: string; schemeId: string; effectiveFrom: string;
  employeeBps?: number; employerBps?: number;
  monthlyFloorCents?: number; monthlyCapCents?: number;
  note: string; demo: boolean; // demo === true ⇒ visibly NOT legally validated
}
export interface TaxBracket { id: string; ruleId: string; fromCents: number; toCents: number | null; baseCents: number; rateBps: number; }

/* ---------- allowances ---------- */
export interface AllowanceType { id: string; code: string; name: string; monthlyCents: number; taxable: boolean; active: boolean; }
export interface EmployeeAllowance {
  id: string; employeeId: string; allowanceTypeId: string; monthlyCents: number;
  effectiveFrom: string; effectiveTo?: string; active: boolean; grantedBy: string;
}

/* ---------- loans ---------- */
export type LoanStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "ACTIVE" | "PAID" | "REJECTED" | "CANCELLED";
export type LoanLedgerType = "DISBURSEMENT" | "PAYROLL_PAYMENT" | "MANUAL_PAYMENT" | "ADJUSTMENT" | "REVERSAL";
export interface LoanType { id: string; code: string; name: string; maxAmountCents: number; maxTermMonths: number; }
export interface EmployeeLoan {
  id: string; refNo: string; employeeId: string; loanTypeId: string;
  appliedAmountCents: number; approvedAmountCents?: number;
  termMonths: number; installmentCents: number; balanceCents: number;
  status: LoanStatus; appliedAt: string; decidedAt?: string; decidedBy?: string;
}
export interface LoanLedgerEntry {
  id: string; loanId: string; type: LoanLedgerType; amountCents: number;
  refType: "PAYROLL_RUN" | "MANUAL" | "SYSTEM"; refId?: string; memo: string; at: string; actorId: string;
}
export interface LoanPaymentSchedule { id: string; loanId: string; seq: number; dueLabel: string; amountCents: number; paidAt?: string; paidVia?: string; }

/* ---------- payroll ---------- */
export type PayrollRunStatus =
  | "DRAFT" | "QUEUED" | "COMPUTING" | "COMPUTED" | "VERIFIED" | "APPROVED" | "RELEASED" | "FAILED" | "CANCELLED";
export interface PayrollPeriod { id: string; label: string; from: string; to: string; cutoff: string; closed: boolean; }
export interface PayrollRun {
  id: string; periodId: string; status: PayrollRunStatus;
  progress: number; stage: string; log: string[];
  createdBy?: string; verifiedBy?: string; approvedBy?: string; releasedBy?: string;
  createdAt: string; verifiedAt?: string; approvedAt?: string; releasedAt?: string;
  employeeCount: number; grossCents: number; deductionsCents: number; netCents: number;
  idempotencyKey: string; error?: string;
}
export interface PayrollLine { label: string; cents: number; }
export interface EmployeePayroll {
  id: string; runId: string; employeeId: string;
  snapshot: { fullName: string; position: string; department: string; grade: number; step: number; scheduleName: string; employeeNo: string; };
  basicCents: number; otCents: number; lateDeductCents: number; grossCents: number;
  gsisCents: number; philhealthCents: number; pagibigCents: number; wtaxCents: number;
  loanCents: number; totalDeductCents: number; netCents: number;
  earningLines: PayrollLine[]; deductionLines: PayrollLine[];
  attendanceSnapshot: { present: number; lateDays: number; absent: number; otMin: number; lateMin: number; utMin: number; };
}
export interface Payslip { id: string; number: string; employeePayrollId: string; employeeId: string; runId: string; releasedAt: string; }

/* ---------- recruitment ---------- */
export type CandidateStatus =
  | "NEW" | "UNDER_REVIEW" | "SHORTLISTED" | "INTERVIEW_SCHEDULED" | "INTERVIEWED"
  | "FOR_FINAL_REVIEW" | "HIRED" | "REJECTED" | "WITHDRAWN";
export type JobStatus = "DRAFT" | "OPEN" | "CLOSED";
export interface JobPosting {
  id: string; slug: string; title: string; departmentId: string; positionTitle: string;
  salaryGrade: number; employmentType: string; workLocation: string;
  summary: string; responsibilities: string[]; qualifications: string[]; keywords: string[];
  postedAt: string; deadline: string; status: JobStatus; openings: number;
}
export interface ApplicantProfile { id: string; fullName: string; email: string; phone: string; password: string; createdAt: string; }
export interface StatusMove { status: CandidateStatus; at: string; by: string; note?: string; }
export interface Application {
  id: string; jobPostingId: string; applicantId: string;
  status: CandidateStatus; matchScore: number;
  coverLetter: string; resumeText: string; docName?: string;
  appliedAt: string; tags: string[]; history: StatusMove[];
}
export interface Evaluation { id: string; applicationId: string; authorName: string; rating: number; note: string; at: string; }
export interface Interview { id: string; applicationId: string; scheduledAt: string; mode: "ONSITE" | "ONLINE"; location?: string; participants: string[]; }

/* ---------- supporting ---------- */
export type NotificationType = "LEAVE" | "ATTENDANCE" | "PAYROLL" | "LOAN" | "RECRUITMENT" | "REPORT" | "SYSTEM";
export interface Notification {
  id: string; userId?: string; employeeId?: string; type: NotificationType;
  title: string; body: string; read: boolean; createdAt: string; link?: string;
}
export interface AuditLog {
  id: string; actorId: string; actorName: string; action: string;
  entity: string; entityId: string;
  before?: Record<string, unknown> | null; after?: Record<string, unknown> | null;
  requestId: string; at: string;
}
export type ReportType = "DTR" | "ATTENDANCE_SUMMARY" | "PAYROLL_REGISTER" | "REMITTANCE" | "EMPLOYEE_LIST" | "LEAVE_REPORT" | "LOAN_LEDGER" | "PAYSLIP";
export interface ReportRun {
  id: string; type: ReportType; paramsLabel: string; status: "QUEUED" | "PROCESSING" | "DONE" | "FAILED";
  progress: number; requestedBy: string; fileId?: string; createdAt: string; completedAt?: string;
}
export interface GeneratedFile { id: string; name: string; mime: string; content: string; createdAt: string; sizeKb: number; }
export interface SystemSetting { key: string; value: string; }

export interface DB {
  version: number;
  agency: Agency;
  users: UserProfile[];
  departments: Department[];
  positions: PositionRec[];
  salarySchedules: SalarySchedule[];
  salaryGrades: SalaryGradeRow[];
  shifts: WorkShift[];
  holidays: Holiday[];
  employees: Employee[];
  devices: BiometricDevice[];
  rawLogs: RawTimeLog[];
  imports: BiometricImport[];
  attendance: AttendanceDay[];
  adjustments: AttendanceAdjustment[];
  leaveTypes: LeaveType[];
  leaveLedger: LeaveLedgerEntry[];
  leaveRequests: LeaveRequest[];
  schemes: DeductionScheme[];
  contributionRules: ContributionRule[];
  taxBrackets: TaxBracket[];
  allowanceTypes: AllowanceType[];
  employeeAllowances: EmployeeAllowance[];
  loanTypes: LoanType[];
  loans: EmployeeLoan[];
  loanLedger: LoanLedgerEntry[];
  loanSchedules: LoanPaymentSchedule[];
  periods: PayrollPeriod[];
  runs: PayrollRun[];
  employeePayrolls: EmployeePayroll[];
  payslips: Payslip[];
  notifications: Notification[];
  audit: AuditLog[];
  jobs: JobPosting[];
  applicants: ApplicantProfile[];
  applications: Application[];
  evaluations: Evaluation[];
  interviews: Interview[];
  reports: ReportRun[];
  files: GeneratedFile[];
  settings: SystemSetting[];
}

/* ---------- payroll workflow state machine ---------- */
export const PAYROLL_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  DRAFT: ["QUEUED", "CANCELLED"],
  QUEUED: ["COMPUTING", "CANCELLED", "FAILED"],
  COMPUTING: ["COMPUTED", "FAILED", "CANCELLED"],
  COMPUTED: ["VERIFIED", "CANCELLED"],
  VERIFIED: ["APPROVED"],
  APPROVED: ["RELEASED"],
  RELEASED: [], // terminal & immutable — corrections require a separate adjustment run
  FAILED: ["QUEUED"],
  CANCELLED: [],
};
export const assertPayrollTransition = (from: PayrollRunStatus, to: PayrollRunStatus): void => {
  if (!PAYROLL_TRANSITIONS[from]?.includes(to))
    throw new ApiError("INVALID_STATE", `Payroll run cannot move ${from} → ${to}.`);
};
export const LEAVE_DECISION_STAGES = ["SUPERVISOR", "HR"] as const;

export class ApiError extends Error {
  code: string; details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message); this.code = code; this.details = details;
  }
}

export interface Page<T> { rows: T[]; total: number; page: number; pageSize: number; }
export interface PageQuery { page?: number; pageSize?: number; q?: string; sort?: string; dir?: "asc" | "desc"; }
