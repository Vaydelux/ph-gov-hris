import { BadgeCheck, Coins, Eye, Gift, Landmark, PiggyBank, Plus, ScrollText, ToggleLeft, ToggleRight, XCircle } from "lucide-react";
import { useState } from "react";
import api from "../lib/api";
import { fmtDateMed, fmtDateTime, php, toCents, todayISO } from "../lib/core";
import { canSee, useApi, useApp } from "../state/store";
import { Button, Card, DataTable, EmptyState, Field, InfoNote, Input, KPI, Modal, PageHeader, Pager, SearchInput, SectionLabel, Select, StatusChip, Tag, Textarea, type Col } from "../components/ui";

/* ================= DEDUCTIONS ================= */
export function DeductionsPage() {
  const { user, toast } = useApp();
  const r = useApi(() => api.deductionSchemes(), []);
  const runs = useApi(() => api.payrollOverview().then((o) => o.runs.filter((x) => x.status === "RELEASED")).catch(() => []), []);
  const [runId, setRunId] = useState("");
  const remit = useApi(() => (runId ? api.remittanceSummary(runId) : Promise.resolve(null)), [runId]);
  const [addOpen, setAddOpen] = useState(false);
  const canManage = canSee(user, "deductions.manage");
  if (r.loading || !r.data) return <div><div className="skeleton mb-6 h-10 w-72" /><div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-44" />)}</div></div>;
  return (
    <div>
      <PageHeader title="Government Deductions" sub="GSIS, PhilHealth, Pag-IBIG and withholding tax — effective-dated tables so released history is always reproducible."
        actions={canManage && <Button icon={Plus} onClick={() => setAddOpen(true)}>New effective-dated rule</Button>} />
      <InfoNote tone="amber">Tables shown are <b>demo configuration</b> (rule versions are flagged DEMO in the database). Historical runs keep the rule version effective when computed — editing rates never rewrites released payroll.</InfoNote>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {r.data.map((s) => {
          const latest = s.rules[0];
          return (
            <Card key={s.id} className="anim-fade-up">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2"><Landmark size={16} className="text-royal-600" /><h3 className="font-display text-[15px] font-bold text-navy-900">{s.name}</h3></div>
                  <p className="mt-1 text-[12px] text-ink-400">{s.description}</p>
                </div>
                <Tag tone="navy">{s.code}</Tag>
              </div>
              {s.code !== "WTAX" && latest && (
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  <div className="rounded-md bg-ink-50/60 p-2.5 text-center"><div className="text-[10px] font-bold uppercase text-ink-400">Employee</div><div className="font-display text-[17px] font-extrabold text-navy-900">{((latest.employeeBps ?? 0) / 100).toFixed(2)}%</div></div>
                  <div className="rounded-md bg-ink-50/60 p-2.5 text-center"><div className="text-[10px] font-bold uppercase text-ink-400">Employer</div><div className="font-display text-[17px] font-extrabold text-navy-900">{((latest.employerBps ?? 0) / 100).toFixed(2)}%</div></div>
                  <div className="rounded-md bg-ink-50/60 p-2.5 text-center"><div className="text-[10px] font-bold uppercase text-ink-400">Basis cap</div><div className="font-display text-[17px] font-extrabold text-navy-900">{latest.monthlyCapCents ? php(latest.monthlyCapCents, { noDecimals: true }) : "—"}</div></div>
                </div>
              )}
              {s.code === "WTAX" && s.brackets.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-md border border-ink-100">
                  <table className="w-full text-[11.5px]">
                    <thead><tr className="bg-ink-50/70 text-left text-[9.5px] font-bold uppercase tracking-wide text-ink-400"><th className="px-3 py-1.5">Taxable (semi-monthly)</th><th className="px-3 py-1.5 text-right">Base</th><th className="px-3 py-1.5 text-right">Rate</th></tr></thead>
                    <tbody>{s.brackets.map((b) => (
                      <tr key={b.id} className="border-t border-ink-100">
                        <td className="tabular px-3 py-1.5">{php(b.fromCents, { noDecimals: true })} {b.toCents ? `– ${php(b.toCents, { noDecimals: true })}` : "& above"}</td>
                        <td className="tabular px-3 py-1.5 text-right">{php(b.baseCents)}</td>
                        <td className="tabular px-3 py-1.5 text-right font-bold">{b.rateBps / 100}%</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-[11.5px] text-ink-400">
                <span>Latest effectivity: <b className="text-ink-700">{latest?.effectiveFrom}</b></span>
                <span className="flex items-center gap-1.5">{latest?.demo && <Tag tone="amber">DEMO</Tag>}<span>{s.rules.length} version{s.rules.length > 1 ? "s" : ""}</span></span>
              </div>
            </Card>
          );
        })}
      </div>

      <Card pad={false} className="anim-fade-up mt-5">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
          <h3 className="font-display text-[15px] font-bold text-navy-900">Monthly remittance preview</h3>
          <Select value={runId} onChange={(e) => setRunId(e.target.value)} className="w-72">
            <option value="">Select a released payroll run…</option>
            {(runs.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.periodLabel}</option>)}
          </Select>
        </div>
        {remit.data ? (
          <>
            <div className="grid grid-cols-2 gap-3 px-4 py-4 lg:grid-cols-4">
              {[["GSIS", remit.data.gsis], ["PhilHealth", remit.data.philhealth], ["Pag-IBIG", remit.data.pagibig], ["Withholding tax", remit.data.wtax]].map(([l, v]) => (
                <div key={String(l)} className="rounded-lg border border-ink-100 bg-ink-50/50 p-3.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">{l} remittance</div>
                  <div className="tabular font-display mt-1 text-[19px] font-extrabold text-navy-900">{php(Number(v))}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto border-t border-ink-100">
              <table className="w-full min-w-[640px] text-[12.5px]">
                <thead><tr className="bg-ink-50/70 text-left text-[10px] font-bold uppercase tracking-wide text-ink-400"><th className="px-4 py-2">Employee</th><th className="px-3 py-2 text-right">GSIS</th><th className="px-3 py-2 text-right">PhilHealth</th><th className="px-3 py-2 text-right">Pag-IBIG</th><th className="px-3 py-2 text-right">WTAX</th></tr></thead>
                <tbody>{remit.data.perEmployee.slice(0, 10).map((x) => (
                  <tr key={x.name} className="border-t border-ink-100"><td className="px-4 py-2 font-semibold text-navy-900">{x.name}</td><td className="tabular px-3 py-2 text-right">{php(x.gsis)}</td><td className="tabular px-3 py-2 text-right">{php(x.philhealth)}</td><td className="tabular px-3 py-2 text-right">{php(x.pagibig)}</td><td className="tabular px-3 py-2 text-right">{php(x.wtax)}</td></tr>
                ))}</tbody>
              </table>
              {remit.data.perEmployee.length > 10 && <p className="px-4 py-2.5 text-[11.5px] text-ink-400">Showing first 10 of {remit.data.perEmployee.length} — full remittance available via Reports → REMITTANCE.</p>}
            </div>
          </>
        ) : <p className="px-4 py-8 text-center text-sm text-ink-400">Select a released run to preview statutory remittances.</p>}
      </Card>
      {addOpen && <AddRuleModal onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); r.reload(); toast("Rule versioned", "success", "Applies to payroll computed on/after its effectivity."); }} />}
    </div>
  );
}
function AddRuleModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState({ schemeId: "sch_gsis", effectiveFrom: `${new Date().getFullYear() + 1}-01-01`, employeeBps: "9", employerBps: "12.5", monthlyCap: "", note: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Add effective-dated contribution rule" width="max-w-md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => {
        if (!f.note.trim()) { toast("Cite the source", "error", "Note the issuing circular (e.g., GSIS Memorandum Circular No…)."); return; }
        setBusy(true);
        try {
          await api.addContributionRule(f.schemeId, {
            effectiveFrom: f.effectiveFrom, employeeBps: Math.round(Number(f.employeeBps) * 100) || undefined,
            employerBps: Math.round(Number(f.employerBps) * 100) || undefined,
            monthlyCapCents: f.monthlyCap ? toCents(Number(f.monthlyCap)) : undefined, note: f.note,
          });
          onDone();
        } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
      }}>Publish rule version</Button></>}>
      <div className="space-y-4">
        <Field label="Scheme" required>
          <Select value={f.schemeId} onChange={(e) => setF({ ...f, schemeId: e.target.value })}>
            <option value="sch_gsis">GSIS</option><option value="sch_ph">PhilHealth</option><option value="sch_pi">Pag-IBIG</option>
          </Select>
        </Field>
        <Field label="Effective from" required hint="Must be after the latest version — past versions are immutable."><Input type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Employee share (%)" required><Input value={f.employeeBps} onChange={(e) => setF({ ...f, employeeBps: e.target.value })} placeholder="9" /></Field>
          <Field label="Employer share (%)"><Input value={f.employerBps} onChange={(e) => setF({ ...f, employerBps: e.target.value })} placeholder="12.5" /></Field>
        </div>
        <Field label="Monthly basis cap (PHP)"><Input value={f.monthlyCap} onChange={(e) => setF({ ...f, monthlyCap: e.target.value })} placeholder="100000" /></Field>
        <Field label="Issuance / note" required><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g., Per GSIS MC No. ___, s. 2027 — replace demo table after validation" /></Field>
        <InfoNote tone="amber">Production deployments must validate every rate against the current official issuance before real payroll.</InfoNote>
      </div>
    </Modal>
  );
}

/* ================= ALLOWANCES ================= */
export function AllowancesPage() {
  const { user, toast } = useApp();
  const canManage = canSee(user, "allowances.manage");
  const types = useApi(() => api.allowanceTypes(), []);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const r = useApi(() => api.allowanceAssignments({ q, page }), [q, page]);
  const [grantOpen, setGrantOpen] = useState(false);
  const toggle = async (id: string, active: boolean) => {
    try { await api.setAllowanceActive(id, active); toast(active ? "Allowance activated" : "Allowance deactivated", active ? "success" : "info", "Takes effect on the next payroll computation."); r.reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  type Row = NonNullable<typeof r.data>["rows"][number];
  const cols: Col<Row>[] = [
    { key: "employeeName", label: "Employee", sortValue: (x) => x.employeeName, render: (x) => <span className="font-bold text-navy-900">{x.employeeName}</span> },
    { key: "typeName", label: "Allowance", sortValue: (x) => x.typeName, render: (x) => <Tag tone="blue">{x.typeName}</Tag> },
    { key: "monthlyCents", label: "Monthly", align: "right", sortValue: (x) => x.monthlyCents, render: (x) => <span className="tabular font-semibold">{php(x.monthlyCents)}</span> },
    { key: "effectiveFrom", label: "Effective", sortValue: (x) => x.effectiveFrom, render: (x) => <span className="tabular text-[12.5px]">{fmtDateMed(x.effectiveFrom)}</span> },
    { key: "active", label: "State", sortValue: (x) => String(x.active), render: (x) => (x.active ? <Tag tone="green">Active</Tag> : <Tag tone="gray">Inactive</Tag>) },
    ...(canManage ? [{ key: "act", label: "", align: "right" as const, render: (x: Row) => (
      <Button size="sm" variant="ghost" icon={x.active ? ToggleRight : ToggleLeft} onClick={() => toggle(x.id, !x.active)}>{x.active ? "Deactivate" : "Activate"}</Button>
    ) }] : []),
  ];
  return (
    <div>
      <PageHeader title="Allowances" sub="Recurring compensation on top of basic salary. History is never deleted once it feeds released payroll."
        actions={canManage && <Button icon={Plus} onClick={() => setGrantOpen(true)}>Grant allowance</Button>} />
      <div className="stagger mb-4 flex flex-wrap gap-3">
        {(types.data ?? []).map((t, i) => (
          <div key={t.id} className="anim-fade-up flex items-center gap-3 rounded-lg border border-ink-200/70 bg-white px-4 py-3 shadow-card" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="rounded-md bg-gold-50 p-2 text-gold-600"><Gift size={16} /></span>
            <div>
              <div className="text-[13px] font-bold text-navy-900">{t.name}</div>
              <div className="tabular text-[11.5px] text-ink-400">{php(t.monthlyCents)}/mo · {t.code}{t.taxable ? " · taxable" : ""}</div>
            </div>
          </div>
        ))}
      </div>
      <Card pad={false} className="anim-fade-up">
        <div className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search employee…" className="w-64" />
          <span className="ml-auto text-[12px] text-ink-400">{r.data?.total ?? "…"} assignments</span>
        </div>
        <DataTable rows={r.data?.rows ?? []} cols={cols} loading={r.loading} error={r.error ?? undefined} onRetry={r.reload}
          footer={r.data && <div className="flex justify-end"><Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} /></div>} />
      </Card>
      {grantOpen && <GrantModal onClose={() => setGrantOpen(false)} onDone={() => { setGrantOpen(false); r.reload(); toast("Allowance granted", "success"); }} />}
    </div>
  );
}
function GrantModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const types = useApi(() => api.allowanceTypes(), []);
  const emps = useApi(() => api.listEmployees({ pageSize: 100 }), []);
  const [f, setF] = useState({ employeeId: "", allowanceTypeId: "al_pera", monthly: "2000", effectiveFrom: todayISO() });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Grant allowance" width="max-w-md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => {
        if (!f.employeeId) { toast("Select an employee", "error"); return; }
        setBusy(true);
        try { await api.grantAllowance({ employeeId: f.employeeId, allowanceTypeId: f.allowanceTypeId, monthlyCents: toCents(Number(f.monthly) || 0), effectiveFrom: f.effectiveFrom }); onDone(); }
        catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
      }}>Grant</Button></>}>
      <div className="space-y-4">
        <Field label="Employee" required>
          <Select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
            <option value="">Select…</option>
            {(emps.data?.rows ?? []).map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} — {e.employeeNo}</option>)}
          </Select>
        </Field>
        <Field label="Allowance type" required>
          <Select value={f.allowanceTypeId} onChange={(e) => {
            const t = (types.data ?? []).find((x) => x.id === e.target.value);
            setF({ ...f, allowanceTypeId: e.target.value, monthly: t ? String(t.monthlyCents / 100) : f.monthly });
          }}>
            {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Monthly amount (PHP)" required><Input value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} /></Field>
        <Field label="Effective from" required><Input type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ================= LOANS ================= */
type LoanRow = Awaited<ReturnType<typeof api.listLoans>>["rows"][number];
export function LoansPage() {
  const { user, toast } = useApp();
  const canManage = canSee(user, "loans.manage");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const r = useApi(() => api.listLoans({ q, status: status || undefined, page }), [q, status, page]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const rows = r.data?.rows ?? [];
  const outstanding = rows.filter((x) => x.status === "ACTIVE").reduce((s, x) => s + x.balanceCents, 0);
  const monthly = rows.filter((x) => x.status === "ACTIVE").reduce((s, x) => s + x.installmentCents, 0);
  const review = async (id: string, action: "START_REVIEW" | "APPROVE" | "REJECT") => {
    try { await api.reviewLoan(id, action); toast(action === "APPROVE" ? "Loan approved & disbursed" : action === "REJECT" ? "Loan rejected" : "Review started", action === "REJECT" ? "info" : "success"); r.reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const cols: Col<LoanRow>[] = [
    { key: "refNo", label: "Ref", render: (x) => <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-bold text-navy-900">{x.refNo}</code> },
    { key: "employeeName", label: "Employee", sortValue: (x) => x.employeeName, render: (x) => <span className="font-bold text-navy-900">{x.employeeName}</span> },
    { key: "typeName", label: "Type", render: (x) => <Tag tone="blue">{x.typeName}</Tag> },
    { key: "amount", label: "Amount", align: "right", sortValue: (x) => x.approvedAmountCents ?? x.appliedAmountCents, render: (x) => <span className="tabular font-semibold">{php(x.approvedAmountCents ?? x.appliedAmountCents)}</span> },
    { key: "installmentCents", label: "Per cut", align: "right", render: (x) => <span className="tabular">{php(x.installmentCents)}</span> },
    { key: "balanceCents", label: "Balance", align: "right", sortValue: (x) => x.balanceCents, render: (x) => <span className="tabular font-bold text-navy-900">{php(x.balanceCents)}</span> },
    { key: "status", label: "Status", sortValue: (x) => x.status, render: (x) => <StatusChip status={x.status} /> },
    {
      key: "act", label: "", align: "right",
      render: (x) => (
        <span className="flex justify-end gap-1.5">
          {canManage && x.status === "SUBMITTED" && <Button size="sm" variant="subtle" onClick={() => review(x.id, "START_REVIEW")}>Review</Button>}
          {canManage && ["SUBMITTED", "UNDER_REVIEW"].includes(x.status) && <>
            <Button size="sm" icon={BadgeCheck} onClick={() => review(x.id, "APPROVE")}>Approve</Button>
            <Button size="sm" variant="outline" icon={XCircle} onClick={() => review(x.id, "REJECT")}>Reject</Button>
          </>}
          <Button size="sm" variant="ghost" icon={Eye} onClick={() => setDetailId(x.id)}>Ledger</Button>
        </span>
      ),
    },
  ];
  return (
    <div>
      <PageHeader title="Salary Loans" sub="Ledger-based balances — every disbursement and amortization is a transaction, and payroll never deducts an installment twice."
        actions={canSee(user, "loans.apply") && <Button icon={Plus} onClick={() => setApplyOpen(true)}>Apply for loan</Button>} />
      <div className="stagger mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <KPI label="Active loans" value={rows.filter((x) => x.status === "ACTIVE").length} icon={Coins} tone="navy" hint="In current scope" />
        <KPI label="Outstanding balance" value={php(outstanding, { noDecimals: true })} icon={PiggyBank} tone="gold" hint="Principal remaining" />
        <KPI label="Deducted per cut" value={php(monthly, { noDecimals: true })} icon={Landmark} tone="blue" hint="Scheduled amortizations" />
      </div>
      <Card pad={false} className="anim-fade-up">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name or ref…" className="w-64" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44">
            <option value="">All statuses</option>
            {["SUBMITTED", "UNDER_REVIEW", "ACTIVE", "PAID", "REJECTED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </Select>
          <span className="ml-auto text-[12px] text-ink-400">{r.data?.total ?? "…"} loans</span>
        </div>
        <DataTable rows={rows} cols={cols} loading={r.loading} error={r.error ?? undefined} onRetry={r.reload}
          footer={r.data && <div className="flex justify-end"><Pager page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} /></div>} />
      </Card>
      {applyOpen && <ApplyLoanModal onClose={() => setApplyOpen(false)} onDone={() => { setApplyOpen(false); r.reload(); }} />}
      {detailId && <LoanDrawer id={detailId} onClose={() => { setDetailId(null); r.reload(); }} />}
    </div>
  );
}
function ApplyLoanModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const types = useApi(() => api.loanTypes(), []);
  const [f, setF] = useState({ loanTypeId: "ln_sal", amount: "50000", termMonths: 24 });
  const [busy, setBusy] = useState(false);
  const type = (types.data ?? []).find((t) => t.id === f.loanTypeId);
  return (
    <Modal open onClose={onClose} title="Loan application" width="max-w-md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => {
        setBusy(true);
        try {
          await api.applyLoan({ loanTypeId: f.loanTypeId, amountCents: toCents(Number(f.amount) || 0), termMonths: Number(f.termMonths) });
          toast("Application submitted", "success", "Routed to the payroll office for review.");
          onDone();
        } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
      }}>Submit application</Button></>}>
      <div className="space-y-4">
        <Field label="Loan type" required>
          <Select value={f.loanTypeId} onChange={(e) => setF({ ...f, loanTypeId: e.target.value })}>
            {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} — up to {php(t.maxAmountCents, { noDecimals: true })}</option>)}
          </Select>
        </Field>
        <Field label="Amount (PHP)" required hint={type ? `Ceiling: ${php(type.maxAmountCents, { noDecimals: true })}` : undefined}><Input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Term (months)" required hint={type ? `Max ${type.maxTermMonths} months` : undefined}>
          <Select value={String(f.termMonths)} onChange={(e) => setF({ ...f, termMonths: Number(e.target.value) })}>
            {[12, 24, 36, 48, 60].filter((t) => t <= (type?.maxTermMonths ?? 60)).map((t) => <option key={t} value={t}>{t} months</option>)}
          </Select>
        </Field>
        <p className="rounded-md bg-royal-50 px-3 py-2 text-[12px] text-royal-700">
          Indicative amortization (6% p.a.): <b className="tabular">{php(Math.round(((Number(f.amount) || 0) * 100 * (0.06 / 12)) / (1 - Math.pow(1 + 0.06 / 12, -(Number(f.termMonths) || 1))) || 0))}/month</b>.
          The authoritative schedule is computed server-side upon approval.
        </p>
      </div>
    </Modal>
  );
}
function LoanDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { user, toast } = useApp();
  const r = useApi(() => api.loanDetail(id), [id]);
  const [payAmt, setPayAmt] = useState("");
  const [payMemo, setPayMemo] = useState("");
  const canManage = canSee(user, "loans.manage");
  if (!r.data) return null;
  const { loan, ledger, schedule } = r.data;
  const progress = loan.approvedAmountCents ? Math.round(((loan.approvedAmountCents - loan.balanceCents) / loan.approvedAmountCents) * 100) : 0;
  const post = async () => {
    const cents = toCents(Number(payAmt) || 0);
    if (cents <= 0) { toast("Enter a valid amount", "error"); return; }
    try { await api.postLoanPayment(id, cents, payMemo || "Manual over-the-counter payment"); toast("Payment posted", "success", "Ledger updated; schedule marked paid."); setPayAmt(""); r.reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2">{loan.refNo} <StatusChip status={loan.status} /></span>} width="max-w-2xl">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-md bg-ink-50/60 p-3"><div className="text-[10px] font-bold uppercase text-ink-400">Borrower</div><div className="text-[13px] font-bold text-navy-900">{loan.employeeName}</div></div>
        <div className="rounded-md bg-ink-50/60 p-3"><div className="text-[10px] font-bold uppercase text-ink-400">Type</div><div className="text-[13px] font-bold text-navy-900">{loan.typeName}</div></div>
        <div className="rounded-md bg-ink-50/60 p-3"><div className="text-[10px] font-bold uppercase text-ink-400">Amortization</div><div className="tabular text-[13px] font-bold text-navy-900">{php(loan.installmentCents)} / cut</div></div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[12px] font-semibold"><span className="text-ink-500">Repaid {progress}%</span><span className="tabular text-navy-900">Balance {php(loan.balanceCents)}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="anim-grow-x h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
      </div>
      {canManage && loan.status === "ACTIVE" && (
        <div className="mt-4 rounded-lg border border-ink-200 p-3.5">
          <SectionLabel>Post manual payment</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <Input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="Amount (PHP)" className="w-36" type="number" />
            <Input value={payMemo} onChange={(e) => setPayMemo(e.target.value)} placeholder="OR / memo" className="flex-1" />
            <Button onClick={post} icon={Coins}>Post</Button>
          </div>
        </div>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <SectionLabel>Loan ledger (authoritative)</SectionLabel>
          <div className="space-y-1.5">
            {ledger.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-md border border-ink-100 px-2.5 py-2 text-[12px]">
                <Tag tone={l.type === "DISBURSEMENT" ? "green" : l.type === "PAYROLL_PAYMENT" ? "blue" : l.type === "MANUAL_PAYMENT" ? "gold" : "amber"}>{l.type.replace("_", " ")}</Tag>
                <span className="min-w-0 flex-1 truncate text-ink-500">{l.memo}</span>
                <span className="tabular font-bold text-navy-900">{php(l.amountCents)}</span>
              </div>
            ))}
            {ledger.length === 0 && <p className="text-[12.5px] text-ink-400">No entries yet.</p>}
          </div>
        </div>
        <div>
          <SectionLabel>Repayment schedule</SectionLabel>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {schedule.map((s) => (
              <div key={s.id} className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] ${s.paidAt ? "bg-emerald-50/60 text-emerald-800" : "bg-ink-50/60 text-ink-500"}`}>
                <span className="font-semibold">{s.dueLabel}</span>
                <span className="tabular">{s.paidAt ? `✓ ${fmtDateMed(s.paidAt.slice(0, 10))}` : php(s.amountCents)}</span>
              </div>
            ))}
            {schedule.length === 0 && <p className="text-[12.5px] text-ink-400">Schedule is generated at approval.</p>}
          </div>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-ink-400">Balance is reconstructable from the ledger alone. Payroll amortizations carry the payroll run id — retrying a release can never double-deduct. Last activity {ledger[0] ? fmtDateTime(ledger[0].at) : "—"}.</p>
    </Modal>
  );
}
void EmptyState; void ScrollText;
