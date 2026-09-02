/**
 * Platform primitives: typed env validation (fail fast), Prisma service,
 * correlation-id middleware, structured audit helper.
 */
import { Injectable, OnModuleDestroy, OnModuleInit, type NestMiddleware } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Supabase PostgreSQL)"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "Service-role key must stay server-side"),
  SUPABASE_JWKS_URL: z.string().url().default("https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json"),
  REDIS_URL: z.string().min(1, "BullMQ requires Redis (Upstash)"),
  APPLICATION_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SENTRY_DSN: z.string().optional(),
});
export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[gov-hris-api] Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env: Env = parsed.data;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

declare module "express" {
  interface Request { correlationId?: string; }
}

/** Every request gets a correlation id that flows through logs + audit + API errors. */
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req.correlationId = (req.headers["x-correlation-id"] as string) ?? randomUUID();
    res.setHeader("x-correlation-id", req.correlationId);
    next();
  }
}

export interface AuditInput {
  actorId: string; actorName: string; action: string; entity: string; entityId: string;
  before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; requestId: string;
}

/** Append-only audit write. Never logs tokens, passwords, or full payroll payloads. */
export async function writeAudit(prisma: PrismaClient, a: AuditInput) {
  await prisma.auditLog.create({ data: { ...a, before: a.before ?? undefined, after: a.after ?? undefined } });
}

export function structuredLog(severity: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), severity, event, ...fields }));
}
