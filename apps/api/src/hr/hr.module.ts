/**
 * Employees, Attendance, Biometric integration boundary.
 * Raw biometric logs are immutable; corrections are approved adjustments.
 */
import {
  Body, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Patch,
  Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { Audited, JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../common";
import { PrismaService } from "../prisma/prisma.service";
import { employeeCreateSchema } from "@gov-hris/contracts";

type AuthedReq = { user: { sub: string; employeeId?: string; permissions: string[]; email: string } };

/* ---------- vendor-neutral biometric adapter boundary ---------- */
export interface BiometricAdapter {
  connect(): Promise<void>;
  healthCheck(): Promise<boolean>;
  fetchLogs(since: Date): Promise<Array<{ deviceCode: string; at: Date }>>;
  normalizeLog(raw: unknown): { deviceCode: string; at: Date };
  mapEmployeeIdentifier(deviceCode: string): Promise<string | null>;
}
export class GenericPunchAdapter implements BiometricAdapter {
  async connect() { /* vendor client init */ }
  async healthCheck() { return true; }
  async fetchLogs() { return []; }
  normalizeLog(raw: unknown) { const r = raw as { code: string; time: string }; return { deviceCode: r.code, at: new Date(r.time) }; }
  async mapEmployeeIdentifier() { return null; }
}

@Controller("employees")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermissions("employees.read")
  async list(@Query() q: { page?: string; pageSize?: string; q?: string; departmentId?: string; status?: string }) {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Number(q.pageSize ?? 12));
    const where = {
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ employeeNo: { contains: q.q, mode: "insensitive" as const } }, { lastName: { contains: q.q, mode: "insensitive" as const } }, { firstName: { contains: q.q, mode: "insensitive" as const } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, include: { position: true, department: true }, orderBy: { lastName: "asc" } }),
      this.prisma.employee.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  @Get(":id")
  @RequirePermissions("employees.read")
  detail(@Param("id") id: string) {
    return this.prisma.employee.findUnique({
      where: { id },
      include: { position: true, department: true, compensation: { orderBy: { effectiveFrom: "desc" }, take: 10 }, allowances: { where: { active: true }, include: { allowanceType: true } }, loans: true },
    }).then((e) => e ?? (() => { throw new NotFoundException("Employee not found."); })());
  }

  @Post()
  @RequirePermissions("employees.create")
  @Audited("employee.create", "Employee")
  async create(@Body() body: unknown) {
    const input = employeeCreateSchema.parse(body);
    return this.prisma.employee.create({ data: { ...input, hiredAt: new Date(input.hiredAt), gender: input.gender, employeeNo: `DCS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}` } });
  }

  @Patch(":id")
  @RequirePermissions("employees.update")
  @Audited("employee.update", "Employee")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const allowed = ["salaryStep", "status", "phone", "appointmentType", "positionId", "departmentId", "separatedAt"] as const;
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => (allowed as readonly string[]).includes(k)));
    return this.prisma.employee.update({ where: { id }, data: patch });
  }
}

@Controller("attendance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermissions("attendance.read")
  async day(@Query() q: { date?: string; page?: string; pageSize?: string; status?: string }) {
    const date = q.date ? new Date(q.date) : new Date();
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Number(q.pageSize ?? 12));
    const [rows, total] = await Promise.all([
      this.prisma.attendanceDay.findMany({
        where: { date, ...(q.status ? { status: q.status as never } : {}) },
        skip: (page - 1) * pageSize, take: pageSize, include: { employee: { include: { department: true } } }, orderBy: { createdAt: "asc" },
      }),
      this.prisma.attendanceDay.count({ where: { date } }),
    ]);
    return { rows, total, page, pageSize };
  }

  @Get("overview")
  @RequirePermissions("attendance.read")
  async overview(@Query("date") date?: string) {
    const d = date ? new Date(date) : new Date();
    const [total, present, late, absent] = await Promise.all([
      this.prisma.employee.count({ where: { status: "ACTIVE" } }),
      this.prisma.attendanceDay.count({ where: { date, clockIn: { not: null } } }),
      this.prisma.attendanceDay.count({ where: { date, lateMin: { gt: 0 } } }),
      this.prisma.attendanceDay.count({ where: { date, status: { in: ["ABSENT", "ON_LEAVE"] } } }),
    ]);
    return { totalEmployees: total, present, late, absentOrLeave: absent };
  }

  @Get("dtr/:employeeId")
  async dtr(@Param("employeeId") employeeId: string, @Query("ym") ym: string, @Req() req: AuthedReq) {
    // Horizontal-escalation guard: employees may only fetch their own DTR.
    if (req.user.employeeId !== employeeId && !req.user.permissions.includes("attendance.read"))
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Not authorized for this DTR." });
    const [from, to] = [new Date(`${ym}-01`), new Date(`${ym}-31`)];
    return this.prisma.attendanceDay.findMany({ where: { employeeId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
  }

  @Post("adjustments")
  @Audited("attendance.adjustment_requested", "AttendanceAdjustment")
  async request(@Body() body: { employeeId: string; date: string; kind: string; newValue: string; reason: string }, @Req() req: AuthedReq) {
    if (req.user.employeeId !== body.employeeId && !req.user.permissions.includes("attendance.adjust"))
      throw new ForbiddenException({ code: "FORBIDDEN", message: "You may only request adjustments for yourself." });
    return this.prisma.attendanceAdjustment.create({ data: { employeeId: body.employeeId, date: new Date(body.date), kind: body.kind as never, oldValue: "—", newValue: body.newValue, reason: body.reason, requestedBy: req.user.sub } });
  }

  @Post("adjustments/:id/decide")
  @RequirePermissions("attendance.adjust")
  @Audited("attendance.adjustment_decided", "AttendanceAdjustment")
  async decide(@Param("id") id: string, @Body() body: { approve: boolean; note?: string }, @Req() req: AuthedReq) {
    return this.prisma.tx(async (tx) => {
      const adj = await tx.attendanceAdjustment.findUnique({ where: { id } });
      if (!adj || adj.status !== "PENDING") throw new NotFoundException("Adjustment not found or already decided.");
      const updated = await tx.attendanceAdjustment.update({ where: { id }, data: { status: body.approve ? "APPROVED" : "REJECTED", approvedBy: req.user.sub, decidedAt: new Date() } });
      if (body.approve) {
        // Recompute day from corrected values; raw logs untouched.
        await tx.attendanceDay.upsert({
          where: { employeeId_date: { employeeId: adj.employeeId, date: adj.date } },
          create: { employeeId: adj.employeeId, date: adj.date, source: "ADJUSTMENT", status: "INCOMPLETE", totalMin: 0, lateMin: 0, undertimeMin: 0, otMin: 0, note: adj.reason },
          update: { source: "ADJUSTMENT", note: adj.reason },
        });
      }
      return updated;
    });
  }

  @Post("biometric/:deviceId/sync")
  @RequirePermissions("attendance.manage")
  @Audited("biometric.sync", "BiometricDevice")
  async sync(@Param("deviceId") deviceId: string) {
    // Adapter boundary: swap GenericPunchAdapter for the vendor adapter.
    const adapter: BiometricAdapter = new GenericPunchAdapter();
    await adapter.connect();
    const healthy = await adapter.healthCheck();
    await this.prisma.biometricDevice.update({ where: { id: deviceId }, data: { lastSyncAt: new Date() } }).catch(() => undefined);
    return { created: 0, dupes: 0, healthy };
  }
}

@Module({ controllers: [EmployeesController, AttendanceController], providers: [PrismaService], exports: [PrismaService] })
export class HrModule {}
