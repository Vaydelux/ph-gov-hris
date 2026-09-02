/**
 * Bridge re-export. The full entity/DTO contract surface currently lives at
 * `src/lib/contracts.ts` (shared by the web app), including the payroll state
 * machine (`PAYROLL_TRANSITIONS`, `assertPayrollTransition`) and `ApiError`.
 *
 * Monorepo cutover: move that file into this package as `types.ts`, delete
 * this bridge, and update web imports to `@gov-hris/contracts`. No logic
 * changes — the surface is already framework-neutral.
 */
export * from "../../../src/lib/contracts";
