import { ArrowRight, CalendarDays, CheckCircle2, Clock, Download, Fingerprint, Printer, RefreshCw, ShieldCheck, UserCheck, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { downloadText, fmtClock, fmtDateLong, fmtDateMed, fmtMin, hoursLabel, monthDays, monthLabel, nextMonth, num, prevMonth, todayISO } from "../lib/core";
import { canSee, useApi, useApp } from "../state/store";
import { Button, Card, ConfirmDialog, DataTable, Field, Input, KPI, Modal, PageHeader, Pager, SearchInput, Select, SectionLabel, StatusChip, Tag, Textarea, type Col } from "../components/ui";

/* ================= daily register ================= */
type Row = Awaited<ReturnType<typeof api.listAttendance>>["rows"][number];
export function AttendancePage() {
  const { user, toast } = useApp();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const date = sp.get("date") ?? todayISO();
  const [dept, setDept] = useState(sp.get("dept") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const setDate = (v: string) => { setSp({ date: v }); setPage(1); };
  const ov = useApi(() => api.attendanceOverview(date), [date]);
  const r = useApi(() => api.listAttendance({ date, departmentId: dept || undefined, status: status || undefined, q, page }), [date, dept, status, q, page]);
  const or = useApi(() => api.orgOverview(), []);
  const devices = useApi(() => api.deviceList().catch(() => []), []);
  const [syncing, setSyncing] = useState("");
  const [adjFor, setAdjFor] = useState<Row | null>(null);
  const canAdjust = canSee(user, "attendance.adjust");
  const canManage = canSee(user, "attendance.manage");

  const sync = async (deviceId: string) => {
    setSyncing(deviceId);
    try {
      const res = await api.runBiometricSync(deviceId);
      toast("Biometric sync complete", "success", `${res.created} new log(s), ${res.dupes} duplicate(s) skipped.`);
      r.reload(); ov.reload();
    } catch (e) { toast(e instanceof Error ? e.message : "Sync failed", "error"); }
    finally { setSyncing(""); }
  };
  const cols: Col<Row>[] = [
    { key: "fullName", label: "Employee", sortValue: (x) => x.fullName, render: (x) => <div><div className="font-bold text-navy-900">{x.fullName}</div><div className="text-[11px] text-ink-400">{x.employeeNo} · {x.department.replace(" Division", "").replace(" Office", "")}</div></div> },
    { key: "clockIn", label: "Clock in", sortValue: (x) => x.clockIn ?? -1, render: (x) => <span className="tabular">{x.clockIn != null ? fmtClock(x.clockIn) : "—"}</span> },
    { key: "clockOut", label: "Clock out", sortValue: (x) => x.clockOut ?? -1, render: (x) => <span className="tabular">{x.clockOut != null ? fmtClock(x.clockOut) : "—"}</span> },
    { key: "totalMin", label: "Hours", align: "right", sortValue: (x) => x.totalMin, render: (x) => <span className="tabular">{x.totalMin ? hoursLabel(x.totalMin) : "—"}</span> },
    { key: "lateMin", label: "Late/UT", align: "right", sortValue: (x) => x.lateMin + x.undertimeMin, render: (x) => <span className={`tabular font-semibold ${(x.lateMin + x.undertimeMin) > 0 ? "text-amber-600" : "text-ink-400"}`}>{x.lateMin + x.undertimeMin ? `${x.lateMin + x.undertimeMin}m` : "—"}</span> },
    { key: "status", label: "Status", sortValue: (x) => x.status, render: (x) => <StatusChip status={x.status} /> },
    ...(canAdjust ? [{ key: "act", label: "", align: "right" as const, render: (x: Row) => <Button size="sm" variant="ghost" onClick={() => setAdjFor(x)}>Adjust</Button> }] : []),
  ];
  return (
    <div>
      <PageHeader title="Timekeeping & Attendance" sub="Biometric logs → normalization → schedule resolution → finalized attendance → payroll snapshot."
        actions={<>
          <Link to="/attendance/dtr"><Button variant="outline" icon={CalendarDays}>Daily Time Records</Button></Link>
          <Link to="/attendance/adjustments"><Button variant="outline" icon={ShieldCheck}>Adjustments</Button></Link>
        </>} />
      <div className="stagger grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KPI label="Total employees" value={num(ov.data?.totalEmployees ?? 0)} icon={Users} tone="navy" hint="Active roster" />
        <KPI label="Present today" value={num(ov.data?.present ?? 0)} icon={UserCheck} tone="green" hint={fmtDateLong(date)} />
        <KPI label="Late arrivals" value={num(ov.data?.late ?? 0)} icon={Clock} tone="amber" hint="Beyond grace period" />
        <KPI label="Absent / on leave" value={num(ov.data?.absentOrLeave ?? 0)} icon={XCircle} tone="red" hint={`${ov.data?.incomplete ?? 0} incomplete log(s)`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card pad={false} className="anim-fade-up">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search employee…" className="w-56" />
            <Select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} className="w-44">
              <option value="">All divisions</option>
              {(or.data?.departments ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44">
              <option value="">All statuses</option>
              {["ON_TIME", "LATE", "UNDERTIME", "LATE_AND_UNDERTIME", "ABSENT", "ON_LEAVE", "HOLIDAY", "INCOMPLETE"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <DataTable rows={r.data?.rows ?? []} cols={cols} loading={r.loading} error={r.error ?? undefined} onRetry={r.reload}
            footer={r.data && <div className="flex justify-end"><Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} /></div>} />
        </Card>

        <div className="space-y-4">
          <Card className="anim-fade-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[15px] font-bold text-navy-900">Biometric devices</h3>
              <Tag tone="navy">adapter-based</Tag>
            </div>
            <div className="mt-3 space-y-2.5">
              {(devices.data ?? []).map((dv) => (
                <div key={dv.id} className="rounded-md border border-ink-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-navy-900"><Fingerprint size={14} className="text-royal-600" />{dv.name}</span>
                    <span className="flex items-center gap-1 text-[10.5px] font-bold text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />ONLINE</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-400">{dv.model} · {dv.location}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10.5px] text-ink-400">Last sync {new Date(dv.lastSyncAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                    {canManage && <Button size="sm" variant="subtle" loading={syncing === dv.id} icon={RefreshCw} onClick={() => sync(dv.id)}>Sync now</Button>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">Raw imported logs are immutable; corrections flow through attendance adjustments.</p>
          </Card>
          <Card className="anim-fade-up">
            <SectionLabel>Processing pipeline</SectionLabel>
            <div className="space-y-1 text-[12px] text-ink-600">
              {["Raw logs", "Normalization", "Employee mapping", "Schedule resolution", "Late / UT / OT", "Exception detection", "Approved adjustments", "Finalized attendance", "Payroll snapshot"].map((s, i, arr) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold text-gold-600">{`${i + 1}`.padStart(2, "0")}</span>{s}
                  {i < arr.length - 1 && <ArrowRight size={11} className="ml-auto text-ink-300" />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {adjFor && <AdjustmentModal row={adjFor} onClose={() => setAdjFor(null)} onDone={() => { setAdjFor(null); r.reload(); toast("Adjustment requested", "success", "Routed for approval."); }} />}
    </div>
  );
}
function AdjustmentModal({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<"CLOCK_IN" | "CLOCK_OUT" | "STATUS">("CLOCK_IN");
  const [value, setValue] = useState("08:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();
  return (
    <Modal open onClose={onClose} title={`Attendance adjustment — ${row.fullName}`} width="max-w-md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => {
        if (reason.trim().length < 8) { toast("Reason required", "error", "Provide a brief justification (min. 8 characters)."); return; }
        setBusy(true);
        try { await api.requestAdjustment({ employeeId: row.employeeId, date: row.date, kind, newValue: value, reason }); onDone(); }
        catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
      }}>Submit request</Button></>}>
      <div className="space-y-4">
        <Field label="Correction type" required>
          <Select value={kind} onChange={(e) => { const k = e.target.value as typeof kind; setKind(k); setValue(k === "STATUS" ? "OFFICIAL_BUSINESS" : "08:00"); }}>
            <option value="CLOCK_IN">Clock-in time</option><option value="CLOCK_OUT">Clock-out time</option><option value="STATUS">Day status</option>
          </Select>
        </Field>
        {kind === "STATUS" ? (
          <Field label="Status" required><Select value={value} onChange={(e) => setValue(e.target.value)}>
            {["OFFICIAL_BUSINESS", "ON_LEAVE", "ABSENT"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </Select></Field>
        ) : (
          <Field label="Corrected time" required><Input type="time" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        )}
        <Field label="Justification" required hint="Attached evidence is referenced in the audit trail.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Fingerprint sensor failed; security logbook entry no. 1234…" />
        </Field>
      </div>
    </Modal>
  );
}

/* ================= DTR ================= */
export function DTRPage() {
  const { user, toast } = useApp();
  const [empId, setEmpId] = useState(user?.employeeId ?? "");
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const isSelf = user?.employeeId === empId;
  const allowed = isSelf || canSee(user, "attendance.read");
  const empR = useApi(() => (canSee(user, "employees.read") ? api.listEmployees({ pageSize: 100 }) : Promise.resolve(null)), []);
  const r = useApi(() => (empId && allowed ? api.getDTR(empId, ym) : Promise.resolve(null)), [empId, ym]);
  const days = monthDays(ym);
  const byDate = new Map((r.data?.days ?? []).map((d) => [d.date, d]));
  const f = (m?: number) => (m == null ? "—" : fmtClock(m));
  return (
    <div>
      <PageHeader title="Daily Time Records" sub="CS Form 48-style monthly record, generated from finalized attendance."
        actions={<Button variant="outline" icon={Download} onClick={async () => {
          if (!empId) return;
          const csv = await api.dtrCsvDownload(empId, ym);
          downloadText(`dtr_${ym}.csv`, csv);
          toast("DTR exported", "success");
        }}>Export CSV</Button>} />
      <Card pad={false} className="anim-fade-up">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
          {canSee(user, "employees.read") && (
            <Select value={empId} onChange={(e) => setEmpId(e.target.value)} className="w-72">
              <option value="">Select employee…</option>
              {(empR.data?.rows ?? []).map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} — {e.employeeNo}</option>)}
            </Select>
          )}
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setYm(prevMonth(ym))}>‹</Button>
            <span className="min-w-36 text-center text-[13px] font-bold text-navy-900">{monthLabel(ym)}</span>
            <Button variant="ghost" size="sm" onClick={() => setYm(nextMonth(ym))}>›</Button>
          </div>
          <Button variant="ghost" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button>
          {r.data && <span className="ml-auto text-[12px] text-ink-400">{r.data.summary.present} present · {r.data.summary.absent} absent · OT {fmtMin(r.data.summary.otMin)}</span>}
        </div>
        {!empId && <p className="px-4 py-12 text-center text-sm text-ink-400">Select an employee to view their DTR.</p>}
        {empId && !allowed && <p className="px-4 py-12 text-center text-sm text-red-600">You may only view your own DTR with this role.</p>}
        {empId && allowed && r.data && (
          <div className="print-area overflow-x-auto">
            <div className="px-5 pb-2 pt-4 text-center">
              <div className="font-display text-[15px] font-extrabold uppercase tracking-wide text-navy-900">Daily Time Record</div>
              <div className="text-[12.5px] font-bold text-royal-700">{r.data.employee.firstName} {r.data.employee.lastName} · {r.data.position}</div>
              <div className="text-[11px] text-ink-400">{monthLabel(ym)} · {r.data.employee.employeeNo}</div>
            </div>
            <table className="w-full min-w-[720px] text-[12px]">
              <thead><tr className="bg-navy-900 text-left text-[10px] font-bold uppercase tracking-wide text-white">
                <th className="px-4 py-2">Date</th><th className="px-3 py-2">Day</th><th className="px-3 py-2">AM In</th><th className="px-3 py-2">PM Out</th>
                <th className="px-3 py-2 text-right">Hours</th><th className="px-3 py-2 text-right">Late</th><th className="px-3 py-2 text-right">UT</th><th className="px-3 py-2 text-right">OT</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody>
                {days.map((date) => {
                  const a = byDate.get(date);
                  const dow = new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short" });
                  const hol = r.data!.holidays.find((h) => h.date === date);
                  return (
                    <tr key={date} className={`border-b border-ink-100 ${["Sat", "Sun"].includes(dow) ? "bg-ink-50/60 text-ink-300" : hol ? "bg-navy-900/4" : ""}`}>
                      <td className="tabular px-4 py-1.5 font-semibold text-navy-900">{date.slice(8)}</td>
                      <td className="px-3 py-1.5">{dow}</td>
                      <td className="tabular px-3 py-1.5">{f(a?.clockIn)}</td>
                      <td className="tabular px-3 py-1.5">{f(a?.clockOut)}</td>
                      <td className="tabular px-3 py-1.5 text-right">{a?.totalMin ? hoursLabel(a.totalMin) : "—"}</td>
                      <td className="tabular px-3 py-1.5 text-right text-amber-600">{a?.lateMin || "—"}</td>
                      <td className="tabular px-3 py-1.5 text-right text-amber-600">{a?.undertimeMin || "—"}</td>
                      <td className="tabular px-3 py-1.5 text-right text-emerald-600">{a?.otMin || "—"}</td>
                      <td className="px-4 py-1.5">{a ? <StatusChip status={a.status} /> : hol ? <Tag tone="navy">{hol.name}</Tag> : <Tag tone="gray">{["Sat", "Sun"].includes(dow) ? "Rest day" : "No log"}</Tag>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-5 py-3 text-[10.5px] text-ink-400">Generated {new Date().toLocaleString("en-PH")} · Government HRIS · {r.data.employee.employeeNo}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================= adjustments ================= */
export function AdjustmentsPage() {
  const { user, toast } = useApp();
  const [tab, setTab] = useState("PENDING");
  const [page, setPage] = useState(1);
  const r = useApi(() => api.listAdjustments({ status: tab, page }), [tab, page]);
  const [confirm, setConfirm] = useState<{ id: string; approve: boolean; name: string } | null>(null);
  const canDecide = canSee(user, "attendance.adjust");
  type Adj = NonNullable<typeof r.data>["rows"][number];
  const decide = async (id: string, approve: boolean) => {
    try {
      await api.decideAdjustment(id, approve);
      toast(approve ? "Adjustment approved" : "Adjustment rejected", approve ? "success" : "info", "Attendance recomputed from the corrected values.");
      r.reload();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const cols: Col<Adj>[] = [
    { key: "employeeName", label: "Employee", sortValue: (x) => x.employeeName, render: (x) => <span className="font-bold text-navy-900">{x.employeeName}</span> },
    { key: "date", label: "Date", sortValue: (x) => x.date, render: (x) => <span className="tabular">{fmtDateMed(x.date)}</span> },
    { key: "kind", label: "Field", render: (x) => <Tag tone="blue">{x.kind.replace(/_/g, " ")}</Tag> },
    { key: "oldValue", label: "Was", render: (x) => <span className="tabular text-[12px]">{x.oldValue}</span> },
    { key: "newValue", label: "Requested", render: (x) => <span className="tabular text-[12px] font-bold text-royal-700">{x.newValue}</span> },
    { key: "reason", label: "Justification", className: "max-w-64", render: (x) => <span className="block truncate text-[12px] text-ink-500" title={x.reason}>{x.reason}</span> },
    { key: "status", label: "Status", render: (x) => <StatusChip status={x.status} />, sortValue: (x) => x.status },
    ...(canDecide ? [{
      key: "act", label: "", align: "right" as const,
      render: (x: Adj) => x.status === "PENDING" ? (
        <span className="flex justify-end gap-1.5">
          <Button size="sm" icon={CheckCircle2} onClick={() => setConfirm({ id: x.id, approve: true, name: x.employeeName })}>Approve</Button>
          <Button size="sm" variant="outline" icon={XCircle} onClick={() => setConfirm({ id: x.id, approve: false, name: x.employeeName })}>Reject</Button>
        </span>
      ) : <span className="text-[11px] text-ink-400">{x.decidedAt ? fmtDateMed(x.decidedAt.slice(0, 10)) : ""}</span>,
    }] : []),
  ];
  return (
    <div>
      <PageHeader title="Attendance Adjustments" sub="Raw biometric logs stay immutable — corrections are approved adjustments layered on top."
        actions={<Link to="/attendance"><Button variant="outline">Back to register</Button></Link>} />
      <div className="mb-4 flex gap-1.5">
        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button key={s} onClick={() => { setTab(s); setPage(1); }} className={`rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors ${tab === s ? "bg-navy-900 text-white" : "bg-white text-ink-500 hover:bg-royal-50"}`}>
            {s} {s === "PENDING" && (r.data?.total != null && tab === s ? `(${r.data.total})` : "")}
          </button>
        ))}
      </div>
      <Card pad={false} className="anim-fade-up">
        <DataTable rows={r.data?.rows ?? []} cols={cols} loading={r.loading} error={r.error ?? undefined} onRetry={r.reload}
          footer={r.data && <div className="flex justify-end"><Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} /></div>} />
      </Card>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} danger={confirm ? !confirm.approve : false}
        title={`${confirm?.approve ? "Approve" : "Reject"} adjustment`}
        body={`${confirm?.approve ? "Approve" : "Reject"} the attendance correction for ${confirm?.name}? ${confirm?.approve ? "Attendance will be recomputed from the corrected values." : "The original record remains unchanged."}`}
        confirmLabel={confirm?.approve ? "Approve correction" : "Reject request"}
        onConfirm={() => confirm && decide(confirm.id, confirm.approve)} />
    </div>
  );
}
