/** Typed environment validation — production fails fast with a clear message. */
import { z } from "zod";

const base = z.object({
  APP_MODE: z.enum(["preview", "production"]).default("preview"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APPLICATION_URL: z.string().default("http://localhost:5173"),
});

const productionExtras = z.object({
  DATABASE_URL: z.string().min(10, "DATABASE_URL is required in production"),
  DIRECT_URL: z.string().min(10),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, "Service role key stays server-side only"),
  SUPABASE_JWT_SECRET: z.string().min(10),
  REDIS_URL: z.string().min(10),
});

const parsed = base.safeParse(process.env);
if (!parsed.success) {
  console.error("[gov-hris/api] Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const config = parsed.data;

if (config.APP_MODE === "production") {
  const prod = productionExtras.safeParse(process.env);
  if (!prod.success) {
    console.error("[gov-hris/api] PRODUCTION MODE missing required configuration:", prod.error.flatten().fieldErrors);
    console.error("Fill apps/api/.env from .env.example — the API refuses to start rather than faking success.");
    process.exit(1);
  }
  Object.assign(config, prod.data);
} else {
  console.warn("[gov-hris/api] Running in PREVIEW mode — persistence endpoints require DATABASE_URL. Preview data is served by the web app adapter.");
}

export const optional = {
  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? "development",
  STORAGE_BUCKET_REPORTS: process.env.STORAGE_BUCKET_REPORTS ?? "hris-reports",
  STORAGE_BUCKET_DOCUMENTS: process.env.STORAGE_BUCKET_DOCUMENTS ?? "hris-documents",
  SMTP_HOST: process.env.SMTP_HOST,
};
