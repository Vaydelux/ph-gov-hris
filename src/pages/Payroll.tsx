import { BadgeCheck, Banknote, CalendarDays, CheckCircle2, Download, FileText, Landmark, Lock, PlayCircle, Printer, TrendingUp, Wallet, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { downloadText, fmtDateMed, fmtDateTime, num, php } from "../lib/core";
import type { EmployeePayroll, PayrollRunStatus } from "../lib/contracts";
import { canSee, useApi, useApp } from "../state/store";
import { Button, Card, EmptyState, InfoNote, KPI, Modal, Money, PageHeader, ProgressBar, SearchInput, SectionLabel, StatusChip, Tag } from "../components/ui";

const FLOW: PayrollRunStatus[] = ["DRAFT", "QUEUED", "COMPUTING", "COMPUTED", "VERIFIED", "APPROVED", "RELEASED"];

export function PayrollPage() {
  const { user, toast } = useApp();
  const nav = useNavigate();
  const r = useApi(() => api.payrollOverview(), []);
  const [generating, setGenerating] = useState(false);
  const canGenerate = canSee(user, "payroll.generate");
  const generate = async (periodId: string) => {
    setGenerating(true);
    try {
      const run = await api.generatePayroll(periodId);
      toast("Payroll generation queued", "info", "Background worker started — pipeline stages stream below.");
      nav(`/payroll/${run.id}`);
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to queue payroll", "error"); }
    finally { setGenerating(false); r.reload(); }
  };
  if (r.loading || !r.data) return <div><div className="skeleton mb-6 h-10 w-64" /><div className="grid gap-4 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-40" />)}</div></div>;
  return (
    <div>
      <PageHeader title="Payroll Operations" sub="Semi-monthly salary-grade payroll. Released runs are immutable — corrections flow through controlled adjustments." />
      <div className="stagger grid gap-4 lg:grid-cols-3">
        {r.data.periods.map((p) => (
          <Card key={p.id} className={p.closed ? "" : "border-gold-400/60 ring-1 ring-gold-400/30"}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-bold text-navy-900"><CalendarDays size={15} className="text-royal-600" />{p.label}</span>
              {p.closed ? <Tag tone="gray">Closed</Tag> : <Tag tone="green">Current period</Tag>}
            </div>
            <div className="mt-2 text-[12px] text-ink-400">Coverage {fmtDateMed(p.from)} → {fmtDateMed(p.to)} · Cutoff {fmtDateMed(p.cutoff)}</div>
            <div className="mt-4">
              {p.run ? (
                <button onClick={() => nav(`/payroll/${p.run!.id}`)} className="group flex w-full items-center justify-between rounded-lg border border-ink-100 bg-ink-50/50 px-3.5 py-3 transition-all hover:border-royal-300 hover:bg-royal-50/60">
                  <span className="text-left">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-400">Run status</span>
                    <span className="mt-0.5 block"><StatusChip status={p.run.status} /></span>
                  </span>
                  <span className="text-right">
                    {p.run.netCents > 0 && <span className="tabular font-display block text-[16px] font-extrabold text-navy-900">{php(p.run.netCents, { noDecimals: true })}</span>}
                    <span className="text-[11px] font-semibold text-royal-600 group-hover:underline">Open run →</span>
                  </span>
                </button>
              ) : canGenerate ? (
                <Button className="w-full" size="lg" variant="gold" loading={generating} icon={PlayCircle} onClick={() => generate(p.id)}>Generate payroll run</Button>
              ) : (
                <div className="rounded-lg border border-dashed border-ink-200 px-3.5 py-3 text-center text-[12.5px] text-ink-400">Awaiting generation by an authorized payroll officer</div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card pad={false} className="anim-fade-up mt-5">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h3 className="font-display text-[15px] font-bold text-navy-900">Payroll history</h3>
          <span className="text-[12px] text-ink-400">{r.data.runs.length} runs · snapshots are historical & reproducible</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-ink-200 bg-ink-50/70 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-400">
              <th className="px-5 py-2.5">Period</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Employees</th>
              <th className="px-3 py-2.5 text-right">Gross</th><th className="px-3 py-2.5 text-right">Deductions</th><th className="px-3 py-2.5 text-right">Net</th><th className="px-5 py-2.5 text-right">Released</th></tr></thead>
            <tbody>
              {r.data.runs.map((run) => (
                <tr key={run.id} onClick={() => nav(`/payroll/${run.id}`)} className="cursor-pointer border-b border-ink-100 transition-colors last:border-0 hover:bg-royal-50/50">
                  <td className="px-5 py-3 font-bold text-navy-900">{run.periodLabel}</td>
                  <td className="px-3 py-3"><StatusChip status={run.status} /></td>
                  <td className="tabular px-3 py-3 text-right">{run.employeeCount || "—"}</td>
                  <td className="tabular px-3 py-3 text-right">{run.grossCents ? php(run.grossCents, { noDecimals: true }) : "—"}</td>
                  <td className="tabular px-3 py-3 text-right text-red-600/80">{run.deductionsCents ? `(${php(run.deductionsCents, { noDecimals: true })})` : "—"}</td>
                  <td className="tabular px-3 py-3 text-right font-bold text-navy-900">{run.netCents ? php(run.netCents, { noDecimals: true }) : "—"}</td>
                  <td className="px-5 py-3 text-right text-[12px] text-ink-400">{run.releasedAt ? fmtDateMed(run.releasedAt.slice(0, 10)) : "—"}</td>
                </tr>
              ))}
              {r.data.runs.length === 0 && <tr><td colSpan={7} className="px-5 py-10"><EmptyState icon={Wallet} title="No payroll runs yet" hint="Generate the current period to begin." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ================= run detail ================= */
export function PayrollRunPage() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [slip, setSlip] = useState<EmployeePayroll | null>(null);
  const r = useApi(() => api.getRun(id!), [id]);
  const [acting, setActing] = useState("");
  const run = r.data?.run;

  useEffect(() => {
    if (run && ["QUEUED", "COMPUTING"].includes(run.status)) {
      const t = setInterval(r.reload, 750);
      return () => clearInterval(t);
    }
  }, [run?.status, r.reload]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setActing(label);
    try { await fn(); toast(`${label} complete`, "success"); r.reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Action failed", "error"); }
    finally { setActing(""); }
  };
  const bank = async () => {
    try {
      const res = await api.bankFile(id!);
      downloadText(res.filename, res.csv);
      toast("Bank file exported", "success", "Boundary export — the bank API integration plugs in here.");
    } catch (e) { toast(e instanceof Error ? e.message : "Export failed", "error"); }
  };

  const stageIdx = run ? FLOW.indexOf(run.status) : -1;
  const rows = useMemo(() => (r.data?.rows ?? []).filter((x) => `${x.snapshot.fullName} ${x.snapshot.employeeNo} ${x.snapshot.position}`.toLowerCase().includes(q.toLowerCase())), [r.data, q]);

  if (r.loading || !r.data || !run) return <div><div className="skeleton mb-6 h-10 w-80" /><div className="skeleton h-72 w-full" /></div>;
  if (r.error) return <Card><p className="text-sm text-red-600">{r.error}</p></Card>;

  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{run.periodLabel} <StatusChip status={run.status} /></span>}
        sub={<span>Run <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-royal-700">{run.id.slice(-10)}</code> · idempotency key <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px]">{run.idempotencyKey}</code></span>}
        actions={<Button variant="outline" onClick={() => nav("/payroll")}>All runs</Button>}
      />

      {["QUEUED", "COMPUTING"].includes(run.status) && (
        <Card className="anim-fade-up mb-4 border-royal-300/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="pulse-dot size-2 rounded-full bg-royal-500" /><h3 className="font-display text-[15px] font-bold text-navy-900">Payroll worker · {run.stage}</h3></div>
            <span className="tabular font-display text-xl font-extrabold text-royal-600">{Math.floor(run.progress)}%</span>
          </div>
          <div className="mt-3"><ProgressBar value={run.progress} /></div>
          <div className="mt-3 max-h-28 overflow-y-auto rounded-md bg-navy-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-300/90">
            {run.log.slice(-7).map((l, i) => <div key={i} className="anim-fade-in">▸ {l}</div>)}
          </div>
        </Card>
      )}

      <Card className="anim-fade-up mb-4">
        <div className="flex flex-wrap items-center gap-y-3">
          {FLOW.map((s, i) => {
            const done = i <= stageIdx && stageIdx >= 0;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide ${done ? "text-emerald-600" : "text-ink-300"}`}>
                  {done ? <CheckCircle2 size={15} /> : <span className="block size-[15px] rounded-full border-2 border-ink-200" />}{s.replace(/_/g, " ")}
                </div>
                {i < FLOW.length - 1 && <div className={`mx-1 h-0.5 w-4 sm:w-7 ${i < stageIdx ? "bg-emerald-500" : "bg-ink-200"}`} />}
              </div>
            );
          })}
          <div className="ml-auto flex flex-wrap gap-2">
            {canSee(user, "payroll.verify") && run.status === "COMPUTED" && <Button loading={acting === "Verification"} onClick={() => act("Verification", () => api.verifyRun(id!))} icon={BadgeCheck}>Verify totals</Button>}
            {canSee(user, "payroll.approve") && run.status === "VERIFIED" && <Button loading={acting === "Approval"} onClick={() => act("Approval", () => api.approveRun(id!))} icon={Landmark}>Approve run</Button>}
            {canSee(user, "payroll.release") && run.status === "APPROVED" && <Button variant="gold" loading={acting === "Release"} onClick={() => act("Release", () => api.releaseRun(id!))} icon={Banknote}>Release payroll</Button>}
            {canSee(user, "payroll.generate") && ["DRAFT", "QUEUED", "COMPUTING", "COMPUTED"].includes(run.status) && <Button variant="outline" loading={acting === "Cancel"} onClick={() => act("Cancel", () => api.cancelRun(id!))} icon={XCircle}>Cancel run</Button>}
            {canSee(user, "payroll.export") && run.status === "RELEASED" && <Button variant="navy" onClick={bank} icon={Download}>Bank file</Button>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-ink-100 pt-3 text-[11.5px] text-ink-400">
          {run.createdAt && <span>Generated {fmtDateTime(run.createdAt)}</span>}
          {run.verifiedAt && <span>Verified {fmtDateTime(run.verifiedAt)}</span>}
          {run.approvedAt && <span>Approved {fmtDateTime(run.approvedAt)}</span>}
          {run.releasedAt && <span className="font-semibold text-emerald-600">Released {fmtDateTime(run.releasedAt)}</span>}
        </div>
      </Card>

      <div className="stagger mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KPI label="Employees paid" value={num(run.employeeCount)} icon={Wallet} tone="navy" hint="Eligible active roster" />
        <KPI label="Gross pay" value={php(run.grossCents, { noDecimals: true })} icon={TrendingUp} tone="blue" hint="Basic + allowances + OT" />
        <KPI label="Total deductions" value={php(run.deductionsCents, { noDecimals: true })} icon={Landmark} tone="red" hint="GSIS · PhilHealth · Pag-IBIG · Tax · Loans" />
        <KPI label="Net disbursed" value={php(run.netCents, { noDecimals: true })} icon={Banknote} tone="gold" hint={run.status === "RELEASED" ? "Final & immutable" : "Pending release"} />
      </div>

      {run.status === "RELEASED" && <InfoNote tone="gold">This run is <b>released</b>. Details are snapshotted and immutable; the salary schedule, government rules, and attendance that produced it are preserved for audit reproduction.</InfoNote>}

      <Card pad={false} className="anim-fade-up mt-4">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search register…" className="w-64" />
          <span className="ml-auto text-[12px] text-ink-400">{rows.length} of {r.data.rows.length} detail lines</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead><tr className="border-b border-ink-200 bg-ink-50/70 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">
              <th className="px-4 py-2.5">Employee</th><th className="px-3 py-2.5">SG·Step</th>
              <th className="px-3 py-2.5 text-right">Basic</th><th className="px-3 py-2.5 text-right">Allow.</th><th className="px-3 py-2.5 text-right">Gross</th>
              <th className="px-3 py-2.5 text-right">GSIS</th><th className="px-3 py-2.5 text-right">PhilHealth</th><th className="px-3 py-2.5 text-right">Pag-IBIG</th>
              <th className="px-3 py-2.5 text-right">Tax</th><th className="px-3 py-2.5 text-right">Loan</th><th className="px-3 py-2.5 text-right">Net</th><th className="px-3 py-2.5"></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-b border-ink-100 transition-colors last:border-0 hover:bg-royal-50/40">
                  <td className="px-4 py-2.5"><div className="font-bold text-navy-900">{x.snapshot.fullName}</div><div className="text-[10.5px] text-ink-400">{x.snapshot.position} · {x.snapshot.department}</div></td>
                  <td className="px-3 py-2.5"><Tag tone="gold">{x.snapshot.grade}·{x.snapshot.step}</Tag></td>
                  <td className="tabular px-3 py-2.5 text-right">{php(x.basicCents)}</td>
                  <td className="tabular px-3 py-2.5 text-right">{php(x.grossCents - x.basicCents - x.otCents + x.lateDeductCents)}</td>
                  <td className="tabular px-3 py-2.5 text-right font-bold">{php(x.grossCents)}</td>
                  <td className="tabular px-3 py-2.5 text-right text-red-600/70">{php(x.gsisCents)}</td>
                  <td className="tabular px-3 py-2.5 text-right text-red-600/70">{php(x.philhealthCents)}</td>
                  <td className="tabular px-3 py-2.5 text-right text-red-600/70">{php(x.pagibigCents)}</td>
                  <td className="tabular px-3 py-2.5 text-right text-red-600/70">{php(x.wtaxCents)}</td>
                  <td className="tabular px-3 py-2.5 text-right text-red-600/70">{x.loanCents ? php(x.loanCents) : "—"}</td>
                  <td className="tabular px-3 py-2.5 text-right font-bold text-navy-900">{php(x.netCents)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {run.status === "RELEASED" && <Button size="sm" variant="subtle" icon={FileText} onClick={() => setSlip(x)}>Payslip</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="anim-fade-up mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionLabel>Government rules resolved for this run</SectionLabel>
          <div className="space-y-2 text-[12.5px]">
            {([["GSIS", r.data.rulesUsed.gsis], ["PhilHealth", r.data.rulesUsed.philhealth], ["Pag-IBIG", r.data.rulesUsed.pagibig], ["Withholding tax", r.data.rulesUsed.wtax]] as const).map(([k, rule]) => (
              <div key={k} className="flex items-center justify-between gap-2 rounded-md border border-ink-100 px-3 py-2">
                <span className="font-semibold text-navy-900">{k}</span>
                <span className="flex items-center gap-1.5 text-right text-[11.5px] text-ink-400">effective {rule?.effectiveFrom}{rule?.demo && <Tag tone="amber">DEMO</Tag>}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <SectionLabel>Computation pipeline (executed in worker)</SectionLabel>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] text-ink-600 sm:grid-cols-3">
            {["Resolve eligible employees", "Resolve effective SG/step", "Snapshot compensation", "Load finalized attendance", "Compute earnings & OT", "Compute allowances", "Resolve government rules", "Compute GSIS/PH/PI/Tax", "Compute loan deductions", "Compute net pay", "Validate totals", "Persist immutable details"].map((s, i) => (
              <span key={s} className="flex items-center gap-1.5"><span className="font-mono text-[10px] font-bold text-gold-600">{`${i + 1}`.padStart(2, "0")}</span>{s}</span>
            ))}
          </div>
        </Card>
      </div>

      {slip && <PayslipModal ep={slip} periodLabel={run.periodLabel} onClose={() => setSlip(null)} />}
    </div>
  );
}

/* ================= payslip ================= */
export function PayslipModal({ ep, periodLabel, number, onClose }: { ep: EmployeePayroll; periodLabel: string; number?: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Official payslip" width="max-w-2xl"
      footer={<><Button variant="outline" icon={Printer} onClick={() => window.print()}>Print</Button><Button onClick={onClose}>Close</Button></>}>
      <div className="print-area rounded-lg border border-ink-200 bg-white p-6">
        <div className="flex items-start justify-between border-b-2 border-navy-900 pb-4">
          <div>
            <div className="font-display text-[17px] font-black text-navy-900">DEPARTMENT OF CIVIC SERVICES</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-royal-600">Government HRIS · Payroll Division</div>
            <div className="mt-0.5 text-[11px] text-ink-400">Civic Center Bldg., Constitution Ave., Quezon City</div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">Payslip No.</div>
            <div className="font-display text-[14px] font-extrabold text-navy-900">{number ?? ep.id.slice(-8).toUpperCase()}</div>
            <div className="mt-1 text-[11px] text-ink-500">{periodLabel}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 border-b border-ink-100 py-4 text-[12.5px] sm:grid-cols-4">
          <div><span className="block text-[10px] font-bold uppercase text-ink-400">Employee</span><span className="font-bold text-navy-900">{ep.snapshot.fullName}</span></div>
          <div><span className="block text-[10px] font-bold uppercase text-ink-400">Employee No.</span>{ep.snapshot.employeeNo}</div>
          <div><span className="block text-[10px] font-bold uppercase text-ink-400">Position</span>{ep.snapshot.position}</div>
          <div><span className="block text-[10px] font-bold uppercase text-ink-400">SG–Step</span>SG {ep.snapshot.grade}, Step {ep.snapshot.step}</div>
        </div>
        <div className="grid gap-6 py-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-emerald-700">Earnings</div>
            {ep.earningLines.map((l) => (
              <div key={l.label} className="flex justify-between border-b border-dotted border-ink-200 py-1.5 text-[12.5px]">
                <span className="text-ink-600">{l.label}</span><Money cents={l.cents} signed className={l.cents < 0 ? "text-red-600" : ""} />
              </div>
            ))}
            <div className="mt-2 flex justify-between rounded-md bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-800"><span>GROSS PAY</span><span className="tabular">{php(ep.grossCents)}</span></div>
          </div>
          <div>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-red-700">Deductions</div>
            {ep.deductionLines.map((l) => (
              <div key={l.label} className="flex justify-between border-b border-dotted border-ink-200 py-1.5 text-[12.5px]">
                <span className="text-ink-600">{l.label}</span><span className="tabular font-semibold">({php(l.cents)})</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between rounded-md bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700"><span>TOTAL DEDUCTIONS</span><span className="tabular">({php(ep.totalDeductCents)})</span></div>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-navy-900 px-4 py-3.5 text-white">
          <span className="font-display text-[13px] font-bold uppercase tracking-[0.14em] text-gold-300">Net pay</span>
          <span className="tabular font-display text-[24px] font-black">{php(ep.netCents)}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-ink-400">
          <span className="flex items-center gap-1"><Lock size={11} /> Immutable payroll snapshot · {ep.snapshot.scheduleName}</span>
          <span>Attendance: {ep.attendanceSnapshot.present} present · {ep.attendanceSnapshot.lateDays} late · OT {ep.attendanceSnapshot.otMin}m</span>
        </div>
      </div>
    </Modal>
  );
}

/* ================= employee payslip list ================= */
export function MyPayslipsPage() {
  const r = useApi(() => api.myPayslips().catch(() => []), []);
  const [slip, setSlip] = useState<{ ep: EmployeePayroll; periodLabel: string; number: string } | null>(null);
  return (
    <div>
      <PageHeader title="My Payslips" sub="Every released payslip, reproducible from its payroll snapshot." />
      {r.loading && <div className="skeleton h-40 w-full" />}
      {r.data && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {r.data.map((p) => (
            <Card key={p.id} className="anim-fade-up transition-all hover:-translate-y-0.5 hover:shadow-lift">
              <div className="flex items-center justify-between"><Tag tone="gold">{p.periodLabel}</Tag><FileText size={16} className="text-royal-600" /></div>
              <div className="tabular font-display mt-3 text-[24px] font-black text-navy-900">{php(p.ep.netCents)}</div>
              <div className="mt-0.5 text-[12px] text-ink-400">Gross {php(p.ep.grossCents)} · Deductions {php(p.ep.totalDeductCents)}</div>
              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="text-[11px] text-ink-400">Slip <code className="font-bold text-navy-900">{p.number}</code></span>
                <Button size="sm" variant="subtle" onClick={() => setSlip({ ep: p.ep, periodLabel: p.periodLabel, number: p.number })}>View slip</Button>
              </div>
            </Card>
          ))}
          {r.data.length === 0 && <div className="sm:col-span-2 lg:col-span-3"><EmptyState icon={Wallet} title="No payslips yet" hint="Payslips appear after the next payroll release." /></div>}
        </div>
      )}
      {slip && <PayslipModal ep={slip.ep} periodLabel={slip.periodLabel} number={slip.number} onClose={() => setSlip(null)} />}
    </div>
  );
}
