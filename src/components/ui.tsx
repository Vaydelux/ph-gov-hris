import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Inbox, Info, Loader2, Search, X, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn, initials, php, titleCase } from "../lib/core";

export const ASSETS = {
  logo: "https://image.qwenlm.ai/generated-images/d288516a-2aef-469d-94cc-fc91838aa81d/_result.png",
  building: "https://image.qwenlm.ai/generated-images/61c6a021-81f8-4c86-9512-618b38edef2e/_result.png",
};

/* ================= buttons ================= */
type BtnVariant = "primary" | "navy" | "outline" | "ghost" | "danger" | "gold" | "subtle";
export function Button({ variant = "primary", size = "md", loading, icon: Icon, children, className, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: LucideIcon }) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-9.5 px-4 text-sm", lg: "h-11 px-5 text-sm" };
  const variants: Record<BtnVariant, string> = {
    primary: "bg-royal-500 text-white hover:bg-royal-600 shadow-sm shadow-royal-500/30",
    navy: "bg-navy-900 text-white hover:bg-navy-700",
    gold: "bg-gold-500 text-navy-950 hover:bg-gold-400 shadow-sm shadow-gold-500/30",
    outline: "border border-ink-200 bg-white text-ink-700 hover:border-royal-400 hover:text-royal-600",
    ghost: "text-ink-500 hover:bg-ink-100/70 hover:text-ink-900",
    subtle: "bg-royal-50 text-royal-700 hover:bg-royal-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} {...rest}>
      {loading ? <Loader2 size={15} className="anim-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

/* ================= status chips ================= */
const TONE: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/25",
  blue: "bg-royal-50 text-royal-700 ring-royal-500/25",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25",
  red: "bg-red-50 text-red-700 ring-red-600/25",
  gray: "bg-ink-50 text-ink-500 ring-ink-300/40",
  navy: "bg-navy-900/5 text-navy-800 ring-navy-800/20",
  gold: "bg-gold-50 text-gold-700 ring-gold-500/30",
};
const DOT: Record<string, string> = {
  green: "bg-emerald-500", blue: "bg-royal-500", amber: "bg-amber-500", red: "bg-red-500", gray: "bg-ink-300", navy: "bg-navy-800", gold: "bg-gold-500",
};
const STATUS_TONE: Record<string, string> = {
  ON_TIME: "green", RELEASED: "green", ACTIVE: "green", PAID: "green", APPROVED: "green", HIRED: "green", DONE: "green", OPEN: "green", VERIFIED: "green",
  LATE: "amber", UNDERTIME: "amber", LATE_AND_UNDERTIME: "amber", PENDING: "amber", PENDING_SUPERVISOR: "amber", PENDING_HR: "amber",
  FOR_VERIFICATION: "amber", FOR_APPROVAL: "amber", FOR_FINAL_REVIEW: "amber", UNDER_REVIEW: "amber", SUBMITTED: "amber",
  ABSENT: "red", REJECTED: "red", FAILED: "red", CANCELLED: "red", CLOSED: "red",
  COMPUTING: "blue", COMPUTED: "blue", QUEUED: "blue", ON_LEAVE: "blue", OFFICIAL_BUSINESS: "blue", SHORTLISTED: "blue",
  INTERVIEW_SCHEDULED: "blue", INTERVIEWED: "blue", PROCESSING: "blue", SCHEDULED: "blue",
  DRAFT: "gray", INACTIVE: "gray", ARCHIVED: "gray", INCOMPLETE: "gray", NEW: "gray", WITHDRAWN: "gray", SEPARATED: "gray",
  HOLIDAY: "navy", REST_DAY: "navy", SYSTEM_ADMIN: "navy",
};
export function StatusChip({ status, pulse }: { status: string; pulse?: boolean }) {
  const tone = STATUS_TONE[status] ?? "gray";
  const live = pulse ?? ["COMPUTING", "PROCESSING", "QUEUED"].includes(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", TONE[tone])}>
      <span className={cn("size-1.5 rounded-full", DOT[tone], live && "pulse-dot")} />
      {titleCase(status)}
    </span>
  );
}
export function Tag({ children, tone = "gray" }: { children: ReactNode; tone?: keyof typeof TONE }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONE[tone])}>{children}</span>;
}

