import { ArrowRight, BadgeCheck, Building2, CalendarDays, FileText, Fingerprint, Landmark, Mail, MapPin, Phone, Users, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import api from "../lib/api";
import { fmtDateMed } from "../lib/core";
import { useApi, useApp } from "../state/store";
import { ASSETS, Button, Field, FlagBar, Input, Logo, SealMark, StatusChip, Tag, Textarea } from "../components/ui";

function PublicHeader() {
  const loc = useLocation();
  const links = [["/about", "About"], ["/news", "News"], ["/careers", "Careers"]] as const;
  return (
    <header className="sticky top-0 z-40">
      <div className="gov-flag-bar h-1" />
      <div className="border-b border-navy-800 bg-navy-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <SealMark size={40} />
            <span>
              <span className="block text-[9.5px] font-bold uppercase tracking-[0.26em] text-gold-400">Republic of the Philippines</span>
              <span className="font-display block text-[16px] font-extrabold leading-tight text-white">Government HRIS</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Public navigation">
            {links.map(([to, label]) => (
              <Link key={to} to={to}
                className={`rounded-md px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${loc.pathname.startsWith(to) ? "bg-white/10 text-gold-300" : "text-white/70 hover:bg-white/6 hover:text-white"}`}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-3">
            <Link to="/applicant/login" className="rounded-md px-3 py-2 text-[13px] font-semibold text-white/70 transition-colors hover:text-white">Applicant portal</Link>
            <Link to="/login"><Button size="sm" variant="gold">Staff sign in</Button></Link>
          </div>
        </div>
      </div>
    </header>
  );
}
function PublicFooter() {
  return (
    <footer className="mt-auto">
      <div className="gold-rule" />
      <div className="sidebar-texture text-white/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <SealMark size={46} />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gold-400">Republic of the Philippines</div>
                <div className="font-display text-[17px] font-extrabold text-white">Government HRIS</div>
              </div>
            </div>
            <p className="mt-4 max-w-md text-[13px] leading-relaxed">
              The Government Human Resource Information System modernizes employee administration, timekeeping,
              payroll, leave, and recruitment for Philippine government agencies — with full audit trails and
              historically reproducible payroll.
            </p>
          </div>
          <div>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-400">System</div>
            <ul className="space-y-2 text-[13px]">
              <li><Link className="transition-colors hover:text-white" to="/careers">Careers</Link></li>
              <li><Link className="transition-colors hover:text-white" to="/applicant/login">Applicant portal</Link></li>
              <li><Link className="transition-colors hover:text-white" to="/login">Staff sign in</Link></li>
              <li><Link className="transition-colors hover:text-white" to="/news">News & advisories</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-400">Contact</div>
            <ul className="space-y-2 text-[13px]">
              <li className="flex items-center gap-2"><MapPin size={13} className="text-gold-400" /> Civic Center Bldg., Constitution Ave., Quezon City</li>
              <li className="flex items-center gap-2"><Phone size={13} className="text-gold-400" /> (02) 8555-0100</li>
              <li className="flex items-center gap-2"><Mail size={13} className="text-gold-400" /> hris.support@dcs.gov.ph</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11.5px] text-white/50 sm:px-6">
            <span>© {new Date().getFullYear()} Department of Civic Services — demo environment with fictional data.</span>
            <span>Privacy Notice · Accessibility · FOI</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
export function PublicLayout() {
  return (
    <div className="app-bg flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1"><Outlet /></main>
      <PublicFooter />
    </div>
  );
}

/* ================= home ================= */
const SERVICES = [
  { icon: Users, title: "Employee Administration", body: "Master employee records, plantilla positions, salary grades and steps — with archival instead of deletion." },
  { icon: Fingerprint, title: "Timekeeping & Biometrics", body: "Vendor-neutral biometric adapters, DTRs, late/undertime computation, and controlled attendance adjustments." },
  { icon: Wallet, title: "Government Payroll", body: "Semi-monthly payroll with immutable snapshots, effective-dated rules, and a verified approval chain." },
  { icon: Landmark, title: "Statutory Deductions", body: "GSIS, PhilHealth, Pag-IBIG and withholding tax tables versioned by effectivity — history stays reproducible." },
  { icon: CalendarDays, title: "Leave Management", body: "Ledger-based balances with supervisor and HR approval stages, overlap checks, and team calendars." },
  { icon: BadgeCheck, title: "Recruitment", body: "Public careers portal, applicant tracking pipeline, interviews, and decision-support match scoring." },
];
export function PublicHome() {
  const { data: jobs } = useApi(() => api.publicJobs(), []);
  return (
    <div>
      <section className="hero-navy relative overflow-hidden text-white">
        <div className="dot-grid absolute inset-0 opacity-20" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
          <div className="anim-fade-up">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-300">
              <SealMark size={18} /> Official government system
            </div>
            <h1 className="font-display text-4xl font-black leading-[1.06] sm:text-[54px]">
              One system for every <span className="text-gold-400">civil servant</span>, from DTR to payslip.
            </h1>
            <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-white/70">
              Government HRIS digitizes employee records, attendance, leave, payroll, deductions, loans, and recruitment —
              engineered for auditability: every peso, every rule version, every approval, permanently traceable.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/login"><Button size="lg" variant="gold" icon={ArrowRight}>Staff portal</Button></Link>
              <Link to="/careers"><Button size="lg" variant="outline" className="border-white/25 bg-white/5 text-white hover:border-gold-400 hover:text-gold-300">View open positions</Button></Link>
            </div>
            <div className="mt-9 grid max-w-md grid-cols-3 gap-4">
              {[["1,000+", "employees supported"], ["99%", "availability target"], ["100%", "auditable transactions"]].map(([v, l]) => (
                <div key={l} className="border-l-2 border-gold-500/60 pl-3">
                  <div className="font-display text-xl font-extrabold text-white">{v}</div>
                  <div className="text-[11px] text-white/55">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="anim-fade-up relative hidden lg:block" style={{ animationDelay: "120ms" }}>
            <div className="overflow-hidden rounded-xl border border-white/15 shadow-deep">
              <img src={ASSETS.building} alt="Government agency building with the Philippine flag" className="h-[420px] w-full object-cover" />
            </div>
            <div className="absolute -bottom-5 -left-6 rounded-lg border border-gold-400/40 bg-navy-950/95 px-4 py-3 shadow-lift backdrop-blur">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-400">Standardized Salary Schedule</div>
              <div className="font-display text-[15px] font-bold text-white">SG 1–33 · 8 steps · effective-dated</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-royal-600">System modules</div>
            <h2 className="font-display mt-1 text-[30px] font-extrabold text-navy-900">Everything HR, under one seal</h2>
          </div>
          <Link to="/about" className="flex items-center gap-1 text-sm font-bold text-royal-600 hover:text-royal-700">About the program <ArrowRight size={15} /></Link>
        </div>
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <div key={s.title} className="group rounded-lg border border-ink-200/70 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-royal-300 hover:shadow-lift">
              <span className="inline-block rounded-md bg-navy-900 p-2.5 text-gold-400 transition-colors group-hover:bg-royal-600 group-hover:text-white"><s.icon size={19} /></span>
              <h3 className="font-display mt-3 text-[16px] font-bold text-navy-900">{s.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-ink-200/70 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-8">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-royal-600">Now hiring</div>
            <h2 className="font-display mt-1 text-[30px] font-extrabold text-navy-900">Serve the public. Grow your career.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(jobs ?? []).slice(0, 3).map((j) => (
              <Link key={j.id} to={`/careers/jobs/${j.slug}`} className="group rounded-lg border border-ink-200/70 bg-paper p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-lift">
                <div className="flex items-center justify-between"><Tag tone="gold">SG {j.salaryGrade}</Tag><Tag tone="green">Open</Tag></div>
                <h3 className="font-display mt-3 text-[16.5px] font-bold text-navy-900 group-hover:text-royal-600">{j.title}</h3>
                <p className="mt-1 text-[12.5px] text-ink-400">{j.department} · {j.workLocation}</p>
                <p className="mt-3 flex items-center gap-1 text-[12.5px] font-bold text-royal-600">Apply before {fmtDateMed(j.deadline)} <ArrowRight size={13} /></p>
              </Link>
            ))}
            {(jobs ?? []).length === 0 && Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-44" />)}
          </div>
          <div className="mt-8 text-center"><Link to="/careers"><Button variant="navy" icon={ArrowRight}>Browse all openings</Button></Link></div>
        </div>
      </section>
    </div>
  );
}

/* ================= about / news / contact ================= */
export function PublicAbout() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-royal-600">About the program</div>
      <h1 className="font-display mt-1 text-[34px] font-extrabold text-navy-900">Modern HR for the civil service</h1>
      <div className="gold-rule my-6" />
      <div className="space-y-4 text-[15px] leading-relaxed text-ink-600">
        <p>The Government HRIS is the department's system of record for human resource management: employee master data,
          timekeeping with biometric integration boundaries, leave administration, payroll computation against the
          Standardized Salary Schedule, statutory deductions, allowances, salary loans, and recruitment.</p>
        <p>Every financial operation is transactional and historically reproducible. Payroll runs snapshot compensation,
          attendance, and the exact government rule versions in effect — so an auditor can always answer
          <em> who changed it, when, what it was before, and which rules produced the number</em>.</p>
      </div>
      <div className="stagger mt-10 grid gap-4 sm:grid-cols-3">
        {[["Auditability", "Append-only audit trail on every critical action, with before/after values."],
        ["Accuracy", "Decimal-safe money handling; released payroll is immutable."],
        ["Accountability", "Role-based access enforced by the API, never by the browser."]].map(([t, b]) => (
          <div key={t} className="rounded-lg border-t-4 border-gold-500 bg-white p-5 shadow-card">
            <h3 className="font-display text-[15px] font-bold text-navy-900">{t}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{b}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 overflow-hidden rounded-xl border border-ink-200 shadow-card">
        <img src={ASSETS.building} alt="Department headquarters" className="h-72 w-full object-cover" />
      </div>
    </div>
  );
}
export const NEWS = [
  { id: 1, date: "2026-02-10", tag: "Advisory", title: "Payroll cutoff for the current period", body: "The semi-monthly payroll cutoff falls on the 10th and 25th. Attendance finalization locks 24 hours after each cutoff." },
  { id: 2, date: "2026-01-28", tag: "Release", title: "Digital payslips now available", body: "Released payroll runs issue immutable digital payslips to every employee's portal, reproducible from their payroll snapshot." },
  { id: 3, date: "2026-01-15", tag: "HR Update", title: "Mandatory leave compliance period opens", body: "Supervisors are reminded to schedule mandatory leave for eligible personnel before the June compliance review." },
];
export function PublicNews() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-royal-600">News & advisories</div>
      <h1 className="font-display mt-1 text-[34px] font-extrabold text-navy-900">Announcements</h1>
      <div className="mt-8 space-y-4">
        {NEWS.map((n) => (
          <article key={n.id} className="anim-fade-up flex flex-col gap-3 rounded-lg border border-ink-200/70 bg-white p-5 shadow-card transition-shadow hover:shadow-lift sm:flex-row sm:items-start sm:gap-6">
            <div className="shrink-0 sm:w-28 sm:text-right">
              <div className="font-display text-[15px] font-extrabold text-navy-900">{fmtDateMed(n.date)}</div>
              <Tag tone="navy">{n.tag}</Tag>
            </div>
            <div>
              <h2 className="font-display text-[17px] font-bold text-navy-900">{n.title}</h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">{n.body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
export function PublicContact() {
  const { toast } = useApp();
  const [sent, setSent] = useState(false);
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-royal-600">Contact</div>
      <h1 className="font-display mt-1 text-[34px] font-extrabold text-navy-900">Reach the HRIS support desk</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          {[["Address", "Civic Center Bldg., Constitution Ave., Quezon City", MapPin],
          ["Trunk line", "(02) 8555-0100 loc. 2140", Phone],
          ["Support email", "hris.support@dcs.gov.ph", Mail]].map(([t, v, Icon]) => (
            <div key={t as string} className="flex items-start gap-3 rounded-lg border border-ink-200/70 bg-white p-4 shadow-card">
              <span className="rounded-md bg-royal-50 p-2 text-royal-600">{(Icon as typeof MapPin) && <>{/* icon */}</>}<Building2 size={0} className="hidden" /></span>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{t as string}</div>
                <div className="text-[13.5px] font-semibold text-navy-900">{v as string}</div>
              </div>
            </div>
          ))}
        </div>
        <form className="space-y-4 rounded-lg border border-ink-200/70 bg-white p-5 shadow-card" onSubmit={(e) => { e.preventDefault(); setSent(true); toast("Message queued", "success", "Support will respond via email (background worker)."); }}>
          {sent ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 w-fit rounded-full bg-emerald-50 p-3 text-emerald-600"><BadgeCheck size={26} /></div>
              <p className="font-display text-lg font-bold text-navy-900">Message received</p>
              <p className="mt-1 text-sm text-ink-500">Ticket routed to the HRIS support queue.</p>
            </div>
          ) : (
            <>
              <Field label="Full name" required><Input required placeholder="Juan Dela Cruz" /></Field>
              <Field label="Email" required><Input required type="email" placeholder="juan@dcs.gov.ph" /></Field>
              <Field label="Concern" required><Textarea required placeholder="Describe your concern…" /></Field>
              <Button type="submit" icon={Mail}>Send message</Button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

/* ================= careers ================= */
export function CareersHome() {
  const { data: jobs, loading } = useApi(() => api.publicJobs(), []);
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-royal-600">Careers in public service</div>
          <h1 className="font-display mt-1 text-[34px] font-extrabold text-navy-900">Open positions</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-500">All appointments are made in accordance with civil service rules. Merit, fitness, and eligibility govern every selection.</p>
        </div>
        <Tag tone="gold">{jobs?.length ?? 0} active listings</Tag>
      </div>
      <div className="stagger mt-8 grid gap-4 md:grid-cols-2">
        {(jobs ?? []).map((j) => (
          <Link key={j.id} to={`/careers/jobs/${j.slug}`} className="group rounded-lg border border-ink-200/70 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-royal-300 hover:shadow-lift">
            <div className="flex items-center justify-between">
              <div className="flex gap-2"><Tag tone="gold">Salary Grade {j.salaryGrade}</Tag><Tag tone="blue">{j.openings} slot{j.openings > 1 ? "s" : ""}</Tag></div>
              <FileText size={17} className="text-ink-300 transition-colors group-hover:text-royal-500" />
            </div>
            <h2 className="font-display mt-3 text-[18px] font-bold text-navy-900 group-hover:text-royal-600">{j.title}</h2>
            <p className="mt-0.5 text-[12.5px] font-semibold text-royal-700">{j.department}</p>
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-500">{j.summary}</p>
            <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-[12px] text-ink-400">
              <span>Apply before <b className="text-navy-900">{fmtDateMed(j.deadline)}</b></span>
              <span className="font-bold text-royal-600">View details →</span>
            </div>
          </Link>
        ))}
        {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-48" />)}
      </div>
    </div>
  );
}
export function JobDetailPage() {
  const { slug } = useParams();
  const { data: job, loading, error } = useApi(() => api.publicJob(slug!), [slug]);
  const [applying, setApplying] = useState(false);
  const [f, setF] = useState({ fullName: "", email: "", phone: "", coverLetter: "", resumeText: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useApp();
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);
  if (loading) return <div className="mx-auto max-w-4xl px-4 py-14"><div className="skeleton h-64 w-full" /></div>;
  if (error || !job) return <div className="mx-auto max-w-4xl px-4 py-20 text-center"><p className="font-display text-xl font-bold text-navy-900">Posting not found</p><Link to="/careers" className="mt-3 inline-block text-royal-600">← Back to careers</Link></div>;
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <Link to="/careers" className="text-sm font-bold text-royal-600 hover:text-royal-700">← All openings</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="flex flex-wrap gap-2"><Tag tone="gold">Salary Grade {job.salaryGrade}</Tag><Tag tone="blue">{job.employmentType}</Tag><Tag tone="navy">{job.workLocation}</Tag></div>
          <h1 className="font-display mt-3 text-[34px] font-extrabold leading-tight text-navy-900">{job.title}</h1>
          <p className="mt-1 text-sm font-bold text-royal-700">{job.department} · posted {fmtDateMed(job.postedAt)} · deadline {fmtDateMed(job.deadline)}</p>
          <div className="gold-rule my-6" />
          <p className="text-[14.5px] leading-relaxed text-ink-600">{job.summary}</p>
          <h2 className="font-display mt-8 text-lg font-bold text-navy-900">Key responsibilities</h2>
          <ul className="mt-3 space-y-2">
            {job.responsibilities.map((r) => <li key={r} className="flex gap-2.5 text-[13.5px] text-ink-600"><BadgeCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {r}</li>)}
          </ul>
          <h2 className="font-display mt-8 text-lg font-bold text-navy-900">Qualification standards</h2>
          <ul className="mt-3 space-y-2">
            {job.qualifications.map((r) => <li key={r} className="flex gap-2.5 text-[13.5px] text-ink-600"><FileText size={16} className="mt-0.5 shrink-0 text-royal-600" /> {r}</li>)}
          </ul>
        </div>
        <div>
          <div className="sticky top-24 rounded-xl border border-ink-200/80 bg-white p-5 shadow-lift">
            {done ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-3 w-fit rounded-full bg-emerald-50 p-3.5 text-emerald-600"><BadgeCheck size={28} /></div>
                <p className="font-display text-lg font-bold text-navy-900">Application submitted</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">Track your status anytime from the applicant portal using your email.</p>
                <Link to="/applicant/login" className="mt-4 inline-block"><Button variant="navy">Open applicant portal</Button></Link>
              </div>
            ) : applying ? (
              <form className="space-y-3.5" onSubmit={async (e) => {
                e.preventDefault(); setBusy(true);
                try {
                  await api.submitApplication({ jobSlug: job.slug, ...f, docName: `resume_${f.fullName.trim().split(/\s+/).pop()?.toLowerCase() ?? "applicant"}.pdf` });
                  setDone(true); toast("Application submitted", "success");
                } catch (err) { toast(err instanceof Error ? err.message : "Submission failed", "error"); }
                finally { setBusy(false); }
              }}>
                <div className="font-display text-[15px] font-bold text-navy-900">Apply for this position</div>
                <Field label="Full name" required><Input required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} placeholder="Maria Clara Santos" /></Field>
                <Field label="Email" required><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@mail.ph" /></Field>
                <Field label="Mobile" required><Input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+63 917 000 0000" /></Field>
                <Field label="Resume highlights" required hint="Skills & experience — used for decision-support match scoring only.">
                  <Textarea required value={f.resumeText} onChange={(e) => setF({ ...f, resumeText: e.target.value })} placeholder="e.g., SQL, HRIS administration, 3 years government service…" />
                </Field>
                <Field label="Cover letter" required><Textarea required value={f.coverLetter} onChange={(e) => setF({ ...f, coverLetter: e.target.value })} placeholder="Why are you suited for public service?" /></Field>
                <div className="flex gap-2">
                  <Button type="submit" loading={busy} className="flex-1">Submit application</Button>
                  <Button type="button" variant="outline" onClick={() => setApplying(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">Position summary</div>
                <div className="mt-3 space-y-2.5 text-[13px]">
                  {[["Salary grade", `SG ${job.salaryGrade} (Standardized Salary Schedule)`], ["Openings", `${job.openings}`], ["Deadline", fmtDateMed(job.deadline)], ["Item type", job.employmentType]].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-dotted border-ink-200 pb-2"><span className="text-ink-400">{k}</span><span className="text-right font-semibold text-navy-900">{v}</span></div>
                  ))}
                </div>
                <Button size="lg" className="mt-5 w-full" icon={ArrowRight} onClick={() => setApplying(true)}>Apply now</Button>
                <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-400">Applications are stored privately. Automated match scores are decision-support only.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export function Section({ children }: { children: ReactNode }) { return <section>{children}</section>; }
