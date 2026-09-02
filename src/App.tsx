/* eslint-disable react-refresh/only-export-components */
import { Component, useEffect, useState, type ReactNode } from "react";
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/shell";
import { Button, FlagBar, Logo, SealMark } from "./components/ui";
import { config } from "./lib/config";
import type { Permission } from "./lib/contracts";
import { AuditPage, NotificationsPage, ReportsPage, SettingsPage } from "./pages/Admin";
import { ApplicantApplicationsPage, ApplicantLoginPage, ForgotPasswordPage, LoginPage } from "./pages/Auth";
import { AttendancePage, AdjustmentsPage, DTRPage } from "./pages/Attendance";
import { DashboardPage } from "./pages/Dashboard";
import { EmployeeProfilePage, EmployeesPage } from "./pages/Employees";
import { LeavePage } from "./pages/Leave";
import { AllowancesPage, DeductionsPage, LoansPage } from "./pages/Money";
import { MyPayslipsPage, PayrollPage, PayrollRunPage } from "./pages/Payroll";
import { CareersHome, JobDetailPage, PublicAbout, PublicContact, PublicHome, PublicLayout, PublicNews } from "./pages/PublicSite";
import { RecruitmentPage } from "./pages/Recruitment";
import { AppProvider, canSee, useApp } from "./state/store";

/* HashRouter keeps deep links + refresh working on any static host (preview).
   Production Next.js deployment uses App Router file-based routes instead. */

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useApp();
  if (user === undefined) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
