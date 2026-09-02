import { ArrowLeft, Building2, CalendarDays, Coins, Download, Gift, History, Pencil, UserPlus, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { downloadText, fmtDateMed, fmtMin, monthLabel, num, php, titleCase, todayISO } from "../lib/core";
import { canSee, useApi, useApp } from "../state/store";
import { Avatar, Button, Card, DataTable, Field, Input, KV, Modal, PageHeader, Pager, SearchInput, Select, SectionLabel, StatusChip, Tag, Textarea, type Col } from "../components/ui";

type EmpRow = Awaited<ReturnType<typeof api.listEmployees>>["rows"][number];

export function EmployeesPage() {
  const { user, toast } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const r = useApi(() => api.listEmployees({ q, departmentId: dept || undefined, status: status || undefined, page }), [q, dept, status, page]);
  const rows: EmpRow[] = r.data?.rows ?? [];
  const or = useApi(() => api.orgOverview(), []);
  const [addOpen, setAddOpen] = useState(false);
  const canCreate = canSee(user, "employees.create");

  const cols: Col<EmpRow>[] = [
    { key: "fullName", label: "Employee", sortValue: (x) => x.fullName, render: (x) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={`${x.firstName} ${x.lastName}`} hue={x.avatarHue} size={32} />
        <div><div className="font-bold text-navy-900">{x.firstName} {x.lastName}</div><div className="text-[11px] text-ink-400">{x.employeeNo}</div></div>
      </div>) },
    { key: "position", label: "Position", sortValue: (x) => x.position, render: (x) => <span className="text-[12.5px]">{x.position}</span> },
    { key: "department", label: "Division", sortValue: (x) => x.department, render: (x) => <span className="text-[12.5px] text-ink-500">{x.department.replace(" Division", "").replace(" Office", "")}</span> },
    { key: "sg", label: "SG·Step", sortValue: (x) => x.salaryGrade * 100 + x.salaryStep, render: (x) => <Tag tone="gold">SG {x.salaryGrade}·{x.salaryStep}</Tag> },
    { key: "salaryCents", label: "Monthly", align: "right", sortValue: (x) => x.salaryCents, render: (x) => <span className="tabular font-semibold">{php(x.salaryCents)}</span> },
    { key: "status", label: "Status", sortValue: (x) => x.status, render: (x) => <StatusChip status={x.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Employees" sub="Master employee records — appointment, compensation, and status with full change history."
        actions={canCreate && <Button icon={UserPlus} onClick={() => setAddOpen(true)}>Add employee</Button>} />
      <Card pad={false} className="anim-fade-up">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, number, position…" className="w-72" />
          <Select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} className="w-52">
            <option value="">All divisions</option>
            {(or.data?.departments ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SEPARATED">Separated</option>
          </Select>
          <span className="ml-auto text-[12px] text-ink-400">{r.data?.total ?? "…"} employees</span>
        </div>
        <DataTable rows={rows} cols={cols} loading={r.loading} error={r.error ?? undefined} onRetry={r.reload} rowClick={(x) => nav(`/employees/${x.id}`)}
          footer={r.data && <div className="flex justify-end"><Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} /></div>} />
      </Card>
      {addOpen && <AddEmployeeModal departments={or.data?.departments ?? []} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); r.reload(); toast("Employee created", "success"); }} />}
    </div>
  );
}
function AddEmployeeModal({ departments, onClose, onDone }: { departments: Array<{ id: string; name: string }>; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState({ firstName: "", lastName: "", gender: "F" as "M" | "F", email: "", departmentId: "", positionId: "", salaryStep: 1, hiredAt: todayISO() });
  const [busy, setBusy] = useState(false);
  const pr = useApi(() => api.orgOverview(), []);
  const positions = (pr.data?.positions ?? []).filter((p) => p.departmentId === f.departmentId);
  return (
    <Modal open onClose={onClose} title="New employee record" width="max-w-xl"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => {
        setBusy(true);
        try { await api.createEmployee(f); onDone(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
      }}>Create record</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required><Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label="Last name" required><Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
        <Field label="Gender" required><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as "M" | "F" })}><option value="F">Female</option><option value="M">Male</option></Select></Field>
        <Field label="Email" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Division" required><Select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value, positionId: "" })}><option value="">Select…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Position" required><Select value={f.positionId} onChange={(e) => setF({ ...f, positionId: e.target.value })}><option value="">Select…</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title} (SG {p.salaryGrade})</option>)}</Select></Field>
        <Field label="Salary step" required><Select value={String(f.salaryStep)} onChange={(e) => setF({ ...f, salaryStep: Number(e.target.value) })}>{Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>Step {i + 1}</option>)}</Select></Field>
        <Field label="Hire date" required><Input type="date" value={f.hiredAt} onChange={(e) => setF({ ...f, hiredAt: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ================= profile ================= */
export function EmployeeProfilePage() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const r = useApi(() => api.getEmployee(id!), [id]);
  const [tab, setTab] = useState<"overview" | "compensation" | "leave" | "loans" | "history" | "attendance">("overview");
  const [editOpen, setEditOpen] = useState(false);
  const d = r.data;
  if (r.loading || !d) return <div><div className="skeleton mb-6 h-32 w-full" /><div className="skeleton h-64 w-full" /></div>;
  if (r.error) return <Card><p className="text-sm text-red-600">{r.error}</p><Link to="/employees" className="mt-3 inline-block text-royal600 text-royal-600">← Back to directory</Link></Card>;
  const e = d.employee;
  const canEdit = canSee(user, "employees.update");
  const TABS = [["overview", "Overview"], ["compensation", "Compensation"], ["leave", "Leave"], ["loans", "Loans"], ["attendance", "Attendance"], ["history", "History"]] as const;
  return (
    <div>
      <Link to="/employees" className="mb-4 inline-flex items-center gap-1 text-[13px] font-bold text-royal-600 hover:text-royal-700"><ArrowLeft size={14} /> Employee directory</Link>
      <Card className="anim-fade-up mb-4">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={`${e.firstName} ${e.lastName}`} hue={e.avatarHue} size={68} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-[24px] font-extrabold text-navy-900">{e.firstName} {e.middleName ? `${e.middleName[0]}. ` : ""}{e.lastName}</h1>
              <StatusChip status={e.status} /><Tag tone="blue">{e.appointmentType}</Tag>
            </div>
            <p className="mt-0.5 text-[13px] font-semibold text-royal-700">{d.position.title} · {d.department.name}</p>
            <p className="text-[12px] text-ink-400">{e.employeeNo} · {e.email} · hired {fmtDateMed(e.hiredAt)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" icon={Download} onClick={async () => {
              const csv = await api.dtrCsvDownload(e.id, todayISO().slice(0, 7));
              downloadText(`dtr_${e.employeeNo}_${todayISO().slice(0, 7)}.csv`, csv);
              toast("DTR exported", "success");
            }}>DTR export</Button>
            {canEdit && <Button icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Button>}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KV label="Salary grade / step"><span className="flex items-center gap-1.5"><Tag tone="gold">SG {e.salaryGrade} · Step {e.salaryStep}</Tag></span></KV>
          <KV label="Monthly basic"><span className="tabular">{php(d.salaryCents)}</span></KV>
          <KV label="Supervisor">{d.supervisor ? `${d.supervisor.firstName} ${d.supervisor.lastName}` : "—"}</KV>
          <KV label="Work shift">{d.shift.name}</KV>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors ${tab === k ? "bg-navy-900 text-white" : "bg-white text-ink-500 hover:bg-royal-50 hover:text-royal-700"}`}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="stagger grid gap-4 lg:grid-cols-3">
          <Card>
            <SectionLabel>Personal</SectionLabel>
            <div className="space-y-2 text-[13px]">
              {[["Birth date", fmtDateMed(e.birthDate)], ["Gender", e.gender === "F" ? "Female" : "Male"], ["Address", e.address], ["Phone", e.phone], ["TIN", e.tin]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-dotted border-ink-100 pb-1.5"><span className="text-ink-400">{k}</span><span className="text-right font-semibold text-navy-900">{v}</span></div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionLabel>Government numbers</SectionLabel>
            <div className="space-y-2 text-[13px]">
              {[["GSIS BP", e.gsisNo], ["PhilHealth", e.philhealthNo], ["Pag-IBIG", e.pagibigNo], ["Bank", e.bankName ?? "—"], ["Account", e.bankAccount ?? "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-dotted border-ink-100 pb-1.5"><span className="text-ink-400">{k}</span><span className="font-mono text-[12px] font-semibold text-navy-900">{v}</span></div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionLabel>Last 30 days</SectionLabel>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              {[["Present", num(d.att30.present), "text-royal-600"], ["Late days", num(d.att30.late), "text-amber-600"], ["OT", fmtMin(d.att30.otMin), "text-emerald-600"]].map(([k, v, c]) => (
                <div key={k} className="rounded-md bg-ink-50/60 p-3"><div className={`tabular font-display text-[17px] font-extrabold ${c}`}>{v}</div><div className="text-[10.5px] font-bold uppercase text-ink-400">{k}</div></div>
              ))}
            </div>
            <SectionLabel><span className="mt-4 inline-block">Active allowances</span></SectionLabel>
            <div className="space-y-1.5">
              {d.allowances.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-ink-100 px-2.5 py-1.5 text-[12.5px]">
                  <span className="flex items-center gap-1.5 font-semibold text-navy-900"><Gift size={13} className="text-gold-600" />{a.typeName}</span>
                  <span className="tabular font-bold">{php(a.monthlyCents)}/mo</span>
                </div>
              ))}
              {d.allowances.length === 0 && <p className="text-[12.5px] text-ink-400">None assigned.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === "compensation" && (
        <Card className="anim-fade-up">
          <SectionLabel>Compensation profile</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            <KV label="Salary schedule">{d.schedule.name}</KV>
            <KV label="Effective from">{fmtDateMed(d.schedule.effectiveFrom)}</KV>
            <KV label="Monthly basic"><span className="tabular">{php(d.salaryCents)}</span></KV>
          </div>
          <div className="mt-4 rounded-lg bg-navy-900 p-4 text-white">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold-300">SG {e.salaryGrade} step progression</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from({ length: 8 }, (_, i) => {
                const cents = d.salaryCents + (i + 1 - e.salaryStep) * 200_000;
                return <span key={i} className={`tabular rounded-md px-2 py-1 text-[11.5px] font-bold ${i + 1 === e.salaryStep ? "bg-gold-500 text-navy-950" : "bg-white/10 text-white/70"}`}>S{i + 1} {php(cents, { noDecimals: true })}</span>;
              })}
            </div>
          </div>
          <p className="mt-3 text-[11.5px] text-ink-400">Compensation changes are audited and take effect on the next payroll computation (effective-dated schedule).</p>
        </Card>
      )}

      {tab === "leave" && <LeaveTab employeeId={e.id} />}
      {tab === "loans" && (
        <Card className="anim-fade-up">
          <SectionLabel>Loan portfolio</SectionLabel>
          <div className="space-y-2.5">
            {d.loans.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-100 px-3.5 py-3">
                <div><div className="flex items-center gap-2 text-[13.5px] font-bold text-navy-900"><Coins size={15} className="text-royal-600" />{l.typeName} <code className="rounded bg-ink-100 px-1.5 text-[10.5px]">{l.refNo}</code></div>
                  <div className="text-[11.5px] text-ink-400">Applied {fmtDateMed(l.appliedAt.slice(0, 10))} · {l.termMonths} months</div></div>
                <div className="text-right"><div className="tabular font-display text-[15px] font-extrabold text-navy-900">{php(l.balanceCents)}</div><StatusChip status={l.status} /></div>
              </div>
            ))}
            {d.loans.length === 0 && <p className="text-[13px] text-ink-400">No loans on record.</p>}
          </div>
        </Card>
      )}
      {tab === "attendance" && (
        <Card className="anim-fade-up" pad={false}>
          <div className="border-b border-ink-100 px-4 py-3"><h3 className="font-display text-[15px] font-bold text-navy-900">Recent attendance</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead><tr className="bg-ink-50/70 text-left text-[10px] font-bold uppercase tracking-wide text-ink-400"><th className="px-4 py-2">Date</th><th className="px-3 py-2">Clock in</th><th className="px-3 py-2">Clock out</th><th className="px-3 py-2 text-right">Late</th><th className="px-3 py-2 text-right">OT</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody>{d.recentAttendance.map((a) => (
                <tr key={a.id} className="border-t border-ink-100">
                  <td className="px-4 py-2.5 font-semibold text-navy-900">{fmtDateMed(a.date)}</td>
                  <td className="tabular px-3 py-2.5">{a.clockIn != null ? `${Math.floor(a.clockIn / 60)}:${`${a.clockIn % 60}`.padStart(2, "0")}` : "—"}</td>
                  <td className="tabular px-3 py-2.5">{a.clockOut != null ? `${Math.floor(a.clockOut / 60)}:${`${a.clockOut % 60}`.padStart(2, "0")}` : "—"}</td>
                  <td className="tabular px-3 py-2.5 text-right">{a.lateMin ? `${a.lateMin}m` : "—"}</td>
                  <td className="tabular px-3 py-2.5 text-right">{a.otMin ? `${a.otMin}m` : "—"}</td>
                  <td className="px-4 py-2.5"><StatusChip status={a.status} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === "history" && (
        <Card className="anim-fade-up">
          <SectionLabel><span className="flex items-center gap-1.5"><History size={13} /> Change history (audited)</span></SectionLabel>
          <div className="space-y-2">
            {d.history.map((h) => (
              <div key={h.id} className="rounded-md border border-ink-100 px-3.5 py-2.5 text-[12.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-navy-900">{titleCase(h.action)}</span>
                  <span className="text-[11px] text-ink-400">{h.actorName} · {new Date(h.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</span>
                </div>
                {(h.before || h.after) && (
                  <div className="mt-1 flex flex-wrap gap-2 text-[11.5px]">
                    {h.before && Object.entries(h.before).map(([k, v]) => <Tag key={k} tone="red">{k}: {String(v)}</Tag>)}
                    {h.after && Object.entries(h.after).map(([k, v]) => <Tag key={k} tone="green">{k}: {String(v)}</Tag>)}
                  </div>
                )}
              </div>
            ))}
            {d.history.length === 0 && <p className="text-[13px] text-ink-400">No recorded changes for this record.</p>}
          </div>
        </Card>
      )}

      {editOpen && (
        <EditEmployeeModal employee={e} onClose={() => setEditOpen(false)} onDone={async (patch) => {
          try { await api.updateEmployee(e.id, patch); toast("Employee updated", "success", "Change recorded in the audit trail."); r.reload(); setEditOpen(false); }
          catch (err) { toast(err instanceof Error ? err.message : "Update failed", "error"); }
        }} />
      )}
    </div>
  );
}
function EditEmployeeModal({ employee, onClose, onDone }: { employee: { id: string; salaryStep: number; status: string; phone: string; appointmentType: string }; onClose: () => void; onDone: (p: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState({ salaryStep: employee.salaryStep, status: employee.status, phone: employee.phone, appointmentType: employee.appointmentType });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Edit employee record" width="max-w-md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => { setBusy(true); await onDone({ salaryStep: Number(f.salaryStep), status: f.status, phone: f.phone, appointmentType: f.appointmentType }); setBusy(false); }}>Save changes</Button></>}>
      <div className="space-y-4">
        <Field label="Salary step" required><Select value={String(f.salaryStep)} onChange={(e) => setF({ ...f, salaryStep: Number(e.target.value) })}>{Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>Step {i + 1}</option>)}</Select></Field>
        <Field label="Employment status" required><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="ACTIVE">Active</option><option value="SEPARATED">Separated (archived)</option></Select></Field>
        <Field label="Appointment type" required><Select value={f.appointmentType} onChange={(e) => setF({ ...f, appointmentType: e.target.value })}>{["PERMANENT", "CASUAL", "JOB_ORDER", "COS"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</Select></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        {f.status === "SEPARATED" && <p className="rounded-md bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">Separation archives the record — historical payroll and audit data remain intact.</p>}
      </div>
    </Modal>
  );
}
function LeaveTab({ employeeId }: { employeeId: string }) {
  const bal = useApi(() => api.leaveBalances(employeeId), [employeeId]);
  const ledger = useApi(() => api.leaveLedger(employeeId), [employeeId]);
  return (
    <div className="stagger grid gap-4 lg:grid-cols-3">
      <Card>
        <SectionLabel><span className="flex items-center gap-1.5"><CalendarDays size={13} /> Balances (ledger-derived)</span></SectionLabel>
        <div className="space-y-3">
          {(bal.data ?? []).map((b) => (
            <div key={b.id}>
              <div className="mb-1 flex justify-between text-[12.5px]"><span className="font-semibold text-ink-700">{b.name}</span><span className="tabular font-bold text-navy-900">{b.days} / {b.annualDays} d</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (b.days / b.annualDays) * 100))}%`, background: b.color }} /></div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="lg:col-span-2" pad={false}>
        <div className="border-b border-ink-100 px-4 py-3"><h3 className="font-display text-[15px] font-bold text-navy-900">Leave ledger</h3><p className="text-[11.5px] text-ink-400">Every balance movement is a posted entry — the balance is always reconstructable.</p></div>
        <div className="max-h-96 overflow-y-auto">
          {(ledger.data ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-2.5 text-[12.5px] last:border-0">
              <Tag tone={l.type === "DEBIT" ? "red" : l.type === "CREDIT" ? "green" : l.type === "REVERSAL" ? "blue" : "amber"}>{l.type}</Tag>
              <span className="min-w-0 flex-1 truncate text-ink-500">{l.memo}</span>
              <span className="tabular font-bold text-navy-900">{l.type === "DEBIT" ? "−" : "+"}{l.daysH / 100} d</span>
            </div>
          ))}
          {(ledger.data ?? []).length === 0 && !ledger.loading && <p className="px-4 py-8 text-center text-[13px] text-ink-400">No ledger entries.</p>}
        </div>
      </Card>
    </div>
  );
}
void Users; void Wallet; void Building2; void Textarea; void monthLabel;
