import {
  Bell, BookOpen, Briefcase, CalendarDays, CheckCheck, ChevronDown, Coins, FileBarChart, FileText, Fingerprint, Gift,
  HelpCircle, Landmark, LayoutDashboard, LogOut, Menu, RotateCcw, ScrollText, Settings, ShieldAlert, UserCog, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn, fmtDateTime } from "../lib/core";
import api from "../lib/api";
import { config } from "../lib/config";
import type { Notification, Permission } from "../lib/contracts";
import { resetDB } from "../server/db";
import { canSee, useApp } from "../state/store";
import { Avatar, Button, FlagBar, LiveClock, Logo, SearchInput, StatusChip, Tag, useClickOutside } from "./ui";

/* ---------------- navigation model ---------------- */
interface NavItem { to: string; label: string; icon: LucideIcon; perm?: Permission; end?: boolean; }
const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: "Overview", items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    group: "Workforce", items: [
      { to: "/employees", label: "Employees", icon: Users, perm: "employees.read" },
      { to: "/attendance", label: "Attendance", icon: Fingerprint, perm: "attendance.read", end: true },
      { to: "/leave", label: "Leave", icon: CalendarDays },
    ],
  },
  {
    group: "Compensation", items: [
      { to: "/payroll", label: "Payroll", icon: Wallet, perm: "payroll.read" },
      { to: "/payslips", label: "My Payslips", icon: FileText },
      { to: "/deductions", label: "Deductions", icon: Landmark, end: true },
      { to: "/allowances", label: "Allowances", icon: Gift, perm: "allowances.manage" },
      { to: "/loans", label: "Loans", icon: Coins },
    ],
  },
  { group: "Talent", items: [{ to: "/recruitment", label: "Recruitment", icon: Briefcase, perm: "recruitment.manage" }] },
  {
    group: "Insight", items: [
      { to: "/reports", label: "Reports", icon: FileBarChart, perm: "reports.view" },
      { to: "/audit", label: "Audit Trail", icon: ScrollText, perm: "audit.view" },
    ],
  },
  { group: "Administration", items: [{ to: "/settings", label: "Settings", icon: Settings, perm: "settings.manage" }] },
];

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const NOTIF_ICON: Record<string, LucideIcon> = { LEAVE: CalendarDays, ATTENDANCE: Fingerprint, PAYROLL: Wallet, LOAN: Coins, RECRUITMENT: Briefcase, REPORT: FileBarChart, SYSTEM: Bell };

