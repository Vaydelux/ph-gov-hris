/**
 * PREVIEW FIXTURE DATA — deterministic, fictional, removable.
 * Everything here is DEMO DATA: fictional agency, employees, and explicitly
 * unvalidated government contribution/tax tables (rule.demo === true).
 * Production data comes exclusively from PostgreSQL via Prisma — see README.
 */
import { addDaysISO, isWeekend, monthDays, mulberry32, prevMonth, todayISO, toCents, uid, monthLabel } from "../lib/core";
import type { DB, Department, Employee, PayrollRun, PositionRec, TaxBracket } from "../lib/contracts";
import { computePayroll, contributionCents, loanInstallmentCents, processAttendance, resolveEffectiveRule, stepSalaryCents, withholdingTaxCents } from "./engine";

const FIRST_M = ["Jose", "Andres", "Emilio", "Apolinario", "Marcelo", "Antonio", "Felipe", "Ramon", "Carlos", "Miguel", "Eduardo", "Manuel", "Ernesto", "Rodrigo", "Salvador", "Teodoro"];
const FIRST_F = ["Maria", "Clara", "Corazon", "Josefa", "Teodora", "Gregoria", "Melchora", "Imelda", "Lourdes", "Carmen", "Rosa", "Paz", "Luz", "Fe", "Esperanza", "Consuelo"];
const SURNAMES = ["Dela Cruz", "Santos", "Reyes", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Flores", "Ramos", "Aquino", "Navarro", "Villanueva", "Castillo", "Domingo", "Salazar", "Ilagan", "Vega", "Robles", "Pascual"];

export function buildSeed(): DB {
  const rng = mulberry32(20260214);
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  const randName = (g: "M" | "F") => ({
    firstName: g === "M" ? pick(FIRST_M) : pick(FIRST_F),
    lastName: pick(SURNAMES),
    gender: g,
  });

  const today = todayISO();
  const year = Number(today.slice(0, 4));

  /* ---------- org ---------- */
  const agency = { id: "ag1", code: "DCS", name: "Department of Civic Services (Demo Agency)" };
  const departments: Department[] = [
    { id: "d1", code: "ADM", name: "Administration Division" },
    { id: "d2", code: "FIN", name: "Finance Division" },
    { id: "d3", code: "HRM", name: "Human Resource Management Office" },
    { id: "d4", code: "ICT", name: "ICT Services Division" },
    { id: "d5", code: "OPS", name: "Operations Division" },
    { id: "d6", code: "RCD", name: "Records & Archives Division" },
  ];
  const mkPos = (dept: string, sg: number, code: string, title: string): PositionRec =>
    ({ id: uid("pos"), code, title, salaryGrade: sg, departmentId: dept });
  const positions: PositionRec[] = [
    mkPos("d1", 11, "ADM-01", "Administrative Officer II"), mkPos("d1", 9, "ADM-02", "Administrative Aide III"),
    mkPos("d1", 16, "ADM-03", "Chief, Administration Division"), mkPos("d1", 8, "ADM-04", "Clerk II"), mkPos("d1", 13, "ADM-05", "Executive Assistant III"),
    mkPos("d2", 15, "FIN-01", "Accountant III"), mkPos("d2", 11, "FIN-02", "Accountant I"), mkPos("d2", 18, "FIN-03", "Chief, Finance Division"),
    mkPos("d2", 9, "FIN-04", "Bookkeeper"), mkPos("d2", 12, "FIN-05", "Budget Officer II"),
    mkPos("d3", 17, "HRM-01", "HRMO Chief"), mkPos("d3", 12, "HRM-02", "HR Officer II"), mkPos("d3", 10, "HRM-03", "HR Officer I"),
    mkPos("d3", 8, "HRM-04", "Records Officer I"), mkPos("d3", 14, "HRM-05", "Personnel Management Officer III"),
    mkPos("d4", 20, "ICT-01", "Systems Administrator III"), mkPos("d4", 14, "ICT-02", "Programmer II"), mkPos("d4", 11, "ICT-03", "Computer Operator I"),
    mkPos("d4", 16, "ICT-04", "ICT Chief"), mkPos("d4", 13, "ICT-05", "Network Administrator II"),
    mkPos("d5", 18, "OPS-01", "Operations Chief"), mkPos("d5", 12, "OPS-02", "Operations Officer II"), mkPos("d5", 9, "OPS-03", "Field Investigator I"),
    mkPos("d5", 10, "OPS-04", "Liaison Officer"), mkPos("d5", 8, "OPS-05", "Field Aide"),
    mkPos("d6", 11, "RCD-01", "Archivist II"), mkPos("d6", 8, "RCD-02", "Records Clerk"), mkPos("d6", 13, "RCD-03", "Records Chief"),
    mkPos("d6", 9, "RCD-04", "Microfilm Operator"),
  ];
  const byDept: Record<string, PositionRec[]> = {};
  positions.forEach((p) => { (byDept[p.departmentId] ??= []).push(p); });
  const chiefPos = (d: string) => byDept[d].reduce((a, b) => (b.salaryGrade > a.salaryGrade ? b : a));

  /* ---------- salary schedule (Standardized Salary Schedule — DEMO) ---------- */
  const salarySchedules = [{ id: "ss1", name: "Standardized Salary Schedule (2024, demo)", effectiveFrom: "2024-01-01", note: "Demo indexation; step increment ₱2,000/month." }];
  const salaryGrades = Array.from({ length: 33 }, (_, i) => ({
    id: `sg${i + 1}`, scheduleId: "ss1", grade: i + 1,
    step1Cents: toCents(13_000 + i * 2_200),
  }));

  /* ---------- shifts & holidays ---------- */
  const shifts = [
    { id: "sh1", name: "Regular (8:00 AM – 5:00 PM)", startMin: 480, endMin: 1020, graceMin: 15, lunchMin: 60 },
    { id: "sh2", name: "Afternoon (1:00 PM – 10:00 PM)", startMin: 780, endMin: 1320, graceMin: 15, lunchMin: 60 },
  ];
  const H = (date: string, name: string, type: "REGULAR" | "SPECIAL") => ({ id: uid("hol"), date, name, type });
  const holidays = [
    H(`${year - 1}-12-25`, "Christmas Day", "REGULAR"), H(`${year - 1}-12-30`, "Rizal Day", "REGULAR"),
    H(`${year - 1}-12-31`, "Last Day of the Year", "SPECIAL"),
    H(`${year}-01-01`, "New Year's Day", "REGULAR"), H(`${year}-02-25`, "EDSA Revolution Anniversary", "REGULAR"),
    H(`${year}-04-09`, "Araw ng Kagitingan", "REGULAR"), H(`${year}-04-17`, "Maundy Thursday", "REGULAR"),
    H(`${year}-04-18`, "Good Friday", "REGULAR"), H(`${year}-05-01`, "Labor Day", "REGULAR"),
    H(`${year}-06-12`, "Independence Day", "REGULAR"), H(`${year}-08-25`, "National Heroes Day", "REGULAR"),
    H(`${year}-11-30`, "Bonifacio Day", "REGULAR"), H(`${year}-12-24`, "Christmas Eve", "SPECIAL"),
    H(`${year}-12-25`, "Christmas Day", "REGULAR"), H(`${year}-12-30`, "Rizal Day", "REGULAR"), H(`${year}-12-31`, "Last Day of the Year", "SPECIAL"),
  ];
  const holidaySet = new Set(holidays.map((h) => h.date));

  /* ---------- employees ---------- */
  const employees: Employee[] = [];
  let empSeq = 1;
  const mkEmp = (over: Partial<Employee> & { firstName: string; lastName: string; gender: "M" | "F"; positionId: string }): Employee => {
    const pos = positions.find((p) => p.id === over.positionId)!;
    const hiredYear = ri(2012, 2023);
    const e: Employee = {
      id: uid("emp"), employeeNo: `DCS-${hiredYear}-${`${empSeq++}`.padStart(4, "0")}`,
      firstName: over.firstName, lastName: over.lastName, middleName: pick(SURNAMES).slice(0, 1),
      gender: over.gender, email: `${over.firstName.toLowerCase()}.${over.lastName.toLowerCase().replace(/\s+/g, "")}@dcs.gov.ph`,
      phone: `+63 9${ri(17, 28)} ${ri(100, 999)} ${ri(1000, 9999)}`,
      departmentId: pos.departmentId, positionId: pos.id,
      salaryGrade: pos.salaryGrade, salaryStep: ri(1, 7), scheduleId: "ss1", shiftId: rng() > 0.85 ? "sh2" : "sh1",
      appointmentType: rng() > 0.15 ? "PERMANENT" : "CASUAL", status: "ACTIVE",
      hiredAt: `${hiredYear}-${`${ri(1, 12)}`.padStart(2, "0")}-${`${ri(1, 28)}`.padStart(2, "0")}`,
      birthDate: `${ri(1968, 1998)}-${`${ri(1, 12)}`.padStart(2, "0")}-${`${ri(1, 28)}`.padStart(2, "0")}`,
      address: `${ri(10, 999)} ${pick(["Mabini St.", "Rizal Ave.", "Bonifacio Rd.", "Del Pilar St.", "Taft Ave."])}, ${pick(["Quezon City", "Manila", "Makati", "Pasig", "Caloocan"])}`,
      tin: `${ri(100, 999)}-${ri(100, 999)}-${ri(100, 999)}-000`,
      gsisNo: `${ri(10000000, 99999999)}`, philhealthNo: `${ri(10, 99)}-${ri(10000000, 99999999)}-${ri(0, 9)}`, pagibigNo: `${ri(1000, 9999)}-${ri(1000, 9999)}-${ri(1000, 9999)}`,
      bankName: rng() > 0.4 ? "Land Bank of the Philippines" : "Development Bank of the Philippines",
      bankAccount: `•••• ${ri(1000, 9999)}`, avatarHue: Math.floor(rng() * 360),
    };
    Object.assign(e, over);
    employees.push(e);
    return e;
  };

  const headIds: Record<string, string> = {};
  departments.forEach((d) => {
    const name = randName(rng() > 0.5 ? "M" : "F");
    headIds[d.id] = mkEmp({ ...name, positionId: chiefPos(d.id).id, salaryStep: ri(4, 8) }).id;
  });
  const deptPlan: Array<[string, number]> = [["d1", 11], ["d2", 9], ["d3", 8], ["d4", 8], ["d5", 9], ["d6", 6]];
  for (const [dept, count] of deptPlan) {
    for (let i = 0; i < count; i++) {
      const g: "M" | "F" = rng() > 0.52 ? "M" : "F";
      const name = randName(g);
      mkEmp({ ...name, positionId: pick(byDept[dept]).id, supervisorId: headIds[dept] });
    }
  }
  const findEmp = (dept: string, sgMin: number) => employees.find((e) => e.departmentId === dept && e.salaryGrade >= sgMin && !Object.values(headIds).includes(e.id))!;
  const eVega = employees.find((e) => e.id === headIds.d5)!;
  const eNavarro = findEmp("d1", 11);
  const eSalvador = findEmp("d3", 14);
  const eBautista = findEmp("d2", 12);
  const eRamos = findEmp("d2", 9);
  const eOcampo = findEmp("d5", 9);
  const eGarcia = findEmp("d4", 13);
  const eReyes = employees.find((e) => e.id === headIds.d1)!;
  // Supervisor demo account directly supervises part of the Admin Division.
  employees.filter((e) => e.departmentId === "d1" && e.id !== eNavarro.id && e.id !== eReyes.id).slice(0, 6).forEach((e, i) => { if (i > 0) e.supervisorId = eNavarro.id; });

  /* ---------- users (preview identities; Supabase Auth in production) ---------- */
  const mkUser = (id: string, email: string, fullName: string, role: DB["users"][number]["role"], employeeId?: string) =>
    ({ id, email, password: "hris2025", fullName, role, employeeId, active: true, lastLoginAt: new Date().toISOString() });
  const users: DB["users"] = [
    mkUser("u_admin", "admin@hris.gov.ph", "Atty. Bianca Salvador", "ADMINISTRATOR"),
    mkUser("u_hr", "hr@hris.gov.ph", "Corazon Vega", "HR_OFFICER", eSalvador.id),
    mkUser("u_payroll", "payroll@hris.gov.ph", "Cesar Bautista", "PAYROLL_OFFICER", eBautista.id),
    mkUser("u_acct", "accounting@hris.gov.ph", "Divina Ramos", "ACCOUNTING", eRamos.id),
    mkUser("u_head", "head@hris.gov.ph", "Corazon Vega-Head", "DEPARTMENT_HEAD", eVega.id),
    mkUser("u_sup", "supervisor@hris.gov.ph", "Edgar Navarro", "SUPERVISOR", eNavarro.id),
    mkUser("u_emp", "employee@hris.gov.ph", "Alonzo Ocampo", "EMPLOYEE", eOcampo.id),
    mkUser("u_hire", "hiring@hris.gov.ph", "Fernando Garcia", "HIRING_MANAGER", eGarcia.id),
    mkUser("u_admin2", "sysadmin@hris.gov.ph", "Ramon Ilagan", "SYSTEM_ADMIN"),
  ];
  Object.assign(eVega, { userId: "u_head" }); Object.assign(eNavarro, { userId: "u_sup" });
  Object.assign(eSalvador, { userId: "u_hr" }); Object.assign(eBautista, { userId: "u_payroll" });
  Object.assign(eRamos, { userId: "u_acct" }); Object.assign(eOcampo, { userId: "u_emp" });
  Object.assign(eGarcia, { userId: "u_hire" });
  departments.forEach((d, i) => { d.headEmployeeId = headIds[d.id]; void i; });

  /* ---------- biometric devices ---------- */
  const devices = [
    { id: "dv1", name: "Main Lobby Fingerprint", model: "GenericBio T-400 (adapter: ZK)", location: "Lobby, G/F", lastSyncAt: new Date().toISOString() },
    { id: "dv2", name: "ICT Door — Face Terminal", model: "GenericBio F-210 (adapter: Face)", location: "3/F ICT Wing", lastSyncAt: new Date().toISOString() },
  ];

  /* ---------- attendance (~45 days history + partial today) ---------- */
  const attendance: DB["attendance"] = [];
  const rawLogs: DB["rawLogs"] = [];
  const shift1 = shifts[0];
  const dayNum = Number(today.slice(8, 10));
  const inCount = Math.max(10, Math.round(employees.length * Math.min(1, dayNum / 12)));
  employees.forEach((emp, idx) => {
    for (let back = 45; back >= 0; back--) {
      const date = addDaysISO(today, -back);
      if (isWeekend(date)) continue;
      if (holidaySet.has(date)) { attendance.push({ id: uid("att"), employeeId: emp.id, date, totalMin: 0, lateMin: 0, undertimeMin: 0, otMin: 0, status: "HOLIDAY", finalized: true, source: "DEVICE" }); continue; }
      const roll = rng();
      if (back === 0) {
        if (idx < inCount) {
          const clockIn = 450 + ri(-15, 70);
          attendance.push({ id: uid("att"), employeeId: emp.id, date, clockIn, totalMin: 0, lateMin: Math.max(0, clockIn - (shift1.startMin + shift1.graceMin)), undertimeMin: 0, otMin: 0, status: "INCOMPLETE", finalized: false, source: "DEVICE" });
          rawLogs.push({ id: uid("raw"), deviceId: rng() > 0.5 ? "dv1" : "dv2", employeeNo: emp.employeeNo, at: `${date}T${`${Math.floor(clockIn / 60)}`.padStart(2, "0")}:${`${clockIn % 60}`.padStart(2, "0")}:00`, source: "BIOMETRIC" });
        }
        continue;
      }
      if (roll < 0.04) { attendance.push({ id: uid("att"), employeeId: emp.id, date, totalMin: 0, lateMin: 0, undertimeMin: 0, otMin: 0, status: "ABSENT", finalized: true, source: "DEVICE" }); continue; }
      if (roll < 0.06) { attendance.push({ id: uid("att"), employeeId: emp.id, date, totalMin: 0, lateMin: 0, undertimeMin: 0, otMin: 0, status: "ON_LEAVE", finalized: true, source: "MANUAL", note: "Approved leave" }); continue; }
      if (roll < 0.08) {
        const ci = 450 + ri(-10, 80);
        attendance.push({ id: uid("att"), employeeId: emp.id, date, clockIn: ci, totalMin: 0, lateMin: Math.max(0, ci - 495), undertimeMin: 0, otMin: 0, status: "INCOMPLETE", finalized: false, source: "DEVICE" });
        continue;
      }
      const clockIn = 450 + ri(-20, 65);
      const clockOut = 1020 + ri(-45, 95);
      const comp = processAttendance({ clockIn, clockOut, shift: shift1, isHoliday: false, isRestDay: false });
      attendance.push({ id: uid("att"), employeeId: emp.id, date, clockIn, clockOut, ...comp, finalized: true, source: "DEVICE" });
      if (back <= 3) {
        rawLogs.push({ id: uid("raw"), deviceId: "dv1", employeeNo: emp.employeeNo, at: `${date}T${`${Math.floor(clockIn / 60)}`.padStart(2, "0")}:${`${clockIn % 60}`.padStart(2, "0")}:00`, source: "BIOMETRIC" });
        rawLogs.push({ id: uid("raw"), deviceId: "dv1", employeeNo: emp.employeeNo, at: `${date}T${`${Math.floor(clockOut / 60)}`.padStart(2, "0")}:${`${clockOut % 60}`.padStart(2, "0")}:00`, source: "BIOMETRIC" });
      }
    }
  });
  const imports = [
    { id: uid("imp"), deviceId: "dv1", fileName: `dtr_export_${addDaysISO(today, -1)}.csv`, records: 46, duplicates: 3, importedBy: "u_payroll", at: new Date().toISOString() },
    { id: uid("imp"), deviceId: "dv2", fileName: `face_logs_${addDaysISO(today, -2)}.csv`, records: 21, duplicates: 1, importedBy: "u_payroll", at: new Date().toISOString() },
  ];
  const adjustments: DB["adjustments"] = [
    { id: uid("adj"), employeeId: eOcampo.id, date: addDaysISO(today, -3), kind: "CLOCK_OUT", oldValue: "—", newValue: "17:32", reason: "Fingerprint sensor failed to capture PM-out; security logbook attached.", status: "PENDING", requestedBy: "u_emp", createdAt: new Date().toISOString() },
    { id: uid("adj"), employeeId: employees[6]?.id ?? eNavarro.id, date: addDaysISO(today, -6), kind: "CLOCK_IN", oldValue: "8:41 AM", newValue: "7:58 AM", reason: "Official business — filed before roving inspection.", status: "APPROVED", requestedBy: "u_sup", approvedBy: "u_hr", decidedAt: new Date().toISOString(), createdAt: addDaysISO(today, -5) + "T09:12:00" },
  ];

  /* ---------- leave ---------- */
  const leaveTypes: DB["leaveTypes"] = [
    { id: "lt_vl", code: "VL", name: "Vacation Leave", annualDays: 15, requiresDoc: false, color: "#2170e4" },
    { id: "lt_sl", code: "SL", name: "Sick Leave", annualDays: 15, requiresDoc: true, color: "#c9a227" },
    { id: "lt_el", code: "EL", name: "Emergency Leave", annualDays: 5, requiresDoc: false, color: "#b3541e" },
    { id: "lt_ml", code: "ML", name: "Mandatory Leave", annualDays: 5, requiresDoc: false, color: "#0f766e" },
  ];
  const leaveLedger: DB["leaveLedger"] = [];
  const at = new Date().toISOString();
  employees.forEach((emp) => {
    leaveTypes.forEach((lt) => {
      leaveLedger.push({ id: uid("ll"), employeeId: emp.id, leaveTypeId: lt.id, type: "CREDIT", daysH: lt.annualDays * 100, refType: "SYSTEM", memo: `${year} annual credit — ${lt.code}`, at, actorId: "system" });
    });
  });
  const leaveRequests: DB["leaveRequests"] = [];
  const mkLeave = (empId: string, typeId: string, startOff: number, days: number, status: DB["leaveRequests"][number]["status"], reason: string) => {
    const start = addDaysISO(today, startOff);
    const end = addDaysISO(start, days - 1);
    const req: DB["leaveRequests"][number] = {
      id: uid("lr"), employeeId: empId, leaveTypeId: typeId, startDate: start, endDate: end, workingDays: days,
      reason, status, filedAt: addDaysISO(today, startOff - 4) + "T10:15:00", approvals: [], docName: typeId === "lt_sl" ? "medical_certificate.pdf" : undefined,
    };
    if (status !== "PENDING_SUPERVISOR") req.approvals.push({ stage: "SUPERVISOR", actorId: "u_sup", actorName: "Edgar Navarro", action: status === "REJECTED" && rng() > 0.5 ? "REJECT" : "APPROVE", at: req.filedAt, note: "Team coverage arranged." });
    if (status === "APPROVED") {
      req.approvals.push({ stage: "HR", actorId: "u_hr", actorName: "Corazon Vega", action: "APPROVE", at: req.filedAt });
      leaveLedger.push({ id: uid("ll"), employeeId: empId, leaveTypeId: typeId, type: "DEBIT", daysH: days * 100, refType: "REQUEST", refId: req.id, memo: `Approved ${start} → ${end}`, at: req.filedAt, actorId: "u_hr" });
    }
    if (status === "REJECTED") req.rejectionNote = "Insufficient supporting document.";
    leaveRequests.push(req);
    return req;
  };
  employees.filter((e) => e.supervisorId === eNavarro.id).slice(0, 3).forEach((e) => mkLeave(e.id, "lt_vl", ri(4, 12), ri(1, 3), "PENDING_SUPERVISOR", "Family matter — advance filing."));
  mkLeave(eOcampo.id, "lt_vl", 9, 3, "PENDING_SUPERVISOR", "Provincial travel for family reunion.");
  mkLeave(eOcampo.id, "lt_sl", -12, 2, "APPROVED", "Acute bronchitis; medical certificate attached.");
  mkLeave(employees[3].id, "lt_vl", -20, 5, "APPROVED", "Annual mandatory leave.");
  mkLeave(employees[5].id, "lt_el", -6, 1, "APPROVED", "Emergency — typhoon damage at residence.");
  mkLeave(employees[8].id, "lt_vl", -30, 4, "REJECTED", "Personal travel.");
  mkLeave(employees[10].id, "lt_vl", 3, 2, "PENDING_HR", "Wedding anniversary trip.");
  mkLeave(employees[12].id, "lt_ml", -9, 5, "APPROVED", "Mandatory leave compliance.");

  /* ---------- government deduction schemes (DEMO — not legally validated) ---------- */
  const schemes: DB["schemes"] = [
    { id: "sch_gsis", code: "GSIS", name: "GSIS Life & Retirement", description: "Government Service Insurance System premium — employee + government share." },
    { id: "sch_ph", code: "PHILHEALTH", name: "PhilHealth", description: "National health insurance contribution, capped monthly basis." },
    { id: "sch_pi", code: "PAGIBIG", name: "Pag-IBIG Fund", description: "HDMF savings contribution, capped monthly basis." },
    { id: "sch_wtax", code: "WTAX", name: "Withholding Tax", description: "Compensation income tax — semi-monthly TRAIN brackets (excess-over method)." },
  ];
  const contributionRules: DB["contributionRules"] = [
    { id: "cr_g1", schemeId: "sch_gsis", effectiveFrom: "2023-01-01", employeeBps: 875, employerBps: 1175, note: "GSIS demo table (superseded)", demo: true },
    { id: "cr_g2", schemeId: "sch_gsis", effectiveFrom: "2024-01-01", employeeBps: 900, employerBps: 1250, note: "GSIS demo table — 9% / 12.5%", demo: true },
    { id: "cr_p1", schemeId: "sch_ph", effectiveFrom: "2024-01-01", employeeBps: 250, monthlyCapCents: 10_000_000, note: "PhilHealth demo table — 5% split, ₱100k cap", demo: true },
    { id: "cr_h1", schemeId: "sch_pi", effectiveFrom: "2024-01-01", employeeBps: 200, monthlyCapCents: 1_000_000, note: "Pag-IBIG demo table — 2%, ₱10k cap", demo: true },
    { id: "cr_t1", schemeId: "sch_wtax", effectiveFrom: "2024-01-01", note: "TRAIN semi-monthly demo brackets", demo: true },
  ];
  const B = (from: number, to: number | null, base: number, rate: number): TaxBracket =>
    ({ id: uid("tb"), ruleId: "cr_t1", fromCents: toCents(from), toCents: to == null ? null : toCents(to), baseCents: toCents(base), rateBps: rate });
  const taxBrackets: TaxBracket[] = [
    B(0, 20833, 0, 0), B(20833, 33333, 0, 1500), B(33333, 66667, 1875, 2000),
    B(66667, 166667, 8333.33, 2500), B(166667, 666667, 33333.33, 3000), B(666667, null, 183333.33, 3500),
  ];

  /* ---------- allowances ---------- */
  const allowanceTypes: DB["allowanceTypes"] = [
    { id: "al_pera", code: "PERA", name: "Personnel Economic Relief Allowance", monthlyCents: 200_000, taxable: false, active: true },
    { id: "al_rice", code: "RICE", name: "Rice Subsidy", monthlyCents: 200_000, taxable: false, active: true },
    { id: "al_clothing", code: "CLOTH", name: "Clothing Allowance (amortized)", monthlyCents: 50_000, taxable: false, active: true },
    { id: "al_hazard", code: "HZD", name: "Hazard Pay", monthlyCents: 300_000, taxable: true, active: true },
    { id: "al_comm", code: "COMM", name: "Communication Allowance", monthlyCents: 30_000, taxable: true, active: true },
  ];
  const employeeAllowances: DB["employeeAllowances"] = [];
  employees.forEach((e) => {
    employeeAllowances.push({ id: uid("ea"), employeeId: e.id, allowanceTypeId: "al_pera", monthlyCents: 200_000, effectiveFrom: "2024-01-01", active: true, grantedBy: "u_admin" });
    employeeAllowances.push({ id: uid("ea"), employeeId: e.id, allowanceTypeId: "al_rice", monthlyCents: 200_000, effectiveFrom: "2024-01-01", active: true, grantedBy: "u_admin" });
    if (e.departmentId === "d5" || e.departmentId === "d4") employeeAllowances.push({ id: uid("ea"), employeeId: e.id, allowanceTypeId: "al_hazard", monthlyCents: 300_000, effectiveFrom: "2024-07-01", active: true, grantedBy: "u_admin" });
    if (e.salaryGrade >= 13) employeeAllowances.push({ id: uid("ea"), employeeId: e.id, allowanceTypeId: "al_comm", monthlyCents: 30_000, effectiveFrom: "2024-01-01", active: true, grantedBy: "u_admin" });
  });

  /* ---------- loans ---------- */
  const loanTypes: DB["loanTypes"] = [
    { id: "ln_gsis", code: "GSIS-PL", name: "GSIS Personal Loan", maxAmountCents: 500_000_00, maxTermMonths: 36 },
    { id: "ln_pi", code: "HDMF-MPL", name: "Pag-IBIG Multi-Purpose Loan", maxAmountCents: 300_000_00, maxTermMonths: 24 },
    { id: "ln_sal", code: "SAL", name: "Agency Salary Loan", maxAmountCents: 200_000_00, maxTermMonths: 36 },
    { id: "ln_em", code: "EMG", name: "Emergency Loan", maxAmountCents: 100_000_00, maxTermMonths: 24 },
  ];
  const loans: DB["loans"] = [];
  const loanLedger: DB["loanLedger"] = [];
  const loanSchedules: DB["loanSchedules"] = [];
  const mkLoan = (empId: string, typeId: string, amountPHP: number, term: number, status: DB["loans"][number]["status"], paidCuts: number, refRun?: string) => {
    const principal = toCents(amountPHP);
    const inst = loanInstallmentCents(principal, term);
    const loan: DB["loans"][number] = {
      id: uid("loan"), refNo: `${loanTypes.find((t) => t.id === typeId)!.code}-${ri(10000, 99999)}`,
      employeeId: empId, loanTypeId: typeId, appliedAmountCents: principal, approvedAmountCents: status === "SUBMITTED" || status === "UNDER_REVIEW" ? undefined : principal,
      termMonths: term, installmentCents: inst, balanceCents: principal - inst * paidCuts,
      status, appliedAt: addDaysISO(today, -90) + "T09:00:00",
      decidedAt: status === "ACTIVE" || status === "PAID" ? addDaysISO(today, -85) + "T14:30:00" : undefined, decidedBy: "u_payroll",
    };
    loans.push(loan);
    if (loan.approvedAmountCents) {
      loanLedger.push({ id: uid("llg"), loanId: loan.id, type: "DISBURSEMENT", amountCents: principal, refType: "SYSTEM", memo: "Loan proceeds disbursed via payroll credit", at: addDaysISO(today, -85) + "T15:00:00", actorId: "u_payroll" });
      for (let s = 1; s <= term; s++) {
        loanSchedules.push({
          id: uid("ls"), loanId: loan.id, seq: s, dueLabel: `Installment ${s} of ${term}`, amountCents: inst,
          paidAt: s <= paidCuts ? addDaysISO(today, -85 + s * 15) + "T00:00:00" : undefined,
          paidVia: s <= paidCuts ? `Payroll — ${monthLabel(prevMonth(today.slice(0, 7)))}` : undefined,
        });
      }
      for (let s = 1; s <= paidCuts; s++) loanLedger.push({ id: uid("llg"), loanId: loan.id, type: "PAYROLL_PAYMENT", amountCents: inst, refType: "PAYROLL_RUN", refId: refRun ?? "r_prev", memo: "Amortization deduction", at: addDaysISO(today, -85 + s * 15) + "T00:00:00", actorId: "system" });
    }
    return loan;
  };
  mkLoan(eOcampo.id, "ln_sal", 80_000, 24, "ACTIVE", 6, "r_prev");
  mkLoan(eNavarro.id, "ln_gsis", 200_000, 36, "ACTIVE", 10, "r_prev");
  mkLoan(eSalvador.id, "ln_pi", 60_000, 24, "ACTIVE", 4, "r_prev");
  mkLoan(employees[4].id, "ln_gsis", 150_000, 36, "PAID", 0);
  mkLoan(employees[7].id, "ln_em", 40_000, 12, "SUBMITTED", 0);
  mkLoan(employees[9].id, "ln_sal", 90_000, 24, "UNDER_REVIEW", 0);
  // fix PAID loan: simulate fully repaid history
  loans[3].balanceCents = 0; loans[3].installmentCents = loanInstallmentCents(toCents(150_000), 36);

  /* ---------- payroll: two historical RELEASED runs computed by the real engine ---------- */
  const ym = today.slice(0, 7);
  const prevYM = prevMonth(ym);
  const prev2YM = prevMonth(prevYM);
  const periodLabel = (m: string, half: 1 | 2) => {
    const lbl = monthLabel(m);
    return half === 1 ? `${lbl.split(" ")[0]} 1–15, ${lbl.split(" ")[1]}` : `${lbl.split(" ")[0]} 16–31, ${lbl.split(" ")[1]}`;
  };
  const daysInMonth = (m: string) => monthDays(m).length;
  const periods: DB["periods"] = [
    { id: "p_prev2", label: periodLabel(prev2YM, 2), from: `${prev2YM}-16`, to: `${prev2YM}-${daysInMonth(prev2YM)}`, cutoff: `${prev2YM}-26`, closed: true },
    { id: "p_prev", label: periodLabel(prevYM, 1), from: `${prevYM}-01`, to: `${prevYM}-15`, cutoff: `${prevYM}-10`, closed: true },
    { id: "p_cur", label: Number(today.slice(8, 10)) <= 15 ? periodLabel(ym, 1) : periodLabel(ym, 2), from: Number(today.slice(8, 10)) <= 15 ? `${ym}-01` : `${ym}-16`, to: Number(today.slice(8, 10)) <= 15 ? `${ym}-15` : `${ym}-${daysInMonth(ym)}`, cutoff: Number(today.slice(8, 10)) <= 15 ? `${ym}-10` : `${ym}-25`, closed: false },
  ];
  const runs: PayrollRun[] = [];
  const employeePayrolls: DB["employeePayrolls"] = [];
  const payslips: DB["payslips"] = [];
  let slipSeq = 1;
  const computeRun = (runId: string, periodId: string, releasedAgo: number) => {
    const period = periods.find((p) => p.id === periodId)!;
    const gsisRule = resolveEffectiveRule(contributionRules.filter((r) => r.schemeId === "sch_gsis"), period.to)!;
    const phRule = resolveEffectiveRule(contributionRules.filter((r) => r.schemeId === "sch_ph"), period.to)!;
    const piRule = resolveEffectiveRule(contributionRules.filter((r) => r.schemeId === "sch_pi"), period.to)!;
    const employeesNow = employees;
    let gross = 0, ded = 0, net = 0;
    const releasedAt = addDaysISO(period.to, 3) + "T16:00:00";
    for (const emp of employeesNow) {
      const monthly = stepSalaryCents(salaryGrades.find((g) => g.grade === emp.salaryGrade)!.step1Cents, emp.salaryStep);
      const lines = employeeAllowances.filter((a) => a.employeeId === emp.id && a.active && a.effectiveFrom <= period.to)
        .map((a) => ({ label: allowanceTypes.find((t) => t.id === a.allowanceTypeId)!.name, cents: Math.round(a.monthlyCents / 2) }));
      const att = attendance.filter((a) => a.employeeId === emp.id && a.date >= period.from && a.date <= period.to);
      const snap = {
        present: att.filter((a) => ["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME"].includes(a.status)).length,
        lateDays: att.filter((a) => a.lateMin > 0).length,
        absent: att.filter((a) => a.status === "ABSENT").length,
        otMin: att.reduce((s, a) => s + a.otMin, 0),
        lateMin: att.reduce((s, a) => s + a.lateMin, 0),
        utMin: att.reduce((s, a) => s + a.undertimeMin, 0),
      };
      const loan = loans.find((l) => l.employeeId === emp.id && l.status === "ACTIVE");
      const res = computePayroll({
        monthlyBasicCents: monthly, allowanceLines: lines, otMin: snap.otMin, lateMin: snap.lateMin, utMin: snap.utMin,
        gsisRule, philhealthRule: phRule, pagibigRule: piRule, taxBrackets,
        loanInstallmentCents: loan ? loan.installmentCents : 0, attendanceSnapshot: snap,
      });
      const epId = uid("ep");
      gross += res.grossCents; ded += res.totalDeductCents; net += res.netCents;
      employeePayrolls.push({
        id: epId, runId, employeeId: emp.id,
        snapshot: { fullName: `${emp.firstName} ${emp.lastName}`, position: positions.find((p) => p.id === emp.positionId)!.title, department: departments.find((d) => d.id === emp.departmentId)!.name, grade: emp.salaryGrade, step: emp.salaryStep, scheduleName: salarySchedules[0].name, employeeNo: emp.employeeNo },
        ...res, attendanceSnapshot: snap,
      });
      if (runId === "r_prev") payslips.push({ id: uid("ps"), number: `${period.to.slice(0, 7).replace("-", "")}-${`${slipSeq++}`.padStart(4, "0")}`, employeePayrollId: epId, employeeId: emp.id, runId, releasedAt });
      if (loan && runId === "r_prev" && res.loanCents > 0) loanLedger.push({ id: uid("llg"), loanId: loan.id, type: "PAYROLL_PAYMENT", amountCents: res.loanCents, refType: "PAYROLL_RUN", refId: runId, memo: `Amortization — ${period.label}`, at: releasedAt, actorId: "system" });
    }
    runs.push({
      id: runId, periodId, status: "RELEASED", progress: 100, stage: "Released",
      log: ["Queued for worker", "Resolved eligible employees", "Snapshot compensation (SSL 2024)", "Computed earnings/OT", "Resolved government rules", "Computed deductions", "Validated totals", "Persisted immutable details", "Released"],
      createdBy: "u_payroll", verifiedBy: "u_acct", approvedBy: "u_head", releasedBy: "u_admin",
      createdAt: addDaysISO(period.to, 1) + "T08:00:00", verifiedAt: addDaysISO(period.to, 2) + "T10:00:00",
      approvedAt: addDaysISO(period.to, 2) + "T15:00:00", releasedAt,
      employeeCount: employeesNow.length, grossCents: gross, deductionsCents: ded, netCents: net,
      idempotencyKey: `run:${periodId}`,
    });
  };
  computeRun("r_prev2", "p_prev2", 35);
  computeRun("r_prev", "p_prev", 18);

  /* ---------- recruitment ---------- */
  const mkJob = (slug: string, title: string, dept: string, sg: number, status: DB["jobs"][number]["status"], postedAgo: number, deadlineIn: number, keywords: string[], quals: string[], openings = 1): DB["jobs"][number] => ({
    id: uid("job"), slug, title, departmentId: dept, positionTitle: title, salaryGrade: sg,
    employmentType: "Permanent — Plantilla", workLocation: "Central Office, Quezon City",
    summary: `The ${departments.find((d) => d.id === dept)!.name} is accepting applications for ${title} (Salary Grade ${sg}). Qualified applicants with the required eligibility and experience are encouraged to apply.`,
    responsibilities: ["Perform duties aligned with the agency mandate.", "Prepare required reports and certifications.", "Undertake related functions as directed by the Division Chief."],
    qualifications: quals, keywords, postedAt: addDaysISO(today, -postedAgo), deadline: addDaysISO(today, deadlineIn), status, openings,
  });
  const jobs: DB["jobs"] = [
    mkJob("data-analyst-ict", "Data Analyst (ICT Services)", "d4", 11, "OPEN", 12, 21, ["sql", "excel", "analytics", "dashboard", "statistics"], ["CSRA/RA 1080 preferred", "2 years data handling experience", "Proficiency in SQL and Excel"]),
    mkJob("hr-officer-1", "Human Resource Officer I", "d3", 11, "OPEN", 8, 30, ["hris", "recruitment", "201 file", "leave administration"], ["Civil Service Professional eligibility", "1 year HR experience"]),
    mkJob("systems-administrator-3", "Systems Administrator III", "d4", 20, "OPEN", 15, 10, ["linux", "postgresql", "docker", "network", "security"], ["RA 1080 or equivalent", "5 years systems administration", "Experience with PostgreSQL & containers"]),
    mkJob("accountant-1", "Accountant I", "d2", 11, "OPEN", 5, 25, ["accounting", "coa", "reconciliation", "ifs"], ["CPA license", "Knowledge of government accounting (COA)"]),
    mkJob("administrative-officer-2", "Administrative Officer II", "d1", 11, "OPEN", 3, 28, ["records", "correspondence", "procurement"], ["Civil Service Professional eligibility"]),
    mkJob("records-clerk", "Records Clerk", "d6", 8, "CLOSED", 60, -20, ["filing", "digitization"], ["Civil Service Sub-Professional"]),
    mkJob("field-investigator", "Field Investigator I", "d5", 9, "CLOSED", 75, -30, ["investigation", "reports"], ["Driver's license; willing to travel"]),
  ];
  const applicants: DB["applicants"] = Array.from({ length: 12 }, (_, i) => {
    const g: "M" | "F" = i % 2 === 0 ? "F" : "M";
    const n = randName(g);
    return { id: `ap_${i + 1}`, fullName: `${n.firstName} ${n.lastName}`, email: `${n.firstName.toLowerCase()}.${n.lastName.toLowerCase().replace(/\s+/g, "")}@mail.ph`, phone: `+63 9${ri(17, 28)} ${ri(100, 999)} ${ri(1000, 9999)}`, password: "applicant", createdAt: addDaysISO(today, -ri(2, 40)) };
  });
  applicants[0] = { ...applicants[0], fullName: "Patricia Lim", email: "patricia.lim@gmail.com" };
  const STATUSES: DB["applications"][number]["status"][] = ["NEW", "NEW", "NEW", "UNDER_REVIEW", "UNDER_REVIEW", "SHORTLISTED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEWED", "FOR_FINAL_REVIEW", "HIRED", "REJECTED"];
  const applications: DB["applications"] = applicants.map((a, i) => {
    const job = jobs[i % 5];
    const status = STATUSES[i];
    const history: DB["applications"][number]["history"] = [{ status: "NEW", at: a.createdAt, by: "Applicant Portal" }];
    const order: DB["applications"][number]["status"][] = ["NEW", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEWED", "FOR_FINAL_REVIEW", "HIRED"];
    const upto = Math.min(order.indexOf(status === "REJECTED" ? "UNDER_REVIEW" : status), 6);
    for (let s = 1; s <= upto; s++) history.push({ status: order[s], at: addDaysISO(a.createdAt, s * 3) + "T11:00:00", by: "Fernando Garcia" });
    if (status === "REJECTED") history.push({ status: "REJECTED", at: addDaysISO(a.createdAt, 8) + "T11:00:00", by: "Fernando Garcia", note: "Missing eligibility documents." });
    const resume = `Experienced professional. Skills: ${job.keywords.join(", ")}, communication, public service, MS Office. ${i % 3 === 0 ? "Held government-adjacent contract roles." : "Private sector background."}`;
    return {
      id: `app_${i + 1}`, jobPostingId: job.id, applicantId: a.id, status,
      matchScore: Math.min(97, 40 + job.keywords.length * 7 + (i % 4) * 6),
      coverLetter: `I am writing to express my interest in the ${job.title} position…`, resumeText: resume,
      docName: `resume_${a.fullName.split(" ").pop()?.toLowerCase()}.pdf`, appliedAt: a.createdAt,
      tags: i % 5 === 0 ? ["Priority"] : [], history,
    };
  });
  const evaluations: DB["evaluations"] = [
    { id: uid("ev"), applicationId: "app_9", authorName: "Fernando Garcia", rating: 4, note: "Strong technical screening; verify certifications.", at: addDaysISO(today, -6) },
    { id: uid("ev"), applicationId: "app_10", authorName: "Corazon Vega", rating: 5, note: "Excellent fit for final review.", at: addDaysISO(today, -3) },
  ];
  const interviews: DB["interviews"] = [
    { id: uid("iv"), applicationId: "app_8", scheduledAt: addDaysISO(today, 3) + "T14:00:00", mode: "ONSITE", location: "HRMO Conference Room", participants: ["Fernando Garcia", "HRMO Chief"] },
    { id: uid("iv"), applicationId: "app_9", scheduledAt: addDaysISO(today, -2) + "T10:00:00", mode: "ONLINE", participants: ["Fernando Garcia"] },
  ];

  /* ---------- notifications / audit / reports / settings ---------- */
  const notifications: DB["notifications"] = [
    { id: uid("ntf"), userId: "u_emp", type: "PAYROLL", title: "Payslip released", body: `Your payslip for ${periods[1].label} is available.`, read: false, createdAt: new Date().toISOString(), link: "/payslips" },
    { id: uid("ntf"), userId: "u_emp", type: "LEAVE", title: "Leave approved", body: "Your sick leave was approved by HR.", read: true, createdAt: addDaysISO(today, -10) + "T09:00:00", link: "/leave" },
    { id: uid("ntf"), userId: "u_sup", type: "LEAVE", title: "Leave awaiting your approval", body: "3 requests from your team need review.", read: false, createdAt: new Date().toISOString(), link: "/leave" },
    { id: uid("ntf"), userId: "u_payroll", type: "LOAN", title: "Loan application submitted", body: "Emergency Loan application queued for review.", read: false, createdAt: new Date().toISOString(), link: "/loans" },
    { id: uid("ntf"), userId: "u_admin", type: "PAYROLL", title: "Payroll verification queue", body: `${periods[1].label} run was verified by Accounting.`, read: true, createdAt: addDaysISO(today, -16) + "T10:00:00", link: "/payroll" },
    { id: uid("ntf"), userId: "u_hr", type: "RECRUITMENT", title: "New applications", body: "3 new applications for HR Officer I.", read: false, createdAt: new Date().toISOString(), link: "/recruitment" },
  ];
  const audit: DB["audit"] = [
    { id: uid("aud"), actorId: "u_admin", actorName: "Atty. Bianca Salvador", action: "payroll.release", entity: "PayrollRun", entityId: "r_prev", before: { status: "APPROVED" }, after: { status: "RELEASED" }, requestId: "req_seed_1", at: runs[1].releasedAt! },
    { id: uid("aud"), actorId: "u_head", actorName: "Corazon Vega-Head", action: "payroll.approve", entity: "PayrollRun", entityId: "r_prev", before: { status: "VERIFIED" }, after: { status: "APPROVED" }, requestId: "req_seed_2", at: runs[1].approvedAt! },
    { id: uid("aud"), actorId: "u_acct", actorName: "Divina Ramos", action: "payroll.verify", entity: "PayrollRun", entityId: "r_prev", before: { status: "COMPUTED" }, after: { status: "VERIFIED" }, requestId: "req_seed_3", at: runs[1].verifiedAt! },
    { id: uid("aud"), actorId: "u_payroll", actorName: "Cesar Bautista", action: "payroll.generate", entity: "PayrollRun", entityId: "r_prev", before: null, after: { status: "COMPUTED", employees: employees.length }, requestId: "req_seed_4", at: runs[1].createdAt },
    { id: uid("aud"), actorId: "u_hr", actorName: "Corazon Vega", action: "leave.approve", entity: "LeaveRequest", entityId: leaveRequests[4]?.id ?? "—", before: { status: "PENDING_HR" }, after: { status: "APPROVED" }, requestId: "req_seed_5", at: addDaysISO(today, -11) + "T13:00:00" },
    { id: uid("aud"), actorId: "u_admin", actorName: "Atty. Bianca Salvador", action: "deduction.rule_added", entity: "ContributionRule", entityId: "cr_g2", before: null, after: { scheme: "GSIS", effectiveFrom: "2024-01-01" }, requestId: "req_seed_6", at: "2024-01-05T09:00:00" },
    { id: uid("aud"), actorId: "u_payroll", actorName: "Cesar Bautista", action: "loan.approve", entity: "EmployeeLoan", entityId: loans[0].refNo, before: { status: "UNDER_REVIEW" }, after: { status: "ACTIVE" }, requestId: "req_seed_7", at: addDaysISO(today, -85) + "T14:30:00" },
    { id: uid("aud"), actorId: "u_admin2", actorName: "Ramon Ilagan", action: "user.role_change", entity: "UserProfile", entityId: "u_hire", before: { role: "EMPLOYEE" }, after: { role: "HIRING_MANAGER" }, requestId: "req_seed_8", at: addDaysISO(today, -50) + "T11:00:00" },
  ];
  const reports: DB["reports"] = [
    { id: uid("rep"), type: "DTR", paramsLabel: "Ocampo, Alonzo — current month", status: "DONE", progress: 100, requestedBy: "u_emp", fileId: "file_dtr", createdAt: addDaysISO(today, -2) + "T08:30:00", completedAt: addDaysISO(today, -2) + "T08:31:00" },
  ];
  const files: DB["files"] = [{ id: "file_dtr", name: `dtr_${ym}.csv`, mime: "text/csv", content: "Date,AM In,PM Out,Hours,Status\n(generated preview file)", createdAt: addDaysISO(today, -2) + "T08:31:00", sizeKb: 4 }];
  const settings: DB["settings"] = [
    { key: "agency_name", value: agency.name },
    { key: "payroll_cutoff_rule", value: "1st–15th / 16th–end, semi-monthly" },
    { key: "grace_period_minutes", value: "15" },
    { key: "overtime_threshold_minutes", value: "60 after shift end" },
    { key: "retention_audit_days", value: "3650" },
    { key: "demo_notice", value: "All government contribution/tax tables are DEMO configuration." },
  ];

  void contributionCents; void withholdingTaxCents; void employees.length;
  return {
    version: 1, agency, users, departments, positions, salarySchedules, salaryGrades, shifts, holidays,
    employees, devices, rawLogs, imports, attendance, adjustments, leaveTypes, leaveLedger, leaveRequests,
    schemes, contributionRules, taxBrackets, allowanceTypes, employeeAllowances, loanTypes, loans, loanLedger, loanSchedules,
    periods, runs, employeePayrolls, payslips, notifications, audit, jobs, applicants, applications, evaluations, interviews,
    reports, files, settings,
  };
}