function RequirePerm({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { user } = useApp();
  if (!user) return <Navigate to="/login" replace />;
  if (!canSee(user, perm)) return <ForbiddenPage perm={perm} />;
  return <>{children}</>;
}
function ForbiddenPage({ perm }: { perm?: string }) {
  return (
    <div className="app-bg flex min-h-[70vh] items-center justify-center p-6">
      <div className="anim-pop w-full max-w-md rounded-xl border border-ink-200 bg-white p-8 text-center shadow-lift">
        <div className="mx-auto mb-4 w-fit rounded-full bg-red-50 p-4 text-red-600"><ShieldIcon /></div>
        <h1 className="font-display text-2xl font-extrabold text-navy-900">403 — Access restricted</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Your role does not include <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[12px] font-bold text-navy-900">{perm}</code>.
          Authorization is enforced by the API layer; contact your HR administrator if you believe you need this capability.
        </p>
        <Link to="/dashboard" className="mt-5 inline-block"><Button>Back to dashboard</Button></Link>
      </div>
    </div>
  );
}
function ShieldIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}
function NotFoundPage() {
  return (
    <div className="app-bg flex min-h-[70vh] items-center justify-center p-6">
      <div className="anim-pop w-full max-w-md rounded-xl border border-ink-200 bg-white p-8 text-center shadow-lift">
        <div className="mx-auto mb-4 w-fit"><SealMark size={64} /></div>
        <h1 className="font-display text-2xl font-extrabold text-navy-900">Page not found</h1>
        <p className="mt-2 text-sm text-ink-500">The record or page you requested does not exist in this system.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/dashboard"><Button>Dashboard</Button></Link>
          <Link to="/"><Button variant="outline">Public portal</Button></Link>
        </div>
      </div>
    </div>
  );
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; stack: string | null }> {
  state = { error: null as Error | null, stack: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // componentStack names the exact subtree that threw — include it in any support report.
    console.error("[gov-hris] render error:", error, info.componentStack ?? "");
    this.setState({ stack: info.componentStack ?? null });
  }
  render() {
    if (this.state.error) {
      const recover = (to: string) => { this.setState({ error: null, stack: null }); window.location.hash = to; window.location.reload(); };
      return (
        <div className="app-bg flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-8 shadow-lift">
            <div className="mb-2 flex items-center gap-2 text-red-600"><ShieldIcon /><h1 className="font-display text-xl font-extrabold text-navy-900">Something went wrong</h1></div>
            <p className="text-sm text-ink-500">The interface hit an unexpected error. Your data is safe — reload to continue, or report this to HRIS support with the details below.</p>
            <pre className="mt-4 max-h-24 overflow-auto rounded-md bg-ink-900 p-3 text-[11px] leading-relaxed text-red-200">{this.state.error.message}</pre>
            {this.state.stack && (
              <details className="mt-2 rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2 text-[11px] text-ink-500">
                <summary className="cursor-pointer font-bold text-ink-700">Component stack (for support)</summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{this.state.stack}</pre>
              </details>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => recover("#/dashboard")}>Reload application</Button>
              <Button variant="outline" onClick={() => recover("#/login")}>Return to sign in</Button>
              <Button variant="ghost" onClick={() => this.setState({ error: null, stack: null })}>Try to continue</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
function Splash({ onReady }: { onReady: () => void }) {
  useEffect(() => { const t = setTimeout(onReady, 650); return () => clearTimeout(t); }, [onReady]);
  return null;
}

export default function App() {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    (window as unknown as { __HRIS_READY__: boolean }).__HRIS_READY__ = true;
    const boot = document.getElementById("boot");
    const dismiss = () => { boot?.classList.add("done"); setTimeout(() => boot?.remove(), 500); };
    if (booted) dismiss();
    else { const t = setTimeout(dismiss, 2500); return () => clearTimeout(t); }
  }, [booted]);

  return (
    <AppProvider>
      <ErrorBoundary>
        {!booted && <Splash onReady={() => setBooted(true)} />}
        <HashRouter>
          <ScrollToTop />
          <Routes>
            {/* public / SEO surface */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<PublicHome />} />
              <Route path="/about" element={<PublicAbout />} />
              <Route path="/contact" element={<PublicContact />} />
              <Route path="/news" element={<PublicNews />} />
              <Route path="/careers" element={<CareersHome />} />
              <Route path="/careers/jobs" element={<CareersHome />} />
              <Route path="/careers/jobs/:slug" element={<JobDetailPage />} />
            </Route>
            {/* applicant portal */}
            <Route path="/applicant/login" element={<ApplicantLoginPage />} />
            <Route path="/applicant/applications" element={<ApplicantApplicationsPage />} />
            {/* auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            {/* internal HRIS */}
            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/employees" element={<RequirePerm perm="employees.read"><EmployeesPage /></RequirePerm>} />
              <Route path="/employees/:id" element={<RequirePerm perm="employees.read"><EmployeeProfilePage /></RequirePerm>} />
              <Route path="/attendance" element={<RequirePerm perm="attendance.read"><AttendancePage /></RequirePerm>} />
              <Route path="/attendance/dtr" element={<DTRPage />} />
              <Route path="/attendance/adjustments" element={<AdjustmentsPage />} />
              <Route path="/payroll" element={<RequirePerm perm="payroll.read"><PayrollPage /></RequirePerm>} />
              <Route path="/payroll/:id" element={<RequirePerm perm="payroll.read"><PayrollRunPage /></RequirePerm>} />
              <Route path="/payslips" element={<MyPayslipsPage />} />
              <Route path="/leave" element={<LeavePage />} />
              <Route path="/deductions" element={<DeductionsPage />} />
              <Route path="/allowances" element={<RequirePerm perm="allowances.manage"><AllowancesPage /></RequirePerm>} />
              <Route path="/loans" element={<LoansPage />} />
              <Route path="/recruitment" element={<RequirePerm perm="recruitment.manage"><RecruitmentPage /></RequirePerm>} />
              <Route path="/reports" element={<RequirePerm perm="reports.view"><ReportsPage /></RequirePerm>} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/audit" element={<RequirePerm perm="audit.view"><AuditPage /></RequirePerm>} />
              <Route path="/settings" element={<RequirePerm perm="settings.manage"><SettingsPage /></RequirePerm>} />
              <Route path="/settings/:section" element={<RequirePerm perm="settings.manage"><SettingsPage /></RequirePerm>} />
              <Route path="/403" element={<ForbiddenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </HashRouter>
        <span className="hidden"><FlagBar /><Logo size={1} className="hidden" />{config.mode}</span>
      </ErrorBoundary>
    </AppProvider>
  );
}
