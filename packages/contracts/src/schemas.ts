/**
 * Shared Zod DTO schemas — validated in NestJS pipes AND by the web forms.
 * The browser validates for UX; the API re-validates authoritatively.
 */
import { z } from "zod";

export const leaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  docName: z.string().max(120).optional(),
}).refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after start date" });

export const payrollGenerateSchema = z.object({
  periodId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const loanApplySchema = z.object({
  loanTypeId: z.string().min(1),
  amountCents: z.number().int().positive(),
  termMonths: z.number().int().min(6).max(60),
});

export const employeeCreateSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  gender: z.enum(["M", "F"]),
  email: z.string().email(),
  departmentId: z.string().min(1),
  positionId: z.string().min(1),
  salaryStep: z.number().int().min(1).max(8),
  hiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
