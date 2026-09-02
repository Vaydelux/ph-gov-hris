import { ArrowRight, BadgeCheck, Banknote, Briefcase, CalendarDays, CalendarRange, Clock, Coins, Fingerprint, Landmark, ScrollText, Users, Wallet } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "../lib/api";
import { cn, fmtDateMed, fmtMin, num, php, titleCase } from "../lib/core";
import { canSee, useApi, useApp } from "../state/store";
import { Avatar, Button, Card, KPI, ProgressBar, SectionLabel, StatusChip, Tag } from "../components/ui";

const PIE_COLORS = ["#2170e4", "#c9a227", "#b3541e", "#0f766e"];
const tooltipStyle = { borderRadius: 8, border: "1px solid #d4dbe7", fontSize: 12, fontFamily: "Inter" };

export function DashboardPage() {
  const { user } = useApp();
  if (!user) return null;
  if (canSee(user, "employees.read") && canSee(user, "reports.view")) return <AdminDashboard />;
  if (canSee(user, "payroll.read")) return <PayrollDashboard />;
  return <EmployeeDashboard />;
}

/* ================= admin / HR ================= */
function AdminDashboard() {
  const { user } = useApp();
  const nav = useNavigate();
  const r = useApi(() => api.adminDashboard(), []);
  const d = r.data; const loading = r.loading;
  const pending = useMemo(() => {
    if (!d) return [];
    const items: Array<{ label: string; to: string; count: number; tone: "amber" | "blue" }> = [
      { label: "Leave requests awaiting decision", to: "/leave", count: d.pendingLeave, tone: "amber" },
      { label: "Attendance adjustments pending", to: "/attendance/adjustments", count: d.pendingAdjustments, tone: "amber" },
      { label: "New job applications", to: "/recruitment", count: d.pendingApplications, tone: "blue" },
    ];
    if (!d.latestRun || d.latestRun.status === "COMPUTED") items.push({ label: "Payroll verification queue", to: d.latestRun ? `/payroll/${d.latestRun.id}` : "/payroll", count: 1, tone: "blue" });
    return items.filter((i) => i.count > 0);
  }, [d]);
  if (loading || !d) return <DashSkeleton />;
  return (
    <div>
      <WelcomeBar greeting={`Good day, ${user!.fullName.split(" ").slice(-1)[0]}`} sub="Agency operations overview — live from the HRIS record." />
      <div className="stagger mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KPI label="Total employees" value={num(d.totalEmployees)} icon={Users} tone="navy" hint="Active plantilla & casual" />
        <KPI label="Present today" value={num(d.presentToday)} icon={Fingerprint} tone="green" hint={`${d.attendanceRate}% attendance rate`} />
        <KPI label="Late arrivals" value={num(d.lateToday)} icon={Clock} tone="amber" hint="Beyond 15-min grace period" />
        <KPI label="Absent / on leave" value={num(d.absentOrLeave)} icon={CalendarDays} tone="red" hint="Filed & unfiled" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="anim-fade-up lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div><h3 className="font-display text-[15px] font-bold text-navy-900">Attendance trend</h3><p className="text-[11.5px] text-ink-400">Last 14 working days · present vs late</p></div>
            <Link to="/attendance" className="text-[12px] font-bold text-royal-600 hover:text-royal-700">Timekeeping →</Link>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d.trend} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2170e4" stopOpacity={0.28} /><stop offset="100%" stopColor="#2170e4" stopOpacity={0.02} /></linearGradient>
                <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c9a227" stopOpacity={0.3} /><stop offset="100%" stopColor="#c9a227" stopOpacity={0.02} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10.5, fill: "#7c8aa0" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10.5, fill: "#7c8aa0" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="present" name="Present" stroke="#2170e4" strokeWidth={2} fill="url(#gp)" />
              <Area type="monotone" dataKey="late" name="Late" stroke="#c9a227" strokeWidth={2} fill="url(#gl)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="anim-fade-up">
          <h3 className="font-display text-[15px] font-bold text-navy-900">Pending actions</h3>
          <p className="text-[11.5px] text-ink-400">Items needing your attention</p>
          <div className="mt-3 space-y-2">
            {pending.length === 0 && <p className="rounded-md bg-emerald-50 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-700">Queue is clear — nothing pending.</p>}
            {pending.map((p) => (
              <button key={p.label} onClick={() => nav(p.to)} className="flex w-full items-center justify-between rounded-md border border-ink-100 px-3 py-2.5 text-left transition-all hover:border-royal-300 hover:bg-royal-50/50">
                <span className="text-[12.5px] font-semibold text-ink-700">{p.label}</span>
                <span className="flex items-center gap-2">
                  <Tag tone={p.tone}>{p.count}</Tag><ArrowRight size={13} className="text-royal-500" />
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-ink-100 pt-3.5">
            <SectionLabel>Latest payroll run</SectionLabel>
            {d.latestRun ? (
              <button onClick={() => nav(`/payroll/${d.latestRun!.id}`)} className="flex w-full items-center justify-between rounded-md bg-ink-50/60 px-3 py-2.5 transition-colors hover:bg-royal-50">
                <span><span className="block text-[12.5px] font-bold text-navy-900">Latest run</span><StatusChip status={d.latestRun.status} /></span>
                <span className="tabular font-display text-[15px] font-extrabold text-navy-900">{php(d.latestRun.netCents, { noDecimals: true })}</span>
              </button>
            ) : <p className="text-[12.5px] text-ink-400">No payroll run yet.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="anim-fade-up">
          <h3 className="font-display text-[15px] font-bold text-navy-900">Headcount by division</h3>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={d.byDept} layout="vertical" margin={{ top: 6, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10.5, fill: "#7c8aa0" }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10.5, fill: "#51617a" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ecf4fe" }} />
              <Bar dataKey="count" name="Employees" radius={[0, 4, 4, 0]} barSize={14}>
                {d.byDept.map((_, i) => <Cell key={i} fill={i % 2 ? "#0058be" : "#2170e4"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="anim-fade-up">
          <h3 className="font-display text-[15px] font-bold text-navy-900">Recent activity</h3>
          <p className="text-[11.5px] text-ink-400">Audited events · full trail in Audit module</p>
          <div className="mt-3 space-y-2.5">
            {d.recentActivity.slice(0, 6).map((a: { id: string; actorName: string; action: string; at: string }) => (
              <div key={a.id} className="flex items-start gap-2.5 border-b border-dashed border-ink-100 pb-2.5 last:border-0">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-royal-500" />
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-navy-900">{titleCase(a.action)}</p>
                  <p className="text-[11px] text-ink-400">{a.actorName} · {new Date(a.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="anim-fade-up flex flex-col">
          <h3 className="font-display text-[15px] font-bold text-navy-900">Quick actions</h3>
          <div className="mt-3 grid flex-1 grid-cols-2 gap-2.5">
            {[["Employees", "/employees", Users], ["Attendance", "/attendance", Fingerprint], ["Payroll", "/payroll", Wallet], ["Leave", "/leave", CalendarDays], ["Reports", "/reports", ScrollText], ["Recruitment", "/recruitment", Briefcase]]
              .filter(([, to]) => to !== "/recruitment" || canSee(user, "recruitment.manage"))
              .map(([label, to, Icon]) => (
                <button key={to as string} onClick={() => nav(to as string)}
                  className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-ink-200/70 bg-ink-50/40 py-4 transition-all hover:-translate-y-0.5 hover:border-royal-300 hover:bg-royal-50 hover:shadow-card">
                  {(Icon as typeof Users) && <Users size={0} className="hidden" />}
                  <QuickIcon name={label as string} />
                  <span className="text-[12px] font-bold text-navy-900 group-hover:text-royal-700">{label as string}</span>
                </button>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
function QuickIcon({ name }: { name: string }) {
  const map: Record<string, typeof Users> = { Employees: Users, Attendance: Fingerprint, Payroll: Wallet, Leave: CalendarDays, Reports: ScrollText, Recruitment: Briefcase };
  const Icon = map[name] ?? Users;
  return <Icon size={19} className="text-royal-600" />;
}

/* ================= payroll officer ================= */
function PayrollDashboard() {
  const { user } = useApp();
  const r = useApi(() => api.payrollOverview(), []);
  const d = r.data; const loading = r.loading;
  const r2 = useApi(() => api.myPayslips().catch(() => []), []);
  const mine = r2.data; const mLoading = r2.loading;
  const latest = d?.runs[0];
  if (loading || !d) return <DashSkeleton />;
  const open = d.periods.find((p) => !p.closed);
  return (
    <div>
      <WelcomeBar greeting={`Payroll desk — ${user!.fullName}`} sub="Computation runs in the background worker; verification and release stay human-controlled." />
      <div className="stagger mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KPI label="Current period" value={<span className="text-[17px]">{open?.label.split(",")[0] ?? "—"}</span>} icon={CalendarRange} tone="navy" hint={open ? `Cutoff ${fmtDateMed(open.cutoff)}` : "No open period"} />
        <KPI label="Latest run status" value={<StatusChip status={latest?.status ?? "DRAFT"} />} icon={BadgeCheck} tone="blue" hint={latest?.stage} />
        <KPI label="Employees covered" value={num(latest?.employeeCount ?? 0)} icon={Users} tone="gold" hint="Eligible roster" />
        <KPI label="Net disbursed" value={php(latest?.netCents ?? 0, { noDecimals: true })} icon={Banknote} tone="green" hint={`Gross ${php(latest?.grossCents ?? 0, { noDecimals: true })}`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="anim-fade-up lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-[15px] font-bold text-navy-900">Payroll runs</h3>
            <Link to="/payroll" className="text-[12px] font-bold text-royal-600 hover:text-royal-700">All runs →</Link>
          </div>
          <div className="space-y-2">
            {d.runs.map((r) => (
              <Link key={r.id} to={`/payroll/${r.id}`} className="flex items-center justify-between rounded-md border border-ink-100 px-3.5 py-3 transition-all hover:border-royal-300 hover:bg-royal-50/50">
                <span>
                  <span className="block text-[13px] font-bold text-navy-900">{r.periodLabel}</span>
                  <span className="text-[11px] text-ink-400">{r.employeeCount} employees · created {fmtDateMed(r.createdAt.slice(0, 10))}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular font-display text-[14px] font-extrabold text-navy-900">{r.netCents ? php(r.netCents, { noDecimals: true }) : "—"}</span>
                  <StatusChip status={r.status} />
                </span>
              </Link>
            ))}
          </div>
          {latest && ["QUEUED", "COMPUTING"].includes(latest.status) && (
            <div className="mt-4"><SectionLabel>Worker progress — {latest.stage}</SectionLabel><ProgressBar value={latest.progress} /></div>
          )}
        </Card>
        <Card className="anim-fade-up">
          <h3 className="font-display text-[15px] font-bold text-navy-900">My payslips</h3>
          <div className="mt-3 space-y-2">
            {mLoading && <div className="skeleton h-20" />}
            {(mine ?? []).slice(0, 3).map((p) => (
              <Link key={p.id} to="/payslips" className="flex items-center justify-between rounded-md bg-ink-50/60 px-3 py-2.5 transition-colors hover:bg-royal-50">
                <span className="text-[12.5px] font-semibold text-ink-700">{p.periodLabel}</span>
                <span className="tabular text-[13px] font-bold text-navy-900">{php(p.ep.netCents)}</span>
              </Link>
            ))}
            {!mLoading && (mine ?? []).length === 0 && <p className="text-[12.5px] text-ink-400">No released payslips for this account.</p>}
          </div>
          <div className="mt-4 border-t border-ink-100 pt-3 text-[11.5px] leading-relaxed text-ink-400">
            <Landmark size={13} className="mr-1 inline text-royal-500" /> Statutory tables are effective-dated; released runs keep the versions used.
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================= employee / supervisor ================= */
function EmployeeDashboard() {
  const { user } = useApp();
  const r = useApi(() => api.myDashboard(), []);
  const d = r.data; const loading = r.loading;
  if (loading || !d) return <DashSkeleton />;
  const statusPie = [
    { name: "Present", value: d.monthStats.present },
    { name: "Late days", value: d.monthStats.late },
    { name: "OT days", value: d.monthStats.otMin > 0 ? 1 : 0 },
    { name: "Absences", value: Math.max(0, 20 - d.monthStats.present) },
  ].filter((x) => x.value > 0);
  return (
    <div>
      <WelcomeBar greeting={`Magandang araw, ${d.employee.firstName}`} sub={`Employee No. ${d.employee.employeeNo} · Hired ${fmtDateMed(d.employee.hiredAt)}`} />
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="anim-fade-up lg:col-span-2">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={`${d.employee.firstName} ${d.employee.lastName}`} hue={d.employee.avatarHue} size={56} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[17px] font-extrabold text-navy-900">{d.employee.firstName} {d.employee.lastName}</div>
              <div className="text-[12.5px] text-ink-400">SG {d.employee.salaryGrade} · Step {d.employee.salaryStep} · {php(d.salaryCents, { noDecimals: true })}/month</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5"><Tag tone="blue">{d.employee.appointmentType}</Tag><Tag tone="green">{d.employee.status}</Tag></div>
            </div>
            <div className="text-right">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">Today</div>
              {d.todayAtt?.clockIn != null ? <StatusChip status={d.todayAtt.status} /> : <Tag tone="gray">No log yet</Tag>}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Present (mo.)", num(d.monthStats.present), "bg-royal-50 text-royal-700"], ["Late days", num(d.monthStats.late), "bg-amber-50 text-amber-700"], ["Undertime/Late", fmtMin(d.monthStats.lateMin), "bg-red-50 text-red-700"], ["Overtime", fmtMin(d.monthStats.otMin), "bg-emerald-50 text-emerald-700"]].map(([l, v, c]) => (
              <div key={l as string} className={cn("rounded-lg p-3 text-center", c as string)}>
                <div className="tabular font-display text-[17px] font-extrabold">{v}</div>
                <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-70">{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionLabel>This month</SectionLabel>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={3} strokeWidth={0}>
                    {statusPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <SectionLabel>Leave balances</SectionLabel>
              <div className="space-y-2">
                {d.balances.map((b) => (
                  <div key={b.id}>
                    <div className="mb-1 flex justify-between text-[12px]"><span className="font-semibold text-ink-700">{b.name}</span><span className="tabular font-bold text-navy-900">{b.days} d</span></div>
                    <ProgressBar value={(b.days / b.annualDays) * 100} tone={b.days < 3 ? "gold" : "blue"} />
                  </div>
                ))}
              </div>
              <Link to="/leave" className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-royal-600 hover:text-royal-700">File leave <ArrowRight size={12} /></Link>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="anim-fade-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[15px] font-bold text-navy-900">Latest payslip</h3>
              <Wallet size={16} className="text-royal-600" />
            </div>
            {d.latestPayslip ? (
              <>
                <div className="mt-3 rounded-lg bg-navy-900 p-4 text-white">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold-300">{d.latestPayslip.periodLabel}</div>
                  <div className="tabular font-display mt-1 text-[26px] font-black">{php(d.latestPayslip.ep.netCents)}</div>
                  <div className="text-[11.5px] text-white/60">Gross {php(d.latestPayslip.ep.grossCents)} · Deductions {php(d.latestPayslip.ep.totalDeductCents)}</div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11.5px] text-ink-400">Slip <code className="font-bold text-navy-900">{d.latestPayslip.payslip.number}</code></span>
                  <Link to="/payslips" className="text-[12px] font-bold text-royal-600 hover:text-royal-700">View →</Link>
                </div>
              </>
            ) : <p className="mt-3 text-[12.5px] text-ink-400">No payslip released for your account yet.</p>}
          </Card>
          <Card className="anim-fade-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[15px] font-bold text-navy-900">Active loans</h3>
              <Coins size={16} className="text-royal-600" />
            </div>
            <div className="mt-3 space-y-2.5">
              {d.loans.length === 0 && <p className="text-[12.5px] text-ink-400">No active loans.</p>}
              {d.loans.map((l) => (
                <Link key={l.id} to="/loans" className="block rounded-md border border-ink-100 px-3 py-2.5 transition-colors hover:border-royal-300 hover:bg-royal-50/50">
                  <div className="flex justify-between text-[12.5px]"><span className="font-bold text-navy-900">{l.typeName}</span><span className="tabular font-bold">{php(l.balanceCents)}</span></div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-ink-400"><span>{php(l.installmentCents)} / cut</span><StatusChip status={l.status} /></div>
                </Link>
              ))}
              <Link to="/loans" className="inline-flex items-center gap-1 text-[12px] font-bold text-royal-600 hover:text-royal-700">Apply for a loan <ArrowRight size={12} /></Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function WelcomeBar({ greeting, sub }: { greeting: string; sub?: string }) {
  return (
    <div className="anim-fade-up flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] font-extrabold leading-tight text-navy-900">{greeting}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-500">{sub}</p>}
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <Tag tone="gold">{new Date().toLocaleDateString("en-PH", { weekday: "long" })}</Tag>
        <Tag tone="navy">{new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</Tag>
      </div>
    </div>
  );
}
function DashSkeleton() {
  return (
    <div>
      <div className="skeleton mb-5 h-10 w-72" />
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-72" />)}</div>
    </div>
  );
}
