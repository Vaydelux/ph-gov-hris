import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FilePlus2, History, Users, XCircle } from "lucide-react";
import { useState } from "react";
import api from "../lib/api";
import { fmtDateMed, monthDays, monthLabel, nextMonth, prevMonth, todayISO } from "../lib/core";
import { canSee, useApi, useApp } from "../state/store";
import { Button, Card, ConfirmDialog, DataTable, Field, Input, Modal, PageHeader, Pager, SearchInput, Select, SectionLabel, StatusChip, Tag, Textarea, type Col } from "../components/ui";

type Req = Awaited<ReturnType<typeof api.listLeaveRequests>>["rows"][number];

export function LeavePage() {
  const { user, toast } = useApp();
  const [tab, setTab] = useState<"requests" | "calendar" | "ledger">("requests");
  const [scope, setScope] = useState<"mine" | "team" | "all">(canSee(user, "leave.view.team") ? "all" : "mine");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [fileOpen, setFileOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; action: "APPROVE" | "REJECT" | "CANCEL"; name: string } | null>(null);
  const r = useApi(() => api.listLeaveRequests({ scope, status: status || undefined, q, page }), [scope, status, q, page]);
  const bal = useApi(() => api.leaveBalances().catch(() => []), []);
  const canTeam = canSee(user, "leave.view.team");
  const canSup = canSee(user, "leave.approve.supervisor");
  const canHr = canSee(user, "leave.approve.hr");

  const decide = async (id: string, action: "APPROVE" | "REJECT" | "CANCEL") => {
    try {
      if (action === "CANCEL") await api.cancelLeave(id);
      else await api.decideLeave(id, action);
      toast(action === "APPROVE" ? "Leave approved" : action === "REJECT" ? "Leave rejected" : "Leave cancelled", action === "APPROVE" ? "success" : "info");
      r.reload(); bal.reload();
    } catch (e) { toast(e instanceof Error ? e.message : "Action failed", "error"); }
  };
  const cols: Col<Req>[] = [
    ...(canTeam ? [{ key: "employeeName", label: "Employee", sortValue: (x: Req) => x.employeeName, render: (x: Req) => <span className="font-bold text-navy-900">{x.employeeName}</span> }] : []),
    { key: "leaveType", label: "Type", sortValue: (x) => x.leaveType.code, render: (x) => <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: x.leaveType.color }} /><span className="text-[12.5px] font-semibold">{x.leaveType.code}</span></span> },
    { key: "range", label: "Period", sortValue: (x) => x.startDate, render: (x) => <span className="tabular text-[12.5px]">{fmtDateMed(x.startDate)} → {fmtDateMed(x.endDate)}</span> },
    { key: "workingDays", label: "Days", align: "right", sortValue: (x) => x.workingDays, render: (x) => <span className="tabular font-bold">{x.workingDays}</span> },
    { key: "reason", label: "Reason", className: "max-w-56", render: (x) => <span className="block truncate text-[12px] text-ink-500" title={x.reason}>{x.reason}</span> },
    { key: "stage", label: "Approvals", render: (x) => (
      <span className="flex gap-1">
        {(["SUPERVISOR", "HR"] as const).map((s) => {
          const step = x.approvals.find((a) => a.stage === s);
          return <Tag key={s} tone={step ? (step.action === "APPROVE" ? "green" : "red") : "gray"}>{s} {step ? (step.action === "APPROVE" ? "✓" : "✗") : "·"}</Tag>;
        })}
      </span>) },
    { key: "status", label: "Status", sortValue: (x) => x.status, render: (x) => <StatusChip status={x.status} /> },
    {
      key: "act", label: "", align: "right",
      render: (x) => {
        const mine = x.employeeId === user?.employeeId;
        return (
          <span className="flex justify-end gap-1.5">
            {x.status === "PENDING_SUPERVISOR" && canSup && <Button size="sm" icon={CheckCircle2} onClick={() => setConfirm({ id: x.id, action: "APPROVE", name: x.employeeName })}>Approve</Button>}
            {x.status === "PENDING_HR" && canHr && <Button size="sm" icon={CheckCircle2} onClick={() => setConfirm({ id: x.id, action: "APPROVE", name: x.employeeName })}>Approve</Button>}
            {["PENDING_SUPERVISOR", "PENDING_HR"].includes(x.status) && (canSup || canHr) && <Button size="sm" variant="outline" icon={XCircle} onClick={() => setConfirm({ id: x.id, action: "REJECT", name: x.employeeName })}>Reject</Button>}
            {mine && ["PENDING_SUPERVISOR", "PENDING_HR", "APPROVED"].includes(x.status) && <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: x.id, action: "CANCEL", name: "your" })}>Cancel</Button>}
          </span>
        );
      },
    },
  ];
  return (
    <div>
      <PageHeader title="Leave Management" sub="Ledger-based balances with supervisor → HR approval stages. Overlaps and insufficient balances are rejected by the service layer."
        actions={canSee(user, "leave.file") && <Button icon={FilePlus2} onClick={() => setFileOpen(true)}>File leave</Button>} />
      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(bal.data ?? []).map((b, i) => (
          <Card key={b.id} className="!p-4">
            <div className="flex items-center gap-3" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="rounded-md p-2.5" style={{ background: `${b.color}18`, color: b.color }}><CalendarDays size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{b.code} · {b.name}</div>
                <div className="font-display text-[20px] font-extrabold text-navy-900">{b.days} <span className="text-[12px] font-semibold text-ink-400">/ {b.annualDays} days</span></div>
              </div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className="anim-grow-x h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (b.days / b.annualDays) * 100))}%`, background: b.color }} />
            </div>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {([["requests", "Requests"], ["calendar", "Team calendar"], ["ledger", "My ledger"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors ${tab === k ? "bg-navy-900 text-white" : "bg-white text-ink-500 hover:bg-royal-50"}`}>{label}</button>
        ))}
      </div>

      {tab === "requests" && (
        <Card pad={false} className="anim-fade-up">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
            {canTeam && (
              <Select value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); setPage(1); }} className="w-44">
                <option value="all">All requests</option><option value="team">My scope</option><option value="mine">Mine only</option>
              </Select>
            )}
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-48">
              <option value="">All statuses</option>
              {["PENDING_SUPERVISOR", "PENDING_HR", "APPROVED", "REJECTED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </Select>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search…" className="w-48" />
            <span className="ml-auto text-[12px] text-ink-400">{r.data?.total ?? "…"} requests</span>
          </div>
          <DataTable rows={r.data?.rows ?? []} cols={cols} loading={r.loading} error={r.error ?? undefined} onRetry={r.reload}
            footer={r.data && <div className="flex justify-end"><Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} /></div>} />
        </Card>
      )}
      {tab === "calendar" && <TeamCalendar />}
      {tab === "ledger" && <MyLedger />}

      {fileOpen && <FileLeaveModal onClose={() => setFileOpen(false)} onDone={() => { setFileOpen(false); r.reload(); bal.reload(); toast("Leave filed", "success", "Routed to your supervisor for approval."); }} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        danger={confirm?.action !== "APPROVE"}
        title={`${confirm?.action === "APPROVE" ? "Approve" : confirm?.action === "REJECT" ? "Reject" : "Cancel"} leave`}
        body={confirm?.action === "APPROVE" ? `Approve ${confirm.name} leave request? Approved leaves debit the ledger immediately.` : confirm?.action === "REJECT" ? `Reject ${confirm.name} leave request?` : "Cancel this leave? Approved credits are reversed via a ledger REVERSAL entry."}
        confirmLabel={confirm?.action === "APPROVE" ? "Approve leave" : confirm?.action === "REJECT" ? "Reject request" : "Cancel leave"}
        onConfirm={() => confirm && decide(confirm.id, confirm.action)} />
    </div>
  );
}

function FileLeaveModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const types = useApi(() => api.leaveBalances(), []);
  const [f, setF] = useState({ leaveTypeId: "lt_vl", startDate: todayISO(), endDate: todayISO(), reason: "", docName: "" });
  const [busy, setBusy] = useState(false);
  const sel = (types.data ?? []).find((t) => t.id === f.leaveTypeId);
  return (
    <Modal open onClose={onClose} title="File leave request" width="max-w-lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => {
        if (f.reason.trim().length < 10) { toast("Reason too short", "error", "Explain the purpose of the leave (min. 10 characters)."); return; }
        setBusy(true);
        try { await api.fileLeave({ ...f, docName: f.docName || undefined }); onDone(); }
        catch (e) { toast(e instanceof Error ? e.message : "Filing failed", "error"); } finally { setBusy(false); }
      }}>Submit request</Button></>}>
      <div className="space-y-4">
        <Field label="Leave type" required>
          <Select value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })}>
            {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} — {t.days} day(s) available</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" required><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} /></Field>
          <Field label="To" required><Input type="date" min={f.startDate} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        </div>
        {sel && f.startDate <= f.endDate && <p className="rounded-md bg-royal-50 px-3 py-2 text-[12px] text-royal-800">Working days are computed server-side (weekends & holidays excluded). Balance after approval: <b className="tabular">{Math.max(0, sel.days)} d</b> available.</p>}
        {sel?.requiresDoc && (
          <Field label="Supporting document" hint="Medical certificate required for sick leave beyond 3 days.">
            <Input value={f.docName} onChange={(e) => setF({ ...f, docName: e.target.value })} placeholder="medical_certificate.pdf" />
          </Field>
        )}
        <Field label="Reason" required><Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="State the purpose of this leave…" /></Field>
      </div>
    </Modal>
  );
}
function TeamCalendar() {
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const r = useApi(() => api.teamLeaveCalendar(ym), [ym]);
  const days = monthDays(ym);
  const firstDow = new Date(`${ym}-01T00:00:00`).getDay();
  const leaves = r.data ?? [];
  const onDay = (date: string) => leaves.filter((l) => l.start <= date && l.end >= date);
  return (
    <Card className="anim-fade-up">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[15px] font-bold text-navy-900">Approved leave — {monthLabel(ym)}</h3>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setYm(prevMonth(ym))} aria-label="Previous month" />
          <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => setYm(nextMonth(ym))} aria-label="Next month" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10.5px] font-bold uppercase tracking-wide text-ink-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
        {days.map((date) => {
          const items = onDay(date);
          const isToday = date === todayISO();
          return (
            <div key={date} className={`min-h-[74px] rounded-md border p-1.5 transition-colors ${isToday ? "border-gold-400 bg-gold-50/50" : items.length ? "border-royal-200 bg-royal-50/40" : "border-ink-100 bg-white"}`}>
              <div className={`text-[11px] font-bold ${isToday ? "text-gold-700" : "text-ink-400"}`}>{Number(date.slice(8))}</div>
              <div className="mt-0.5 space-y-0.5">
                {items.slice(0, 2).map((l) => (
                  <div key={l.id} className="truncate rounded px-1 py-0.5 text-[9.5px] font-bold text-white" style={{ background: l.type.color }} title={`${l.name} — ${l.type.name}`}>{l.name.split(" ")[0]}</div>
                ))}
                {items.length > 2 && <div className="text-[9.5px] font-bold text-royal-600">+{items.length - 2} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
function MyLedger() {
  const { user } = useApp();
  const r = useApi(() => (user?.employeeId ? api.leaveLedger(user.employeeId) : Promise.resolve([])), [user?.employeeId]);
  return (
    <Card className="anim-fade-up" pad={false}>
      <div className="border-b border-ink-100 px-4 py-3">
        <h3 className="font-display flex items-center gap-2 text-[15px] font-bold text-navy-900"><History size={15} className="text-royal-600" /> Leave ledger</h3>
        <p className="text-[11.5px] text-ink-400">Balance = Σ credits − Σ debits. Every entry cites its source.</p>
      </div>
      <div className="divide-y divide-ink-100">
        {(r.data ?? []).map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
            <Tag tone={l.type === "DEBIT" ? "red" : l.type === "CREDIT" ? "green" : l.type === "REVERSAL" ? "blue" : "amber"}>{l.type}</Tag>
            <Tag tone="navy">{l.typeCode}</Tag>
            <span className="min-w-0 flex-1 truncate text-ink-500">{l.memo}</span>
            <span className="text-[11px] text-ink-300">{l.at.slice(0, 10)}</span>
            <span className={`tabular w-16 text-right font-bold ${l.type === "DEBIT" ? "text-red-600" : "text-emerald-600"}`}>{l.type === "DEBIT" ? "−" : "+"}{l.daysH / 100} d</span>
          </div>
        ))}
        {(r.data ?? []).length === 0 && !r.loading && <p className="px-4 py-10 text-center text-[13px] text-ink-400">No ledger entries for this account.</p>}
      </div>
    </Card>
  );
}
void Users;
