/**
 * PREVIEW persistence adapter (localStorage) + session store.
 * Production: persistence is PostgreSQL via Prisma inside the NestJS API;
 * identity is Supabase Auth. This module is deleted when preview mode is
 * removed — see README "Removing preview mode".
 */
import type { AuditLog, DB, Session, UserProfile } from "../lib/contracts";
import { uid } from "../lib/core";
import { buildSeed } from "./seed";

const DB_KEY = "govhris.db.v1";
const SESSION_KEY = "govhris.session";

let cache: DB | null = null;

export function getDB(): DB {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.version === 1) { cache = parsed; return cache; }
    }
  } catch { /* corrupted preview store — reseed */ }
  const seeded = buildSeed();
  cache = seeded;
  persist();
  return seeded;
}
export function persist(): void {
  try { if (cache) localStorage.setItem(DB_KEY, JSON.stringify(cache)); } catch { /* storage full/unavailable in preview */ }
}
export function resetDB(): void {
  cache = buildSeed();
  persist();
  emit();
}

/* ---------- session (preview stand-in for Supabase Auth session) ---------- */
export function sessionUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return getDB().users.find((u) => u.id === s.userId) ?? null;
  } catch { return null; }
}
export function setSession(userId: string): void {
  const s: Session = { userId, issuedAt: Date.now(), expiresAt: Date.now() + 8 * 3600_000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  emit();
}
export function clearSession(): void { localStorage.removeItem(SESSION_KEY); emit(); }

/* ---------- audit & notifications (always via the service layer) ---------- */
let requestSeq = 0;
export const newRequestId = () => `req_${Date.now().toString(36)}_${(requestSeq++).toString(36)}`;
export function audit(actor: UserProfile | null, action: string, entity: string, entityId: string, before?: Record<string, unknown> | null, after?: Record<string, unknown> | null): void {
  const entry: AuditLog = {
    id: uid("aud"), actorId: actor?.id ?? "system", actorName: actor?.fullName ?? "System",
    action, entity, entityId, before: before ?? null, after: after ?? null,
    requestId: newRequestId(), at: new Date().toISOString(),
  };
  getDB().audit.unshift(entry);
}
export function notify(n: Omit<import("../lib/contracts").Notification, "id" | "read" | "createdAt">): void {
  getDB().notifications.unshift({ ...n, id: uid("ntf"), read: false, createdAt: new Date().toISOString() });
}

/* ---------- transactional mutation + change bus ---------- */
const listeners = new Set<() => void>();
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const emit = () => { persist(); listeners.forEach((fn) => fn()); };

export function mutate<T>(fn: (db: DB) => T): T {
  const db = getDB();
  // Snapshot-free single-writer transaction: fn either completes fully or throws.
  const result = fn(db);
  emit();
  return result;
}
