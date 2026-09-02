# Government HRIS — Republic of the Philippines

Enterprise HRIS for Philippine government agencies: employees, timekeeping,
leave, payroll (salary grades/steps, GSIS/PhilHealth/Pag-IBIG/withholding tax),
allowances, salary loans, recruitment, reports, notifications, audit trail.

```
Browser ──▶ apps/web (Vite today → Next.js App Router target)
               │  preview mode: in-browser adapter + fictional fixtures
               │  production : typed REST client ─┐
               ▼                                  ▼
         apps/api (NestJS) ── Prisma ── Supabase PostgreSQL
               │  Supabase Auth JWT verification · RBAC from PostgreSQL
               │  audit on every critical mutation · Decimal-safe money
               └─▶ BullMQ (Upstash Redis) ─▶ apps/worker
                        payroll compute · payslips · ExcelJS/Puppeteer reports
                        └─▶ private Supabase Storage (signed-URL downloads)
```

---

## Preview mode (no accounts, no credentials, no database)

```bash
npm install          # or: pnpm install at workspace root
cp .env.example .env.local   # already defaults to preview — optional
npm run dev          # web app on http://localhost:5173
npm run build        # production web build (verified passing)
```

Everything is navigable immediately: public portal & careers site, applicant
portal, login (demo persona chips fill credentials), dashboards, employees,
attendance + DTR + adjustments, payroll generate→verify→approve→release with
live worker stages, payslips, leave ledger & approvals, deductions, allowances,
loans, recruitment kanban, reports, notifications, audit, settings, and the
amber **Preview Role** switcher in the header for inspecting every role.

Demo sign-ins (password `hris2025`): `admin@hris.gov.ph`, `hr@`, `payroll@`,
`supervisor@`, `head@`, `employee@hris.gov.ph` · applicant portal:
`patricia.lim@gmail.com` / `applicant`.

**Preview guarantees:** demo data lives ONLY in `src/server/` (seed + preview
adapter) behind the single seam `src/lib/api.ts`. Pages never contain fixture
arrays. Government rates in preview/seed are flagged **DEMO** and are never
legal truth. Production mode can never silently fall back to preview data
(unmapped API calls throw `NOT_AVAILABLE_IN_PRODUCTION`).

## Production mode

```bash
# 1. Provision services: Supabase (PostgreSQL + Auth + Storage), Upstash Redis.
# 2. Fill credentials:
cp .env.example .env.local                  # set VITE_APP_MODE=production + VITE_API_URL
cp apps/api/.env.example apps/api/.env      # DATABASE_URL, SUPABASE_*, REDIS_URL…
cp apps/worker/.env.example apps/worker/.env
# 3. Database (Prisma migrations only — never hand-edit production DDL):
pnpm --filter @gov-hris/api db:generate
pnpm --filter @gov-hris/api db:migrate      # dev   (db:deploy in prod)
pnpm --filter @gov-hris/api db:seed         # OPTIONAL, dev only — refuses in production
# 4. Run the three services:
pnpm --filter web dev        # or: npm run dev (web)
pnpm --filter @gov-hris/api start:dev
pnpm --filter @gov-hris/worker start:dev
```

Health probe: `GET <API_URL>/health` (web diagnostics panel pings it).

## Repository structure

| Path | Responsibility |
|---|---|
| `src/` | Web app (presentation). `lib/api.ts` = adapter seam; `lib/config.ts` = Zod-validated env; `lib/contracts.ts` = shared types |
| `src/server/` | **Preview-only** adapter + fixtures. Delete this folder + flip the seam to complete preview removal |
| `packages/contracts/` | Pure computation engine + type bridge (web, API, worker share it) |
| `packages/payroll-processing/` | `computeRun()` — one payroll code path for API + worker |
| `apps/api/` | NestJS: Supabase JWT guard, `@RequirePermissions` RBAC, Prisma, payroll slice, reports, `/health` |
| `apps/worker/` | BullMQ: payroll compute, ExcelJS/Puppeteer reports → private storage (3 retries, exp. backoff, DLQ) |
| `prisma/schema.prisma`, `prisma/seed.ts` | Migration authority + guarded fictional dev seed |
| `src/server/engine.test.ts`, `rbac-state.test.ts` | Unit tests for the pure engine & state machine (`npx vitest run`) |

## Architecture rules that are enforced in code

- Payroll/leave/loan/RBAC logic is authoritative server-side; the web computes nothing for real.
- Money is integer centavos in the engine; `Decimal(15,2)` at the Prisma boundary.
- Payroll runs are idempotent (`idempotencyKey` unique per period) and immutable after release;
  loan amortizations are unique per `(loan, run)` — retries cannot double-deduct.
- Government rules are effective-dated and immutable; each run stores the resolved rule ids.
- Every critical action writes an append-only `AuditLog` with actor, action, before/after, correlation id.
- Files (payslips, CVs, reports) live in the **private** bucket; downloads are 5-minute signed URLs.

## Environment variables you still supply (external)

Supabase project (DATABASE_URL/DIRECT_URL, SUPABASE_URL, anon + service-role keys, JWKS URL) ·
Upstash REDIS_URL · optional SENTRY_DSN · mail provider for real email dispatch.

## Troubleshooting

- **`destroy is not a function` (or any odd React commit error) on startup/login:**
  this is the signature of a stale dependency cache — React and its peers are
  pinned (`react@18.2.0`, `react-router-dom@6.8.0`) and every effect in the tree
  has been audited to return only `undefined` or a cleanup function. Clear the
  Vite pre-bundle cache and reinstall:
  ```bash
  rm -rf node_modules/.vite && npm install && npm run dev
  ```
  If anything ever surfaces again, the error screen now renders the full
  component stack — include it in the report.

## Honest status of this workspace

This sandbox builds and serves **the web app only** (`npm run build` → `vite build`,
verified passing). The NestJS API, worker, and Prisma migrations are complete
source in this repository but require `pnpm install` in a full environment to
compile/run — they are not stubs, and the preview↔production seam
(`src/lib/api.ts`) is exactly where they plug in.