/* ================= surfaces ================= */
export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={cn("rounded-lg border border-ink-200/70 bg-white shadow-card", pad && "p-5", className)}>{children}</div>;
}
export function PageHeader({ title, sub, actions, flag }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; flag?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {flag && <div className="mb-2">{flag}</div>}
        <h1 className="font-display text-[26px] font-extrabold leading-tight text-navy-900">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-ink-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">{children}</div>;
}
export function Money({ cents, className, signed }: { cents: number; className?: string; signed?: boolean }) {
  return (
    <span className={cn("tabular font-semibold", signed && cents < 0 && "text-red-600", className)}>
      {signed && cents < 0 ? `(${php(Math.abs(cents))})` : php(cents)}
    </span>
  );
}
export function Avatar({ name, hue, size = 36 }: { name: string; hue: number; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 30%))` }}>
      {initials(name)}
    </span>
  );
}
export function FlagBar({ className }: { className?: string }) {
  return <div className={cn("gov-flag-bar h-1 w-full", className)} aria-hidden />;
}
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return <img src={ASSETS.logo} alt="Government HRIS seal" width={size} height={size} className={cn("rounded-full", className)} draggable={false} />;
}
export function SealMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-label="Government HRIS seal" role="img">
      <defs><radialGradient id="sealg" cx="50%" cy="42%" r="65%"><stop offset="0%" stopColor="#171268" /><stop offset="100%" stopColor="#050126" /></radialGradient></defs>
      <circle cx="48" cy="48" r="46" fill="url(#sealg)" stroke="#c9a227" strokeWidth="2.5" />
      <circle cx="48" cy="48" r="38" fill="none" stroke="#c9a227" strokeWidth="1" opacity=".7" />
      <circle cx="48" cy="40" r="11" fill="#d9b93f" />
      <g stroke="#d9b93f" strokeWidth="2" strokeLinecap="round">
        <line x1="48" y1="20" x2="48" y2="25" /><line x1="34" y1="26" x2="37" y2="30" /><line x1="62" y1="26" x2="59" y2="30" />
        <line x1="28" y1="40" x2="33" y2="40" /><line x1="68" y1="40" x2="63" y2="40" />
      </g>
      <path d="M22 68 L34 48 L42 58 L52 42 L74 68 Z" fill="#2170e4" opacity=".9" />
      <path d="M30 68 L40 54 L46 61 L54 50 L66 68 Z" fill="#0058be" />
      <path d="M48 12 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5-2.4 -4.5 2.4 .9-5 -3.6-3.5 5-.7 Z" fill="#e8d07a" transform="translate(0,-2) scale(.85)" transformOrigin="48 16" />
    </svg>
  );
}
export function KPI({ label, value, icon: Icon, tone = "blue", hint, delay }:
  { label: string; value: ReactNode; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "red" | "navy" | "gold"; hint?: ReactNode; delay?: number }) {
  const tones = {
    blue: "bg-royal-50 text-royal-600", green: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600", navy: "bg-navy-900/6 text-navy-800", gold: "bg-gold-50 text-gold-600",
  };
  return (
    <div className="group anim-fade-up rounded-lg border border-ink-200/70 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift" style={{ animationDelay: `${delay ?? 0}ms` }}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</div>
          <div className="font-display mt-1.5 text-[26px] font-extrabold leading-none text-navy-900">{value}</div>
          {hint && <div className="mt-1.5 truncate text-xs text-ink-400">{hint}</div>}
        </div>
        <span className={cn("rounded-md p-2.5 transition-transform duration-200 group-hover:scale-110", tones[tone])}><Icon size={18} /></span>
      </div>
    </div>
  );
}
export function ProgressBar({ value, tone = "blue" }: { value: number; tone?: "blue" | "gold" | "green" }) {
  const t = { blue: "bg-royal-500", gold: "bg-gold-500", green: "bg-emerald-500" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={cn("h-full rounded-full transition-all duration-500 ease-out", t)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/* ================= forms ================= */
export function Field({ label, error, hint, required, children }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 flex items-center gap-1 font-semibold text-ink-700">{label}{required && <span className="text-red-600">*</span>}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      {error && <span className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600"><AlertTriangle size={12} /> {error}</span>}
    </label>
  );
}
const inputCls = "h-9.5 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300 transition-colors focus:border-royal-500 focus:outline-none focus:ring-2 focus:ring-royal-500/20 disabled:bg-ink-50 disabled:text-ink-400";
export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <input className={cn(inputCls, invalid && "border-red-400 focus:border-red-500 focus:ring-red-500/20", className)} {...rest} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={cn(inputCls, "h-auto min-h-20 py-2 leading-relaxed", className)} {...rest} />;
}
export function Select({ children, className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(inputCls, "appearance-none pr-8", className)} {...rest}>{children}</select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
    </div>
  );
}
export function SearchInput({ value, onChange, placeholder, className, inputRef }:
  { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; inputRef?: React.Ref<HTMLInputElement> }) {
  return (
    <div className={cn("relative", className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search…"} className={cn(inputCls, "pl-9")} />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700" aria-label="Clear search"><X size={14} /></button>
      )}
    </div>
  );
}

/* ================= overlays ================= */
export function Modal({ open, onClose, title, children, width = "max-w-lg", footer }:
  { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="anim-fade-in absolute inset-0 bg-navy-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn("anim-pop relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-deep sm:rounded-xl", width)}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h3 className="font-display text-[15px] font-bold text-navy-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900" aria-label="Close dialog"><X size={17} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = "Confirm", danger }:
  { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></>}>
      <p className="text-sm leading-relaxed text-ink-600">{body}</p>
    </Modal>
  );
}
export function Drawer({ open, onClose, title, children, width = "max-w-xl" }:
  { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
      <div className="anim-fade-in absolute inset-0 bg-navy-950/50" onClick={onClose} />
      <div className={cn("anim-slide-r absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-deep", width)}>
        <div className="flex items-center justify-between border-b border-ink-100 bg-navy-900 px-5 py-4">
          <h3 className="font-display text-[15px] font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close drawer"><X size={17} /></button>
        </div>
        <div className="app-bg min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ================= table ================= */
export interface Col<T> { key: string; label: ReactNode; align?: "left" | "right" | "center"; className?: string; render?: (row: T) => ReactNode; sortValue?: (row: T) => string | number; }
export function DataTable<T extends { id: string }>({ rows, cols, loading, error, onRetry, empty, rowClick, footer }:
  { rows: T[]; cols: Col<T>[]; loading?: boolean; error?: string; onRetry?: () => void; empty?: ReactNode; rowClick?: (row: T) => void; footer?: ReactNode }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = sort ? [...rows].sort((a, b) => {
    const col = cols.find((c) => c.key === sort.key);
    const av = col?.sortValue ? col.sortValue(a) : String((a as Record<string, unknown>)[sort.key] ?? "");
    const bv = col?.sortValue ? col.sortValue(b) : String((b as Record<string, unknown>)[sort.key] ?? "");
    return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
  }) : rows;
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200/70 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-ink-200/70 bg-ink-50/80 text-left">
              {cols.map((c) => (
                <th key={c.key} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-400", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}>
                  {c.sortValue ? (
                    <button className="inline-flex items-center gap-1 hover:text-navy-900" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                      {c.label}{sort?.key === c.key && <ChevronDown size={12} className={cn("transition-transform", sort.dir === -1 && "rotate-180")} />}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-ink-100 last:border-0">
                {cols.map((c) => <td key={c.key} className="px-4 py-3"><div className="skeleton h-4 w-full max-w-40" /></td>)}
              </tr>
            ))}
            {!loading && error && (
              <tr><td colSpan={cols.length} className="px-4 py-10 text-center">
                <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-sm text-red-600"><XCircle size={22} /> {error}</div>
                {onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Retry</Button>}
              </td></tr>
            )}
            {!loading && !error && sorted.length === 0 && (
              <tr><td colSpan={cols.length} className="px-4 py-12 text-center">
                {empty ?? <div className="flex flex-col items-center gap-2 text-ink-400"><Inbox size={26} /><p className="text-sm">No records found</p></div>}
              </td></tr>
            )}
            {!loading && !error && sorted.map((row) => (
              <tr key={row.id} onClick={() => rowClick?.(row)} className={cn("border-b border-ink-100 last:border-0 transition-colors", rowClick && "cursor-pointer hover:bg-royal-50/50")}>
                {cols.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle text-ink-700", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="border-t border-ink-100 bg-ink-50/50 px-4 py-2.5">{footer}</div>}
    </div>
  );
}
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <span className="text-xs text-ink-400">{total} record{total === 1 ? "" : "s"}</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-400">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"
          className="rounded-md border border-ink-200 bg-white p-1.5 text-ink-500 transition-colors hover:border-royal-400 hover:text-royal-600 disabled:opacity-40"><ChevronLeft size={14} /></button>
        <span className="min-w-14 text-center text-xs font-semibold text-ink-700">Page {page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"
          className="rounded-md border border-ink-200 bg-white p-1.5 text-ink-500 transition-colors hover:border-royal-400 hover:text-royal-600 disabled:opacity-40"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

/* ================= misc ================= */
export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      <span className="rounded-full bg-royal-50 p-3 text-royal-500"><Icon size={24} /></span>
      <p className="font-display text-[15px] font-bold text-navy-900">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-400">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function InfoNote({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" | "gold" }) {
  const t = { blue: "border-royal-200 bg-royal-50 text-royal-800", amber: "border-amber-300 bg-amber-50 text-amber-900", gold: "border-gold-300 bg-gold-50 text-gold-700" }[tone];
  const Icon = tone === "amber" ? AlertTriangle : Info;
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs leading-relaxed", t)}>
      <Icon size={14} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </div>
  );
}
export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-ink-100 bg-ink-50/50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-ink-900">{children}</div>
    </div>
  );
}
export function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <span className="tabular hidden font-display text-xs font-semibold tracking-wide text-ink-400 xl:block">
      {now.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })} · {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
    </span>
  );
}
export function useClickOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onOut]);
  return ref;
}
