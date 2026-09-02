import { Activity, Bell, Building2, CalendarDays, CheckCircle2, Database, Download, FileBarChart, Globe, KeyRound, Plus, ScrollText, Server, ShieldCheck, Trash2, Users, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import { config } from "../lib/config";
import { downloadText, fmtDateMed, fmtDateTime, num, php, titleCase, todayISO } from "../lib/core";
import type { ReportType, Role } from "../lib/contracts";
import { roleMatrix } from "../server/rbac";
import { resetDB } from "../server/db";
import { useApi, useApp } from "../state/store";
import { Button, Card, ConfirmDialog, DataTable, Field, Input, InfoNote, KPI, Modal, PageHeader, Pager, ProgressBar, SearchInput, Select, SectionLabel, StatusChip, Tag, type Col } from "../components/ui";

/* ================= REPORTS ================= */
const REPORT_TYPES: Array<{ type: ReportType; label: string; desc: string }> = [
  { type: "DTR", label: "Daily Time Record", desc: "CS Form 48-style monthly DTR for one employee" },
  { type: "ATTENDANCE_SUMMARY", label: "Attendance Summary", desc: "Presence, lates, undertime and OT per employee" },
  { type: "PAYROLL_REGISTER", label: "Payroll Register", desc: "Full register of a payroll run (earnings & deductions)" },
  { type: "REMITTANCE", label: "Remittance Report", desc: "GSIS / PhilHealth / Pag-IBIG / WTax remittances" },
  { type: "EMPLOYEE_LIST", label: "Employee List", desc: "Master list with positions, SG-step and status" },
  { type: "LEAVE_REPORT", label: "Leave Report", desc: "All leave requests with approval stages" },
  { type: "LOAN_LEDGER", label: "Loan Ledger", desc: "Authoritative ledger for a single loan" },
];
export function ReportsPage() {
  const { toast } = useApp();
  const [type, setType] = useState<ReportType>("PAYROLL_REGISTER");
  const [p1, setP1] = useState("");
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const reports = useApi(() => api.listReports(), []);
  const runs = useApi(() => api.payrollOverview().then((o) => o.runs).catch(() => []), []);
  const emps = useApi(() => api.listEmployees({ pageSize: 100 }).catch(() => ({ rows: [] as Array<{ id: string; lastName: string; firstName: string }> })), []);
  const loans = useApi(() => api.listLoans({ pageSize: 50 }).catch(() => ({ rows: [] as Array<{ id: string; refNo: string }> })), []);

  useEffect(() => {
    if (type === "PAYROLL_REGISTER" || type === "REMITTANCE") setP1(runs.data?.[0]?.id ?? "");
    if (type === "DTR") setP1(emps.data?.rows[0]?.id ?? "");
    if (type === "LOAN_LEDGER") setP1(loans.data?.rows[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, !!runs.data, !!emps.data, !!loans.data]);

  const needsRun = type === "PAYROLL_REGISTER" || type === "REMITTANCE";
  const needsEmp = type === "DTR";
  const needsLoan = type === "LOAN_LEDGER";
  const needsYm = type === "DTR" || type === "ATTENDANCE_SUMMARY";
  const request = async () => {
    const params: Record<string, string> = {};
    let label = "";
    if (needsRun) { params.runId = p1; label = runs.data?.find((r) => r.id === p1)?.periodLabel ?? p1; }
    if (needsEmp) { params.employeeId = p1; const e = emps.data?.rows.find((x) => x.id === p1); label = e ? `${e.lastName}, ${e.firstName} — ${ym}` : p1; params.ym = ym; }
    if (needsLoan) { params.loanId = p1; label = loans.data?.rows.find((l) => l.id === p1)?.refNo ?? p1; }
    if (needsYm && !needsEmp) { params.ym = ym; label = ym; }
    if ((needsRun || needsEmp || needsLoan) && !p1) { toast("Pick a parameter", "error"); return; }
    try { await api.requestReport(type, params, label || "Full scope"); toast("Report queued", "info", "The worker will notify you when the file is ready."); reports.reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  type RepRow = NonNullable<typeof reports.data>[number];
  const cols: Col<RepRow>[] = [
    { key: "type", label: "Report", sortValue: (x) => x.type, render: (x) => <span className="flex items-center gap-2 font-bold text-navy-900"><FileBarChart size={14} className="text-royal-600" />{x.type.replace(/_/g, " ")}</span> },
    { key: "paramsLabel", label: "Scope", render: (x) => <span className="text-[12.5px] text-ink-500">{x.paramsLabel}</span> },
    { key: "status", label: "Status", sortValue: (x) => x.status, render: (x) => (
      <span className="flex items-center gap-2"><StatusChip status={x.status} />{["QUEUED", "PROCESSING"].includes(x.status) && <span className="w-20"><ProgressBar value={x.progress} /></span>}</span>) },
    { key: "requestedByName", label: "Requested by", sortValue: (x) => x.requestedByName, render: (x) => <span className="text-[12.5px]">{x.requestedByName}</span> },
    { key: "createdAt", label: "Requested", sortValue: (x) => x.createdAt, render: (x) => <span className="tabular text-[12px] text-ink-400">{fmtDateTime(x.createdAt)}</span> },
    {
      key: "act", label: "", align: "right",
      render: (x) => x.status === "DONE" && x.file ? (
        <Button size="sm" variant="subtle" icon={Download} onClick={async () => {
          const f = await api.reportFile(x.file!.id);
          downloadText(f.name, f.content, f.mime);
        }}>Download</Button>
      ) : x.status === "FAILED" ? <Tag tone="red">Retry available</Tag> : null,
    },
  ];
  return (
    <div>
      <PageHeader title="Report Center" sub="Reports generate in the background worker, store privately, and notify the requester. States: QUEUED → PROCESSING → DONE / FAILED." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="anim-fade-up">
          <SectionLabel>New report request</SectionLabel>
          <div className="space-y-3.5">
            <Field label="Report type" required>
              <Select value={type} onChange={(e) => setType(e.target.value as ReportType)}>
                {REPORT_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </Select>
            </Field>
            <p className="rounded-md bg-ink-50 px-3 py-2 text-[11.5px] text-ink-500">{REPORT_TYPES.find((t) => t.type === type)?.desc}</p>
            {needsRun && (
              <Field label="Payroll run" required>
                <Select value={p1} onChange={(e) => setP1(e.target.value)}>
                  <option value="">Select…</option>
                  {(runs.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.periodLabel} ({r.status})</option>)}
                </Select>
              </Field>
            )}
            {needsEmp && (
              <Field label="Employee" required>
                <Select value={p1} onChange={(e) => setP1(e.target.value)}>
                  <option value="">Select…</option>
                  {(emps.data?.rows ?? []).map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}
                </Select>
              </Field>
            )}
            {needsLoan && (
              <Field label="Loan" required>
                <Select value={p1} onChange={(e) => setP1(e.target.value)}>
                  <option value="">Select…</option>
                  {(loans.data?.rows ?? []).map((l) => <option key={l.id} value={l.id}>{l.refNo}</option>)}
                </Select>
              </Field>
            )}
            {needsYm && <Field label="Month" required><Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></Field>}
            <Button className="w-full" onClick={request}>Queue report</Button>
            <InfoNote>Production pipeline: Puppeteer (PDF) + ExcelJS (XLSX) in the worker, private Supabase Storage, expiring signed-URL downloads.</InfoNote>
          </div>
        </Card>
        <Card pad={false} className="anim-fade-up lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h3 className="font-display text-[15px] font-bold text-navy-900">Generated reports</h3>
            <Button size="sm" variant="ghost" onClick={() => reports.reload()}>Refresh</Button>
          </div>
          <DataTable rows={reports.data ?? []} cols={cols} loading={reports.loading} error={reports.error ?? undefined} onRetry={reports.reload} />
        </Card>
      </div>
    </div>
  );
}

/* ================= NOTIFICATIONS ================= */
export function NotificationsPage() {
  const r = useApi(() => api.myNotifications(), []);
  return (
    <div>
      <PageHeader title="Notifications" sub="In-system notifications for leave, payroll, loans, recruitment and reports."
        actions={<Button variant="outline" onClick={async () => { await api.markAllRead(); r.reload(); }}>Mark all read</Button>} />
      <Card pad={false} className="anim-fade-up max-w-3xl">
        {(r.data ?? []).map((n) => (
          <button key={n.id} onClick={async () => { await api.markRead(n.id); r.reload(); }}
            className={`flex w-full items-start gap-3 border-b border-ink-100 px-5 py-4 text-left transition-colors last:border-0 hover:bg-royal-50/50 ${!n.read ? "bg-royal-50/40" : ""}`}>
            <span className={`mt-0.5 rounded-md p-2 ${n.read ? "bg-ink-100 text-ink-400" : "bg-royal-100 text-royal-600"}`}><Bell size={15} /></span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[13.5px] ${n.read ? "font-medium text-ink-500" : "font-bold text-navy-900"}`}>{n.title}</span>
              <span className="block text-[12.5px] text-ink-400">{n.body}</span>
              <span className="mt-1 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-300">{fmtDateTime(n.createdAt)}<Tag tone="navy">{n.type}</Tag></span>
            </span>
            {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-royal-500" />}
          </button>
        ))}
        {(r.data ?? []).length === 0 && !r.loading && <p className="px-5 py-12 text-center text-sm text-ink-400">No notifications.</p>}
      </Card>
    </div>
  );
}

/* ================= AUDIT ================= */
export function AuditPage() {
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const r = useApi(() => api.auditLog({ q, entity: entity || undefined, page }), [q, entity, page]);
  type Row = NonNullable<typeof r.data>["rows"][number];
  const cols: Col<Row>[] = [
    { key: "at", label: "When", sortValue: (x) => x.at, render: (x) => <span className="tabular text-[12px] text-ink-400">{fmtDateTime(x.at)}</span> },
    { key: "actorName", label: "Actor", sortValue: (x) => x.actorName, render: (x) => <span className="font-bold text-navy-900">{x.actorName}</span> },
    { key: "action", label: "Action", sortValue: (x) => x.action, render: (x) => <Tag tone="blue">{x.action}</Tag> },
    { key: "entity", label: "Entity", sortValue: (x) => x.entity, render: (x) => <span className="text-[12.5px]">{x.entity} <code className="rounded bg-ink-100 px-1 text-[10.5px]">{x.entityId.slice(0, 10)}</code></span> },
    {
      key: "diff", label: "Before → After", render: (x) => (
        <span className="flex flex-wrap gap-1.5">
          {x.before && Object.entries(x.before).slice(0, 2).map(([k, v]) => <Tag key={k} tone="red">{k}: {String(v)}</Tag>)}
          {x.after && Object.entries(x.after).slice(0, 2).map(([k, v]) => <Tag key={k} tone="green">{k}: {String(v)}</Tag>)}
          {!x.before && !x.after && <span className="text-[11.5px] text-ink-300">—</span>}
        </span>
      ),
    },
  ];
  return (
    <div>
      <PageHeader title="Audit Trail" sub="Append-only. Every critical action records actor, action, entity, before/after, and a correlation id." />
      <InfoNote tone="amber">Audit entries are append-oriented and protected from modification; production deployments enforce this at the database layer.</InfoNote>
      <Card pad={false} className="anim-fade-up mt-4">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search actor, action, entity…" className="w-72" />
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="w-52">
            <option value="">All entities</option>
            {["PayrollRun", "LeaveRequest", "Employee", "EmployeeLoan", "AttendanceAdjustment", "ContributionRule", "JobPosting", "Application", "UserProfile", "ReportRun", "Holiday"].map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
          <span className="ml-auto text-[12px] text-ink-400">{r.data?.total ?? "…"} events</span>
        </div>
        <DataTable rows={r.data?.rows ?? []} cols={cols} loading={r.loading} error={r.error ?? undefined} onRetry={r.reload}
          footer={r.data && <div className="flex justify-end"><Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} /></div>} />
      </Card>
    </div>
  );
}

/* ================= SETTINGS ================= */
export function SettingsPage() {
  const { section } = useParams();
  const sec = section ?? "organization";
  const tabs = [
    ["organization", "Organization", Building2], ["salary-grades", "Salary Grades", Database], ["schedules", "Schedules", CalendarDays],
    ["holidays", "Holidays", CalendarDays], ["users", "Users", Users], ["roles", "Roles & Permissions", ShieldCheck], ["general", "General", Globe],
  ] as const;
  return (
    <div>
      <PageHeader title="Settings" sub="Agency configuration. Government rule tables are versioned by effectivity; history is never rewritten." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map(([k, label, Icon]) => (
          <a key={k} href={`#/settings/${k}`} className={`flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors ${sec === k ? "bg-navy-900 text-white" : "bg-white text-ink-500 hover:bg-royal-50"}`}>
            <Icon size={14} />{label}
          </a>
        ))}
      </div>
      {sec === "organization" && <OrgSettings />}
      {sec === "salary-grades" && <SalaryGradeSettings />}
      {sec === "schedules" && <ScheduleSettings />}
      {sec === "holidays" && <HolidaySettings />}
      {sec === "users" && <UserSettings />}
      {sec === "roles" && <RoleSettings />}
      {(sec === "general" || !tabs.some(([k]) => k === sec)) && <GeneralSettings />}
    </div>
  );
}
function OrgSettings() {
  const r = useApi(() => api.orgOverview(), []);
  if (!r.data) return <div className="skeleton h-64" />;
  return (
    <div className="stagger grid gap-4 lg:grid-cols-3">
      {r.data.departments.map((d) => (
        <Card key={d.id}>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-bold text-navy-900">{d.name}</h3>
            <Tag tone="navy">{d.code}</Tag>
          </div>
          <div className="mt-3 space-y-1.5 text-[12.5px]">
            <div className="flex justify-between"><span className="text-ink-400">Division Chief</span><span className="font-semibold text-navy-900">{d.head ? `${d.head.firstName} ${d.head.lastName}` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-ink-400">Active personnel</span><span className="tabular font-semibold">{num(d.count)}</span></div>
            <div className="flex justify-between"><span className="text-ink-400">Positions</span><span className="tabular font-semibold">{d.positions}</span></div>
          </div>
        </Card>
      ))}
      <Card className="lg:col-span-3" pad={false}>
        <div className="border-b border-ink-100 px-4 py-3"><h3 className="font-display text-[15px] font-bold text-navy-900">Position registry</h3></div>
        <div className="grid gap-x-8 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {r.data.positions.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-dotted border-ink-100 py-1.5 text-[12.5px]">
              <span className="font-semibold text-ink-700">{p.title}</span>
              <span className="flex items-center gap-1.5"><Tag tone="gold">SG {p.salaryGrade}</Tag><Tag tone="gray">{p.department.split(" ")[0]}</Tag></span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
function SalaryGradeSettings() {
  const r = useApi(() => api.salaryTables(), []);
  if (!r.data) return <div className="skeleton h-64" />;
  return (
    <Card pad={false} className="anim-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div><h3 className="font-display text-[15px] font-bold text-navy-900">Standardized Salary Schedule</h3>
          <p className="text-[11.5px] text-ink-400">{r.data.schedules[0]?.name} · effective {r.data.schedules[0]?.effectiveFrom} · 8 steps, ₱2,000 increment</p></div>
        <Tag tone="amber">DEMO INDEXATION</Tag>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead className="sticky top-0"><tr className="bg-navy-900 text-left text-[10px] font-bold uppercase tracking-wide text-white">
            <th className="px-4 py-2.5">SG</th>{Array.from({ length: 8 }, (_, i) => <th key={i} className="px-3 py-2.5 text-right">Step {i + 1}</th>)}</tr></thead>
          <tbody>
            {r.data.grades.map((g) => (
              <tr key={g.grade} className="border-b border-ink-100 transition-colors hover:bg-royal-50/40">
                <td className="px-4 py-1.5 font-display font-extrabold text-navy-900">{g.grade}</td>
                {g.steps.map((s, i) => <td key={i} className={`tabular px-3 py-1.5 text-right ${i === 0 ? "font-bold text-navy-900" : "text-ink-500"}`}>{php(s, { noDecimals: true })}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function ScheduleSettings() {
  const r = useApi(() => api.shiftsList(), []);
  return (
    <div className="stagger grid gap-4 sm:grid-cols-2">
      {(r.data ?? []).map((s) => (
        <Card key={s.id}>
          <h3 className="font-display text-[15px] font-bold text-navy-900">{s.name}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {[["Start", `${Math.floor(s.startMin / 60)}:${`${s.startMin % 60}`.padStart(2, "0")}`], ["End", `${Math.floor(s.endMin / 60)}:${`${s.endMin % 60}`.padStart(2, "0")}`], ["Grace period", `${s.graceMin} min`], ["Lunch break", `${s.lunchMin} min`]].map(([k, v]) => (
              <div key={k} className="rounded-md bg-ink-50/60 p-2.5"><div className="text-[10px] font-bold uppercase text-ink-400">{k}</div><div className="tabular font-display text-[15px] font-bold text-navy-900">{v}</div></div>
            ))}
          </div>
        </Card>
      ))}
      <Card className="sm:col-span-2">
        <SectionLabel>Payroll & attendance rules</SectionLabel>
        <div className="grid gap-2.5 text-[13px] sm:grid-cols-2">
          {[["Payroll frequency", "Semi-monthly (1–15, 16–end)"], ["Cutoff rule", "10th / 25th; attendance finalizes 24h after"], ["Overtime crediting", "Beyond 60 minutes past shift end, at 125%"], ["Late computation", "Beyond shift start + grace period"], ["Undertime", "Minutes short of shift end"], ["Holiday pay", "Per Civil Service rules (demo config)"]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 rounded-md border border-ink-100 px-3 py-2.5"><span className="font-semibold text-navy-900">{k}</span><span className="text-right text-ink-500">{v}</span></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
function HolidaySettings() {
  const { toast } = useApp();
  const r = useApi(() => api.holidaysList(), []);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);
  const [f, setF] = useState({ date: todayISO(), name: "", type: "REGULAR" as "REGULAR" | "SPECIAL" });
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button icon={Plus} onClick={() => { setF({ date: todayISO(), name: "", type: "REGULAR" }); setOpen(true); }}>Add holiday</Button></div>
      <Card pad={false} className="anim-fade-up">
        <div className="grid gap-x-8 px-4 py-3 sm:grid-cols-2">
          {(r.data ?? []).map((h) => (
            <div key={h.id} className="flex items-center justify-between border-b border-dotted border-ink-100 py-2.5 text-[13px]">
              <span className="flex items-center gap-2.5">
                <span className="tabular w-24 font-bold text-navy-900">{fmtDateMed(h.date)}</span>
                <span className="font-semibold text-ink-700">{h.name}</span>
                <Tag tone={h.type === "REGULAR" ? "red" : "amber"}>{h.type}</Tag>
              </span>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel({ id: h.id, name: h.name })} aria-label={`Delete ${h.name}`} />
            </div>
          ))}
        </div>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Add holiday" width="max-w-sm"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={async () => {
          if (!f.name.trim()) { toast("Name required", "error"); return; }
          try { await api.upsertHoliday(f); toast("Holiday added", "success"); setOpen(false); r.reload(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
        }}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Date" required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g., Bonifacio Day" /></Field>
          <Field label="Type" required><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "REGULAR" | "SPECIAL" })}><option value="REGULAR">Regular holiday</option><option value="SPECIAL">Special non-working day</option></Select></Field>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger title="Delete holiday" body={`Remove ${del?.name}? Attendance already finalized on this date is unaffected.`} confirmLabel="Delete" onConfirm={async () => { if (del) { await api.deleteHoliday(del.id); toast("Holiday removed", "info"); r.reload(); } }} />
    </div>
  );
}
function UserSettings() {
  const { toast } = useApp();
  const r = useApi(() => api.usersList(), []);
  return (
    <Card pad={false} className="anim-fade-up">
      <div className="border-b border-ink-100 px-4 py-3"><h3 className="font-display text-[15px] font-bold text-navy-900">User accounts</h3><p className="text-[11.5px] text-ink-400">Identity lives in Supabase Auth (production); roles are granted from the application database.</p></div>
      <div className="divide-y divide-ink-100">
        {(r.data ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className={`size-2 rounded-full ${u.active ? "bg-emerald-500" : "bg-ink-300"}`} />
            <div className="min-w-44 flex-1">
              <div className="text-[13.5px] font-bold text-navy-900">{u.fullName}</div>
              <div className="text-[11.5px] text-ink-400">{u.email}{u.employee ? ` · ${u.employee.firstName} ${u.employee.lastName} (${u.employee.employeeNo})` : " · no linked employee"}</div>
            </div>
            <div className="flex items-center gap-2">
              <KeyRound size={13} className="text-ink-300" />
              <Select value={u.role} onChange={async (e) => {
                try { await api.setUserRole(u.id, e.target.value as Role); toast("Role updated", "success", `${u.fullName} is now ${e.target.value.replace(/_/g, " ")}.`); r.reload(); }
                catch (err) { toast(err instanceof Error ? err.message : "Failed", "error"); }
              }} className="w-52">
                {roleMatrix().map((m) => <option key={m.role} value={m.role}>{m.role.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
function RoleSettings() {
  const matrix = roleMatrix();
  const perms = matrix[0].permissions;
  return (
    <Card pad={false} className="anim-fade-up">
      <div className="border-b border-ink-100 px-4 py-3"><h3 className="font-display text-[15px] font-bold text-navy-900">Roles & permissions matrix</h3><p className="text-[11.5px] text-ink-400">Enforced server-side by the PermissionsGuard; the UI only hides what a role cannot see.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[12px]">
          <thead><tr className="bg-ink-50/70 text-left text-[10px] font-bold uppercase tracking-wide text-ink-400">
            <th className="sticky left-0 z-10 bg-ink-50 px-4 py-2.5">Permission</th>
            {matrix.map((m) => <th key={m.role} className="px-2 py-2.5 text-center text-[9px]">{m.role.replace(/_/g, " ")}</th>)}
          </tr></thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p} className="border-t border-ink-100">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 font-mono text-[11px] font-semibold text-navy-900">{p}</td>
                {matrix.map((m) => (
                  <td key={m.role} className="px-2 py-2 text-center">
                    {m.permissions.includes(p) ? <CheckCircle2 size={14} className="inline text-emerald-500" /> : <XCircle size={13} className="inline text-ink-200" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function GeneralSettings() {
  const { toast } = useApp();
  const r = useApi(() => api.systemSettings(), []);
  const [health, setHealth] = useState<{ api: string; checkedAt: string } | null>(null);
  useEffect(() => {
    if (!config.isPreview) {
      fetch(`${config.apiUrl}/health`).then((x) => x.ok ? setHealth({ api: "REACHABLE", checkedAt: new Date().toISOString() }) : setHealth({ api: "ERROR", checkedAt: new Date().toISOString() }))
        .catch(() => setHealth({ api: "UNREACHABLE", checkedAt: new Date().toISOString() }));
    }
  }, []);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="anim-fade-up">
        <SectionLabel>System settings</SectionLabel>
        <div className="space-y-2">
          {(r.data ?? []).map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 rounded-md border border-ink-100 px-3 py-2.5 text-[12.5px]">
              <code className="font-mono font-bold text-navy-900">{s.key}</code>
              <span className="text-right text-ink-500">{s.value}</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="space-y-4">
        <Card className="anim-fade-up">
          <SectionLabel><span className="flex items-center gap-1.5"><Activity size={13} /> Diagnostics</span></SectionLabel>
          <div className="space-y-2 text-[12.5px]">
            {[
              ["Operating mode", config.isPreview ? "PREVIEW (fictional data)" : "PRODUCTION", config.isPreview ? "amber" : "green"],
              ["API endpoint", config.apiUrl, "navy"],
              ["API status", config.isPreview ? "n/a — in-browser preview adapter" : (health?.api ?? "checking…"), config.isPreview ? "gray" : health?.api === "REACHABLE" ? "green" : "red"],
              ["Data adapter", config.isPreview ? "src/server (localStorage fixtures)" : "REST → NestJS → Prisma → PostgreSQL", "navy"],
              ["Auth", config.isPreview ? "Preview session (Supabase Auth in production)" : "Supabase JWT", "navy"],
              ["Workers", config.isPreview ? "Simulated in-tab (BullMQ in production)" : "BullMQ @ Upstash Redis", "navy"],
            ].map(([k, v, tone]) => (
              <div key={k as string} className="flex items-center justify-between gap-3 rounded-md border border-ink-100 px-3 py-2">
                <span className="font-semibold text-navy-900">{k as string}</span>
                <Tag tone={tone as "amber"}>{v as string}</Tag>
              </div>
            ))}
            {config.misconfigured && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700">{config.misconfigured}</div>}
          </div>
        </Card>
        <Card className="anim-fade-up">
          <SectionLabel><span className="flex items-center gap-1.5"><Server size={13} /> Production stack (implemented in-repo)</span></SectionLabel>
          <div className="space-y-1.5 text-[12.5px] text-ink-600">
            {[["apps/api", "NestJS — authoritative business logic, RBAC, /api/v1"], ["apps/worker", "BullMQ processors: payroll, payslips, PDF/Excel reports, email"], ["apps/api/prisma", "Full schema, migrations via prisma migrate, guarded dev seed"], ["packages/contracts", "Shared neutral types + pure payroll/attendance engine"], ["Supabase", "PostgreSQL · Auth (JWT) · private Storage · Realtime"], ["Monitoring", "Sentry hooks + structured logs with correlation ids"]].map(([k, v]) => (
              <div key={k} className="flex gap-2.5 rounded-md bg-ink-50/60 px-3 py-2"><code className="shrink-0 font-mono text-[11.5px] font-bold text-royal-700">{k}</code><span className="text-ink-500">{v}</span></div>
            ))}
          </div>
          {config.isPreview && (
            <div className="mt-3 border-t border-ink-100 pt-3">
              <Button variant="outline" size="sm" onClick={() => { resetDB(); toast("Demo data restored", "success"); }}>Reset demo data</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