/* ---------------- sidebar ---------------- */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, setUser, toast } = useApp();
  const nav = useNavigate();
  const visible = (it: NavItem) => !it.perm || canSee(user, it.perm);
  return (
    <div className="sidebar-texture flex h-full flex-col text-white">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <Logo size={46} className="ring-2 ring-gold-500/70" />
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold-400">PH Government</div>
            <div className="font-display truncate text-[15px] font-bold leading-tight">HR Information System</div>
            <div className="text-[10px] text-white/45">Republic of the Philippines</div>
          </div>
        </div>
        <div className="gold-rule mt-4" />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {NAV.filter((g) => g.items.some(visible)).map((g) => (
          <div key={g.group} className="mt-4 first:mt-0">
            <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{g.group}</div>
            {g.items.filter(visible).map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
                className={({ isActive }) => cn(
                  "group relative mb-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
                  isActive ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]" : "text-white/65 hover:bg-white/6 hover:text-white",
                )}>
                {({ isActive }) => (
                  <>
                    <span className={cn("absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-400 transition-all duration-200", isActive ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0")} />
                    <it.icon size={17} className={cn("transition-colors", isActive ? "text-gold-300" : "text-white/50 group-hover:text-gold-300")} />
                    {it.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-start gap-2 rounded-md bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-white/60">
          <HelpCircle size={14} className="mt-0.5 shrink-0 text-gold-400" />
          Need assistance? Contact <span className="font-semibold text-gold-300">hris.support@dcs.gov.ph</span>
        </div>
        {user && (
          <div className="flex items-center gap-2.5">
            <Avatar name={user.fullName} hue={215} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{user.fullName}</div>
              <div className="truncate text-[10.5px] uppercase tracking-wide text-gold-400/90">{user.role.replace(/_/g, " ")}</div>
            </div>
            <button aria-label="Sign out" onClick={async () => { await api.logout(); setUser(null); toast("Signed out", "info"); nav("/login"); }}
              className="rounded-md p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-red-300">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- preview controls ---------------- */
function PreviewPersonaSwitcher() {
  const { setUser, toast } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(useCallback(() => setOpen(false), []));
  const [personas, setPersonas] = useState<Array<{ id: string; fullName: string; role: string }>>([]);
  useEffect(() => { if (config.isPreview) api.usersList().then((u) => setPersonas(u.map((x) => ({ id: x.id, fullName: x.fullName, role: x.role })))).catch(() => undefined); }, []);
  if (!config.isPreview) return null;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Switch preview role"
        className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100">
        <UserCog size={13} /> Preview Role <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="anim-pop absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lift">
          <div className="border-b border-ink-100 bg-amber-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
            Preview personas — demo identities only
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {personas.map((p) => (
              <button key={p.id} onClick={async () => {
                const u = await api.previewLoginAs(p.id);
                setUser(u); setOpen(false);
                toast(`Now viewing as ${u.fullName}`, "info", `Role: ${u.role.replace(/_/g, " ")}`);
              }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] font-semibold text-navy-900 transition-colors hover:bg-royal-50">
                {p.fullName}
                <Tag tone="navy">{p.role.replace(/_/g, " ")}</Tag>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- notifications ---------------- */
function NotifBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const nav = useNavigate();
  const ref = useClickOutside(useCallback(() => setOpen(false), []));
  useEffect(() => {
    let on = true;
    const load = () => api.unreadCount().then((c) => on && setCount(c)).catch(() => undefined);
    load();
    const iv = setInterval(load, 4000);
    return () => { on = false; clearInterval(iv); };
  }, [open]);
  const openPanel = async () => {
    setOpen((o) => !o);
    setItems(await api.myNotifications().catch(() => []));
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={openPanel} aria-label="Notifications" className="relative rounded-md p-2 text-ink-400 transition-colors hover:bg-royal-50 hover:text-royal-600">
        <Bell size={18} />
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9.5px] font-bold text-white">{count}</span>}
      </button>
      {open && (
        <div className="anim-pop absolute right-0 top-11 z-50 w-[min(92vw,380px)] overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
            <span className="font-display text-[13px] font-bold text-navy-900">Notifications</span>
            <button className="flex items-center gap-1 text-xs font-semibold text-royal-600 hover:text-royal-700"
              onClick={async () => { await api.markAllRead().catch(() => undefined); setItems(await api.myNotifications().catch(() => [])); setCount(0); }}>
              <CheckCheck size={13} /> Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-400">You're all caught up.</p>}
            {items.map((n) => {
              const Icon = NOTIF_ICON[n.type] ?? Bell;
              return (
                <button key={n.id} onClick={async () => { await api.markRead(n.id).catch(() => undefined); setItems(await api.myNotifications().catch(() => [])); setCount(await api.unreadCount().catch(() => 0)); setOpen(false); if (n.link) nav(n.link); }}
                  className={cn("flex w-full items-start gap-3 border-b border-ink-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-royal-50/60", !n.read && "bg-royal-50/40")}>
                  <span className={cn("mt-0.5 rounded-md p-1.5", n.read ? "bg-ink-100 text-ink-400" : "bg-royal-100 text-royal-600")}><Icon size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13px]", n.read ? "font-medium text-ink-500" : "font-bold text-navy-900")}>{n.title}</span>
                    <span className="block truncate text-xs text-ink-400">{n.body}</span>
                    <span className="mt-0.5 block text-[10.5px] font-medium uppercase tracking-wide text-ink-300">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-royal-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- global search ---------------- */
function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ kind: "Employee" | "Job"; id: string; label: string; sub: string; to: string }>>([]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useClickOutside(useCallback(() => setOpen(false), []));
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => api.globalSearch(q.trim()).then((r) => { setResults(r); setOpen(true); }).catch(() => setResults([])), 220);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative hidden w-full max-w-md md:block" ref={ref}>
      <SearchInput value={q} onChange={setQ} placeholder="Search employees, positions, jobs…  ( / )" />
      {open && results.length > 0 && (
        <div className="anim-pop absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lift">
          {results.map((r) => (
            <button key={r.kind + r.id} onClick={() => { nav(r.to); setOpen(false); setQ(""); }}
              className="flex w-full items-center justify-between gap-3 border-b border-ink-100 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-royal-50/60">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-navy-900">{r.label}</span>
                <span className="block truncate text-xs text-ink-400">{r.sub}</span>
              </span>
              <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- user menu ---------------- */
function UserMenu() {
  const { user, setUser } = useApp();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast } = useApp();
  const nav = useNavigate();
  const ref = useClickOutside(useCallback(() => { setOpen(false); setConfirmReset(false); }, []));
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-royal-50" aria-label="Account menu">
        <Avatar name={user.fullName} hue={215} size={32} />
        <span className="hidden text-left lg:block">
          <span className="block max-w-32 truncate text-[12.5px] font-bold leading-tight text-navy-900">{user.fullName}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-royal-600">{user.role.replace(/_/g, " ")}</span>
        </span>
        <ChevronDown size={14} className={cn("text-ink-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="anim-pop absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lift">
          <div className="border-b border-ink-100 bg-navy-900 px-4 py-3 text-white">
            <div className="text-[13px] font-bold">{user.fullName}</div>
            <div className="truncate text-[11px] text-white/60">{user.email}</div>
            <div className="mt-1.5"><StatusChip status={user.role} /></div>
          </div>
          <div className="p-1.5">
            <button onClick={() => { nav("/notifications"); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-ink-700 hover:bg-royal-50"><Bell size={15} className="text-ink-400" /> Notifications</button>
            <button onClick={() => { nav("/settings"); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-ink-700 hover:bg-royal-50"><Settings size={15} className="text-ink-400" /> Settings</button>
            <a href="#/careers" className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-ink-700 hover:bg-royal-50"><BookOpen size={15} className="text-ink-400" /> Public portal</a>
            {config.isPreview && (!confirmReset ? (
              <button onClick={() => setConfirmReset(true)} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-ink-700 hover:bg-amber-50"><RotateCcw size={15} className="text-ink-400" /> Reset demo data</button>
            ) : (
              <div className="m-1 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <p className="mb-2 font-semibold">Restore the original seeded dataset? Your changes will be lost.</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="danger" onClick={() => { resetDB(); toast("Demo data restored", "success"); setOpen(false); setConfirmReset(false); }}>Reset</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
                </div>
              </div>
            ))}
            <button onClick={async () => { await api.logout(); setUser(null); nav("/login"); }}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-semibold text-red-600 hover:bg-red-50"><LogOut size={15} /> Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- toasts ---------------- */
function ToastHost() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={cn(
          "anim-slide-r pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-lift",
          t.kind === "success" && "border-emerald-200 bg-white", t.kind === "error" && "border-red-200 bg-white", t.kind === "info" && "border-royal-200 bg-white",
        )}>
          <span className={cn("mt-0.5 size-2 shrink-0 rounded-full", t.kind === "success" ? "bg-emerald-500" : t.kind === "error" ? "bg-red-500" : "bg-royal-500")} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-navy-900">{t.title}</p>
            {t.body && <p className="mt-0.5 text-xs text-ink-500">{t.body}</p>}
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-300">{fmtDateTime(new Date().toISOString())}</p>
          </div>
          <button onClick={() => dismissToast(t.id)} className="text-ink-300 hover:text-ink-700" aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- shell ---------------- */
export default function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawer]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        const el = document.querySelector<HTMLInputElement>("input[placeholder^='Search employees']");
        if (el) { e.preventDefault(); el.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-bg min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] lg:block" aria-label="Sidebar">
        <SidebarContent />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="anim-fade-in absolute inset-0 bg-navy-950/60" onClick={() => setDrawer(false)} />
          <div className="anim-fade-in absolute inset-y-0 left-0 w-[290px] shadow-deep">
            <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-[280px]">
        <FlagBar />
        {config.isPreview && (
          <div className="flex items-center justify-center gap-2 border-b border-amber-300/70 bg-amber-100/80 px-4 py-1.5 text-[11px] font-bold tracking-wide text-amber-900">
            <ShieldAlert size={13} /> PREVIEW MODE — fictional demo data, no real credentials. Switch <code className="rounded bg-amber-200 px-1">VITE_APP_MODE=production</code> for the live API.
          </div>
        )}
        {config.misconfigured && (
          <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-1.5 text-[11px] font-bold text-white">
            <ShieldAlert size={13} /> {config.misconfigured}
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200/70 bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button onClick={() => setDrawer(true)} className="rounded-md p-2 text-ink-500 transition-colors hover:bg-royal-50 hover:text-royal-600 lg:hidden" aria-label="Open menu"><Menu size={20} /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <LiveClock />
            <span className="hidden h-5 w-px bg-ink-200 sm:block" />
            <PreviewPersonaSwitcher />
            <NotifBell />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-ink-200/60 px-6 py-4 text-center text-[11px] text-ink-400">
          Government HRIS · Republic of the Philippines — {config.isPreview ? "preview environment with fictional data. Government rates shown are demo configuration." : "production environment."}
        </footer>
      </div>
      <ToastHost />
    </div>
  );
}
