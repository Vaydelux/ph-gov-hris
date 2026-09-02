import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import api from "../lib/api";
import { config } from "../lib/config";
import { can } from "../server/rbac";
import type { Permission, UserProfile } from "../lib/contracts";

export interface Toast { id: number; title: string; body?: string; kind: "success" | "error" | "info"; }
interface AppState {
  user: UserProfile | null;
  setUser: (u: UserProfile | null) => void;
  toasts: Toast[];
  toast: (title: string, kind?: Toast["kind"], body?: string) => void;
  dismissToast: (id: number) => void;
  version: number;
}
const Ctx = createContext<AppState | null>(null);
let toastSeq = 1;

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [version, setVersion] = useState(0);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((title: string, kind: Toast["kind"] = "success", body?: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-3), { id, title, body, kind }]);
    setTimeout(() => dismissToast(id), 5200);
  }, [dismissToast]);

  useEffect(() => {
    api.me().then((u) => setUser(u)).catch(() => setUser(null));
    const onUnauthorized = () => setUser(null);
    window.addEventListener("govhris:unauthorized", onUnauthorized);
    return () => window.removeEventListener("govhris:unauthorized", onUnauthorized);
  }, []);

  /* re-render consumers when the data store changes (preview adapter bus) */
  useEffect(() => {
    if (!config.isPreview) return;
    import("../server/db").then(({ subscribe }) => subscribe(() => setVersion((v) => v + 1)));
  }, []);

  const value = useMemo(() => ({ user, setUser, toasts, toast, dismissToast, version }), [user, toasts, toast, dismissToast, version]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

/** UI visibility only — NestJS PermissionsGuard remains the authority. */
export const canSee = (user: UserProfile | null, perm: Permission) => can(user, perm);

/** TanStack-Query-style data hook (query keys live at call sites via deps). */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[], opts?: { enabled?: boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (opts?.enabled === false) { setLoading(false); return; }
    let on = true;
    setLoading(true); setError(null);
    fnRef.current()
      .then((d) => { if (on) { setData(d); setLoading(false); } })
      .catch((e) => { if (on) { setError(e instanceof Error ? e.message : "Request failed"); setLoading(false); } });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
