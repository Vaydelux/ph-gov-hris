/**
 * Leave (ledger-based), Recruitment, Reports (queued), Notifications,
 * Audit (read-only), Health, and Settings.
 */
import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Module, NotFoundException,
  Param, Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { Audited, JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../common";
import { PrismaService } from "../prisma/prisma.service";
import { leaveRequestSchema } from "@gov-hris/contracts";

type AuthedReq = { user: { sub: string; email: string; employeeId?: string; permissions: string[] } };

/* ────────────── leave ────────────── */
@Controller("leaves")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeaveController {
  constructor(private prisma: PrismaService) {}

  @Get("balances")
  async balances(@Query("employeeId") employeeId: string | undefined, @Req() req: AuthedReq) {
    const target = employeeId ?? req.user.employeeId;
    if (!target) throw new BadRequestException({ code: "NO_EMPLOYEE_PROFILE", message: "No linked profile." });
    const types = await this.prisma.leaveType.findMany();
    return Promise.all(types.map(async (t) => {
      const entries = await this.prisma.leaveLedgerEntry.aggregate({ where: { employeeId: target, leaveTypeId: t.id } });
      void entries;
      const all = await this.prisma.leaveLedgerEntry.findMany({ where: { employeeId: target, leaveTypeId: t.id } });
      const daysH = all.reduce((s, e) => s + (e.type === "DEBIT" ? -e.daysH : e.daysH), 0);
      return { ...t, daysH, days: daysH / 100 };
    }));
  }

  @Get()
  async list(@Query() q: { scope?: string; status?: string; page?: string }, @Req() req: AuthedReq) {
    const canTeam = req.user.permissions.includes("leave.view.team");
    const where = {
      ...(q.scope === "mine" || !canTeam ? { employeeId: req.user.employeeId ?? "" } : {}),
      ...(q.status ? { status: q.status as never } : {}),
    };
    const page = Math.max(1, Number(q.page ?? 1));
    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where, skip: (page - 1) * 10, take: 10, include: { employee: true, leaveType: true, approvals: true }, orderBy: { filedAt: "desc" } }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { rows, total, page, pageSize: 10 };
  }

  @Post()
  @RequirePermissions("leave.file")
  @Audited("leave.file", "LeaveRequest")
  async file(@Body() body: unknown, @Req() req: AuthedReq) {
    const input = leaveRequestSchema.parse(body);
    const empId = req.user.employeeId;
    if (!empId) throw new BadRequestException({ code: "NO_EMPLOYEE_PROFILE", message: "No linked profile." });
    return this.prisma.tx(async (tx) => {
      const overlap = await tx.leaveRequest.count({
        where: { employeeId: empId, status: { notIn: ["REJECTED", "CANCELLED"] }, startDate: { lte: new Date(input.endDate) }, endDate: { gte: new Date(input.startDate) } },
      });
      if (overlap > 0) throw new BadRequestException({ code: "OVERLAP", message: "An existing leave covers these dates." });
      const days = Math.max(1, Math.round((new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86_400_000) + 1);
      const bal = (await tx.leaveLedgerEntry.findMany({ where: { employeeId: empId, leaveTypeId: input.leaveTypeId } }))
        .reduce((s, e) => s + (e.type === "DEBIT" ? -e.daysH : e.daysH), 0);
      if (bal < days * 100) throw new BadRequestException({ code: "INSUFFICIENT_BALANCE", message: `Available ${bal / 100}d < requested ${days}d.` });
      return tx.leaveRequest.create({
        data: { employeeId: empId, leaveTypeId: input.leaveTypeId, startDate: new Date(input.startDate), endDate: new Date(input.endDate), workingDays: days, reason: input.reason, docName: input.docName },
      });
    });
  }

  @Post(":id/decide")
  @Audited("leave.decide", "LeaveRequest")
  async decide(@Param("id") id: string, @Body() body: { action: "APPROVE" | "REJECT"; note?: string }, @Req() req: AuthedReq) {
    return this.prisma.tx(async (tx) => {
      const reqRow = await tx.leaveRequest.findUnique({ where: { id } });
      if (!reqRow) throw new NotFoundException("Leave request not found.");
      const stage = reqRow.status === "PENDING_SUPERVISOR" ? "SUPERVISOR" : reqRow.status === "PENDING_HR" ? "HR" : null;
      if (!stage) throw new BadRequestException({ code: "INVALID_STATE", message: "No longer pending." });
      const needed = stage === "SUPERVISOR" ? "leave.approve.supervisor" : "leave.approve.hr";
      if (!req.user.permissions.includes(needed)) throw new ForbiddenException({ code: "FORBIDDEN", message: `Stage requires ${needed}.` });
      const newStatus = body.action === "REJECT" ? "REJECTED" : stage === "SUPERVISOR" ? "PENDING_HR" : "APPROVED";
      const updated = await tx.leaveRequest.update({ where: { id }, data: { status: newStatus as never, approvals: { create: { stage: stage as never, actorId: req.user.sub, action: body.action as never, note: body.note } } } });
      if (newStatus === "APPROVED")
        await tx.leaveLedgerEntry.create({ data: { employeeId: reqRow.employeeId, leaveTypeId: reqRow.leaveTypeId, type: "DEBIT", daysH: reqRow.workingDays * 100, refType: "REQUEST", refId: id, memo: `Approved ${reqRow.startDate.toISOString().slice(0, 10)} → ${reqRow.endDate.toISOString().slice(0, 10)}`, actorId: req.user.sub } });
      return updated;
    });
  }

  @Post(":id/cancel")
  @Audited("leave.cancel", "LeaveRequest")
  async cancel(@Param("id") id: string, @Req() req: AuthedReq) {
    return this.prisma.tx(async (tx) => {
      const row = await tx.leaveRequest.findUnique({ where: { id } });
      if (!row) throw new NotFoundException("Leave request not found.");
      if (row.employeeId !== req.user.employeeId && !req.user.permissions.includes("leave.approve.hr"))
        throw new ForbiddenException({ code: "FORBIDDEN", message: "Not authorized." });
      const wasApproved = row.status === "APPROVED";
      const updated = await tx.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
      if (wasApproved)
        await tx.leaveLedgerEntry.create({ data: { employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, type: "REVERSAL", daysH: row.workingDays * 100, refType: "REQUEST", refId: id, memo: "Cancelled approved leave — credit restored", actorId: req.user.sub } });
      return updated;
    });
  }
}

/* ────────────── recruitment ────────────── */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecruitmentController {
  constructor(private prisma: PrismaService) {}

  @Get("jobs")
  @RequirePermissions("recruitment.manage")
  jobs() { return this.prisma.jobPosting.findMany({ include: { _count: { select: { applications: true } } }, orderBy: { postedAt: "desc" } }); }

  @Post("jobs")
  @RequirePermissions("recruitment.manage")
  @Audited("recruitment.job_posted", "JobPosting")
  createJob(@Body() body: Record<string, unknown>) {
    const slug = `${String(body.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
    return this.prisma.jobPosting.create({ data: { ...(body as object), slug } as never });
  }

  @Get("applications")
  @RequirePermissions("recruitment.manage")
  async applications(@Query("jobId") jobId?: string) {
    return this.prisma.application.findMany({
      where: jobId ? { jobPostingId: jobId } : undefined,
      include: { applicant: true, jobPosting: true, interviews: true },
      orderBy: { appliedAt: "desc" },
    });
  }

  @Get("applications/:id")
  @RequirePermissions("recruitment.manage")
  application(@Param("id") id: string) {
    return this.prisma.application.findUnique({ where: { id }, include: { applicant: true, jobPosting: true, history: true, evaluations: true, interviews: true } })
      .then((a) => a ?? (() => { throw new NotFoundException("Application not found."); })());
  }

  @Post("applications/:id/status")
  @RequirePermissions("recruitment.manage")
  @Audited("recruitment.status_change", "Application")
  async move(@Param("id") id: string, @Body() body: { status: string; note?: string }, @Req() req: AuthedReq) {
    return this.prisma.tx(async (tx) => {
      const app = await tx.application.findUnique({ where: { id } });
      if (!app) throw new NotFoundException("Application not found.");
      if (["HIRED", "REJECTED", "WITHDRAWN"].includes(app.status)) throw new BadRequestException({ code: "INVALID_STATE", message: "Terminal statuses are locked." });
      return tx.application.update({
        where: { id },
        data: { status: body.status as never, history: { create: { status: body.status as never, by: req.user.sub, note: body.note } } },
      });
    });
  }
}

/* ────────────── public careers (no auth) ────────────── */
@Controller()
export class PublicCareersController {
  constructor(private prisma: PrismaService) {}

  @Get("jobs/public")
  publicJobs() { return this.prisma.jobPosting.findMany({ where: { status: "OPEN" }, orderBy: { postedAt: "desc" } }); }

  @Get("jobs/public/:slug")
  async publicJob(@Param("slug") slug: string) {
    const job = await this.prisma.jobPosting.findUnique({ where: { slug } });
    if (!job || job.status !== "OPEN") throw new NotFoundException("Posting not found.");
    return job;
  }

  @Post("applications")
  async submit(@Body() body: { jobSlug: string; fullName: string; email: string; phone: string; coverLetter: string; resumeText: string; docName?: string }) {
    return this.prisma.tx(async (tx) => {
      const job = await tx.jobPosting.findUnique({ where: { slug: body.jobSlug } });
      if (!job || job.status !== "OPEN") throw new NotFoundException("Posting no longer open.");
      const applicant = await tx.applicantProfile.upsert({
        where: { email: body.email },
        create: { fullName: body.fullName, email: body.email, phone: body.phone },
        update: {},
      });
      return tx.application.create({
        data: { jobPostingId: job.id, applicantId: applicant.id, coverLetter: body.coverLetter, resumeText: body.resumeText, status: "NEW", history: { create: { status: "NEW", by: "Applicant Portal" } } },
      });
    });
  }
}

/* ────────────── reports (queued to worker) ────────────── */
@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private prisma: PrismaService, @InjectQueue("reports") private queue: Queue) {}

  @Get()
  @RequirePermissions("reports.view")
  list() { return this.prisma.reportRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 }); }

  @Post()
  @RequirePermissions("reports.view")
  @Audited("report.request", "ReportRun")
  async request(@Body() body: { type: string; params: Record<string, string>; paramsLabel: string }, @Req() req: AuthedReq) {
    const run = await this.prisma.reportRun.create({ data: { type: body.type, params: body.params, paramsLabel: body.paramsLabel, requestedBy: req.user.sub } });
    await this.queue.add("generate", { reportId: run.id }, { attempts: 3, backoff: { type: "exponential", delay: 2000 } });
    return run;
  }

  @Get("files/:id")
  @RequirePermissions("reports.view")
  async signedUrl(@Param("id") id: string) {
    const file = await this.prisma.generatedFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException("File not found.");
    // Production: supabase.storage.from(bucket).createSignedUrl(file.storagePath, 300)
    return { url: `/api/v1/reports/files/${id}/download`, expiresIn: 300, note: "Signed URL issued by the API from private storage." };
  }
}

/* ────────────── notifications / audit / health / settings ────────────── */
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}
  @Get()
  list(@Req() req: AuthedReq) { return this.prisma.notification.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: "desc" }, take: 40 }); }
  @Get("unread-count")
  async unread(@Req() req: AuthedReq) { return this.prisma.notification.count({ where: { userId: req.user.sub, read: false } }); }
  @Post(":id/read")
  mark(@Param("id") id: string) { return this.prisma.notification.update({ where: { id }, data: { read: true } }); }
  @Post("read-all")
  markAll(@Req() req: AuthedReq) { return this.prisma.notification.updateMany({ where: { userId: req.user.sub }, data: { read: true } }); }
}

@Controller("audit")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private prisma: PrismaService) {}
  @Get()
  @RequirePermissions("audit.view")
  async list(@Query() q: { page?: string; q?: string; entity?: string }) {
    const page = Math.max(1, Number(q.page ?? 1));
    const where = {
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.q ? { OR: [{ actorName: { contains: q.q, mode: "insensitive" as const } }, { action: { contains: q.q, mode: "insensitive" as const } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip: (page - 1) * 14, take: 14, orderBy: { at: "desc" } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total, page, pageSize: 14 };
  }
}

@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}
  @Get()
  async health() {
    let db = "ok";
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { db = "error"; }
    return { status: db === "ok" ? "ok" : "degraded", db, mode: "api", time: new Date().toISOString() };
  }
}

@Controller("settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private prisma: PrismaService) {}
  @Get()
  @RequirePermissions("settings.manage")
  all() { return this.prisma.systemSetting.findMany(); }
}

@Module({
  controllers: [LeaveController, RecruitmentController, PublicCareersController, ReportsController, NotificationsController, AuditController, HealthController, SettingsController],
  providers: [PrismaService],
})
export class TalentModule {}
