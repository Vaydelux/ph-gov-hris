/**
 * Typed environment configuration (Zod-validated).
 *
 *   VITE_APP_MODE=preview     → in-browser preview adapter + demo fixtures
 *   VITE_APP_MODE=production  → real NestJS API over HTTP (never falls back
 *                               to demo data; missing config fails loudly)
 *
 * Production equivalents for the Next.js web app: NEXT_PUBLIC_APP_MODE,
 * NEXT_PUBLIC_API_URL — same semantics.
 */
import { z } from "zod";

const schema = z.object({
  APP_MODE: z.enum(["preview", "production"]).default("preview"),
  API_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

const raw = {
  APP_MODE: (import.meta.env.VITE_APP_MODE as string | undefined) ?? "preview",
  API_URL: (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.VITE_API_BASE as string | undefined),
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN as string | undefined,
};

const parsed = schema.safeParse(raw);

export const config = {
  mode: parsed.success ? parsed.data.APP_MODE : "production",
  apiUrl: parsed.success ? (parsed.data.API_URL ?? "/api/v1").replace(/\/$/, "") : "/api/v1",
  supabaseUrl: parsed.success ? parsed.data.SUPABASE_URL : undefined,
  supabaseAnonKey: parsed.success ? parsed.data.SUPABASE_ANON_KEY : undefined,
  isPreview: (parsed.success ? parsed.data.APP_MODE : "production") === "preview",
  /** Production must fail fast & loud — never silently fall back to demo data. */
  misconfigured: !parsed.success
    ? "Invalid environment configuration. Set VITE_APP_MODE=preview, or provide VITE_API_URL for production mode."
    : raw.APP_MODE === "production" && !raw.API_URL
      ? "VITE_APP_MODE=production but VITE_API_URL is missing. The UI will not use demo data — configure the API URL or run in preview mode."
      : undefined,
  buildInfo: { app: "gov-hris-web", version: "1.0.0", builtAt: new Date().toISOString() },
};

if (config.misconfigured) console.error(`[gov-hris] ${config.misconfigured}`);
if (config.isPreview) console.info("[gov-hris] PREVIEW MODE — fictional demo data from src/server/seed.ts. Production: set VITE_APP_MODE=production + VITE_API_URL.");
