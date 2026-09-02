/**
 * @gov-hris/contracts — the single source of truth for domain types and the
 * pure computation engine (salary steps, attendance, government deductions,
 * payroll, loans). Consumed by:
 *
 *   apps/web     (preview adapter + UI formatting — NEVER authoritative)
 *   apps/api     (NestJS domain services — authoritative)
 *   apps/worker  (BullMQ payroll/report processors — authoritative)
 *
 * Bridge note: `types.ts` currently re-exports the interfaces that still live
 * at `src/lib/contracts.ts`. When the monorepo cutover happens, move that file
 * into this package and delete the re-export — import sites do not change.
 */
export * from "./engine";
export * from "./types";
