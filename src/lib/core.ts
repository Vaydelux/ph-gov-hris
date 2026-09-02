/**
 * Framework-agnostic utilities shared by the UI and the PREVIEW adapter.
 * Money is always represented as INTEGER CENTAVOS — floating point is never
 * used for peso arithmetic (production parity: Prisma Decimal / numeric).
 */

export const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

let seq = 0;
export const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/* deterministic RNG for reproducible demo data */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- dates (ISO yyyy-mm-dd) ---------- */
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
export function parseISO(iso: string): Date { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
export const addDaysISO = (iso: string, days: number) => { const d = parseISO(iso); d.setDate(d.getDate() + days); return toISO(d); };
export const isWeekend = (iso: string) => [0, 6].includes(parseISO(iso).getDay());
export const monthDays = (ym: string): string[] => {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${`${i + 1}`.padStart(2, "0")}`);
};
export const currentMonth = () => todayISO().slice(0, 7);
export const prevMonth = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};
export const nextMonth = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};
export function workingDays(startISO: string, endISO: string, holidaySet: Set<string>): number {
  let n = 0;
  for (let d = startISO; d <= endISO; d = addDaysISO(d, 1)) if (!isWeekend(d) && !holidaySet.has(d)) n++;
  return n;
}
export const fmtDateLong = (iso: string) =>
  parseISO(iso.slice(0, 10)).toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "long", day: "numeric" });
export const fmtDateMed = (iso: string) =>
  parseISO(iso.slice(0, 10)).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
export const fmtDateTime = (isoDateTime: string) =>
  new Date(isoDateTime).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
export const monthLabel = (ym: string) =>
  parseISO(`${ym}-01`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });

/* ---------- money ---------- */
export const toCents = (pesos: number) => Math.round(pesos * 100);
export function php(cents: number, opts?: { noDecimals?: boolean }) {
  const v = cents / 100;
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: opts?.noDecimals ? 0 : 2, maximumFractionDigits: opts?.noDecimals ? 0 : 2 })}`;
}
export const sumCents = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/* ---------- time ---------- */
export const fmtMin = (min: number) => `${Math.floor(min / 60)}h ${(min % 60).toString().padStart(2, "0")}m`;
export const fmtClock = (minOfDay: number) => {
  const h = Math.floor(minOfDay / 60), m = minOfDay % 60;
  const hh = h % 12 || 12;
  return `${hh}:${`${m}`.padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const minutesOfDay = (isoDateTime: string) => {
  const d = new Date(isoDateTime);
  return d.getHours() * 60 + d.getMinutes();
};
export const hoursLabel = (min: number) => (min / 60).toFixed(2);

/* ---------- misc ---------- */
export const titleCase = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export const num = (n: number) => n.toLocaleString("en-PH");
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
export function downloadText(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}
export function toCSV(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
