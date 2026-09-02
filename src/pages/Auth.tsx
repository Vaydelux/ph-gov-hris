import { ArrowRight, KeyRound, Mail, ShieldCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { config } from "../lib/config";
import { fmtDateMed } from "../lib/core";
import { useApp } from "../state/store";
import { Button, Field, FlagBar, Input, SealMark, StatusChip, Tag, Textarea } from "../components/ui";

function AuthFrame({ children, title, sub }: { children: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
      <div className="hero-navy relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div className="dot-grid absolute inset-0 opacity-20" />
        <div className="relative flex items-center gap-3">
          <SealMark size={52} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-gold-400">Republic of the Philippines</div>
            <div className="font-display text-lg font-extrabold">Government HRIS</div>
          </div>
        </div>
        <div className="relative">
          <h2 className="font-display max-w-md text-[36px] font-black leading-[1.1]">
            Public service runs on <span className="text-gold-400">people</span> — and accurate records.
          </h2>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/65">
            Employee administration, timekeeping, payroll, leave, and recruitment — audited end to end,
            reproducible down to the rule version that produced every peso.
          </p>
          <div className="mt-8 flex gap-6">
            {[["RBAC", "capability-based access"], ["Ledgers", "leave & loan balances"], ["Snapshots", "immutable payroll"]].map(([a, b]) => (
              <div key={a} className="border-l-2 border-gold-500/60 pl-3">
                <div className="font-display text-[15px] font-bold">{a}</div>
                <div className="text-[11px] text-white/55">{b}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-[11px] text-white/45">Department of Civic Services · demo environment · fictional data</div>
      </div>
      <div className="app-bg flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="anim-pop w-full max-w-md">
          <FlagBar className="mb-6 rounded-full" />
          <div className="mb-1 flex items-center gap-2 lg:hidden"><SealMark size={40} /><span className="font-display text-lg font-extrabold text-navy-900">Government HRIS</span></div>
          <h1 className="font-display text-[28px] font-extrabold text-navy-900">{title}</h1>
          {sub && <p className="mt-1.5 text-sm text-ink-500">{sub}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ================= staff login ================= */
const DEMO_ACCOUNTS = [
  ["u_admin2", "System Administrator", "sysadmin@hris.gov.ph"],
  ["u_admin", "Administrator", "admin@hris.gov.ph"],
  ["u_hr", "HR Officer", "hr@hris.gov.ph"],
  ["u_payroll", "Payroll Officer", "payroll@hris.gov.ph"],
  ["u_acct", "Accounting", "accounting@hris.gov.ph"],
  ["u_sup", "Supervisor", "supervisor@hris.gov.ph"],
  ["u_head", "Department Head", "head@hris.gov.ph"],
  ["u_emp", "Employee", "employee@hris.gov.ph"],
  ["u_hire", "Hiring Manager", "hiring@hris.gov.ph"],
] as const;

export function LoginPage() {
  const { user, setUser, toast } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user) return <Navigate to="/dashboard" replace />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const u = await api.login(email, password);
      setUser(u);
      toast(`Welcome back, ${u.fullName.split(" ")[0]}`, "success", `Signed in as ${u.role.replace(/_/g, " ")}.`);
      nav("/dashboard");
    } catch (err) { setError(err instanceof Error ? err.message : "Sign-in failed."); }
    finally { setBusy(false); }
  };
  return (
    <AuthFrame title="Staff sign in" sub="Use your agency-issued credentials. Production sign-in is provided by Supabase Auth with JWT verification.">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-700">{error}</div>}
        <Field label="Official email" required>
          <div className="relative">
            <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan.delacruz@dcs.gov.ph" className="pl-9" autoComplete="username" />
          </div>
        </Field>
        <Field label="Password" required>
          <div className="relative">
            <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9" autoComplete="current-password" />
          </div>
        </Field>
        <div className="flex items-center justify-between">
          <Link to="/forgot-password" className="text-[13px] font-semibold text-royal-600 hover:text-royal-700">Forgot password?</Link>
          <span className="text-[12px] text-ink-400">Password for all demo accounts: <code className="rounded bg-ink-100 px-1.5 py-0.5 font-bold text-navy-900">hris2025</code></span>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={ArrowRight}>Sign in to HRIS</Button>
      </form>

      {config.isPreview && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/70 p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
            <ShieldCheck size={13} /> Demo accounts — click to fill
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map(([, label, mail]) => (
              <button key={mail} type="button" onClick={() => { setEmail(mail); setPassword("hris2025"); setError(""); }}
                className="rounded-full border border-amber-300/80 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-amber-900 transition-all hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-sm">
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-5 text-center text-[12.5px] text-ink-400">
        Applicant? <Link to="/applicant/login" className="font-bold text-royal-600 hover:text-royal-700">Track your application →</Link>
      </p>
    </AuthFrame>
  );
}
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <AuthFrame title="Reset password" sub="A secure reset link will be emailed if the account exists (background worker).">
      {msg ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{msg}</div>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(await api.forgotPassword(email)); setBusy(false); }}>
          <Field label="Official email" required><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan.delacruz@dcs.gov.ph" /></Field>
          <Button type="submit" size="lg" className="w-full" loading={busy} icon={Mail}>Send reset link</Button>
        </form>
      )}
      <p className="mt-5 text-center"><Link to="/login" className="text-[13px] font-bold text-royal-600 hover:text-royal-700">← Back to sign in</Link></p>
    </AuthFrame>
  );
}

/* ================= applicant portal ================= */
export function ApplicantLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api.applicantLogin(email, password); nav("/applicant/applications"); }
    catch (err) { setError(err instanceof Error ? err.message : "Sign-in failed."); }
    finally { setBusy(false); }
  };
  return (
    <AuthFrame title="Applicant portal" sub="Track the status of your civil service applications.">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-700">{error}</div>}
        <Field label="Email used in application" required><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.ph" /></Field>
        <Field label="Password" required hint="Demo applicants use the password: applicant"><Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={User}>View my applications</Button>
      </form>
      <div className="mt-6 rounded-lg border border-royal-200 bg-royal-50/70 p-3.5 text-[12.5px] leading-relaxed text-royal-800">
        No account yet? Apply to any open position from the <Link to="/careers" className="font-bold underline">careers page</Link> — an applicant account is created automatically with your application email.
      </div>
      <p className="mt-5 text-center"><Link to="/login" className="text-[13px] font-bold text-royal-600 hover:text-royal-700">← Staff sign in</Link></p>
    </AuthFrame>
  );
}
export function ApplicantApplicationsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [apps, setApps] = useState<Awaited<ReturnType<typeof api.myApplications>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.applicantSession().then(async (a) => {
      if (!a) { setAuthed(false); return; }
      setAuthed(true);
      setApps(await api.myApplications().catch(() => []));
      setLoading(false);
    });
  }, []);
  if (authed === null) return <div className="app-bg min-h-screen" />;
  if (authed === false) return <Navigate to="/applicant/login" replace />;
  return (
    <div className="app-bg min-h-screen">
      <FlagBar />
      <header className="border-b border-ink-200/70 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3"><SealMark size={38} /><div><div className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-gold-600">Applicant portal</div><div className="font-display text-[15px] font-extrabold text-navy-900">My applications</div></div></div>
          <div className="flex gap-2">
            <Link to="/careers"><Button variant="outline" size="sm">Browse jobs</Button></Link>
            <Button variant="ghost" size="sm" onClick={async () => { await api.applicantLogout(); setAuthed(false); }}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {loading && <div className="space-y-4">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-40" />)}</div>}
        {!loading && apps.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink-300 bg-white p-10 text-center">
            <p className="font-display text-lg font-bold text-navy-900">No applications yet</p>
            <p className="mt-1 text-sm text-ink-500">Browse open positions and submit your first application.</p>
            <Link to="/careers" className="mt-4 inline-block"><Button icon={ArrowRight}>View openings</Button></Link>
          </div>
        )}
        <div className="space-y-4">
          {apps.map((a) => (
            <div key={a.id} className="anim-fade-up rounded-xl border border-ink-200/70 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[17px] font-bold text-navy-900">{a.job.title}</h2>
                  <p className="mt-0.5 text-[12.5px] text-ink-400">{a.job.department} · SG {a.job.salaryGrade} · applied {fmtDateMed(a.appliedAt.slice(0, 10))}</p>
                </div>
                <StatusChip status={a.status} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {a.history.map((h, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <Tag tone={h.status === "HIRED" ? "green" : h.status === "REJECTED" ? "red" : h.status === "NEW" ? "gray" : "blue"}>{h.status.replace(/_/g, " ")}</Tag>
                    {i < a.history.length - 1 && <ArrowRight size={12} className="text-ink-300" />}
                  </span>
                ))}
              </div>
              <p className="mt-3 border-t border-ink-100 pt-3 text-[12px] text-ink-400">
                Reference: <code className="font-bold text-navy-900">{a.docName}</code> · Match score {a.matchScore}/100 (decision-support only)
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8"><Textarea className="hidden" /></div>
      </main>
    </div>
  );
}
