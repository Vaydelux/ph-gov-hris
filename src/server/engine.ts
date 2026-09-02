/**
 * Re-export shim. The canonical pure computation engine lives in the shared
 * contracts package so the NestJS API and BullMQ worker use byte-identical
 * formulas — one source of truth, no copy-pasted payroll math.
 */
export * from "../../packages/contracts/src/engine";
