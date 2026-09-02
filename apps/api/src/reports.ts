/**
 * Reports: the API only accepts a request, queues it, and returns a job id.
 * Generation (ExcelJS spreadsheets, Puppeteer PDFs) happens in apps/worker,
 * files land in PRIVATE Supabase Storage, downloads use short-lived signed
 * URLs issued by this API after an authorization check.
 */
import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { CurrentUser, RequirePermissions, type AuthUser } from "./auth";
import { env, PrismaService, writeAudit } from "./platform";

const queue = new Queue("reports", { connection: new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }) });
const storage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

@Controller("reports")
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @RequirePermissions("reports.view")
  async request(@Body() body: { type: string; params: Record<string, string>; paramsLabel: string }, @CurrentUser() user: AuthUser) {
    const run = await this.prisma.reportRun.create({
      data: { type: body.type, params: body.params, paramsLabel: body.paramsLabel, requestedBy: user.sub },
    });
    await queue.add("report.generate", { reportId: run.id }, { jobId: `report:${run.id}`, attempts: 3, backoff: { type: "exponential", delay: 4_000 } });
    await writeAudit(this.prisma, { actorId: user.sub, actorName: user.fullName, action: "report.request", entity: "ReportRun", entityId: run.id, after: { type: body.type }, requestId: `${Date.now()}` });
    return { id: run.id, status: run.status };
  }

  @Get()
  @RequirePermissions("reports.view")
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.reportRun.findMany({ where: { requestedBy: user.sub }, orderBy: { createdAt: "desc" }, take: 50, include: { file: true } });
  }

  /** Authorized temporary signed URL — the file itself is never public. */
  @Get("files/:id/download")
  @RequirePermissions("reports.view")
  async download(@Param("id") fileId: string, @CurrentUser() user: AuthUser) {
    const file = await this.prisma.generatedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException({ code: "NOT_FOUND", message: "File not found." });
    const run = await this.prisma.reportRun.findFirst({ where: { fileId } });
    if (run && run.requestedBy !== user.sub && !user.permissions.has("*"))
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Not your report." });
    const { data, error } = await storage.storage.from("hris-private").createSignedUrl(file.storagePath, 300);
    if (error || !data) throw new NotFoundException({ code: "FILE_UNAVAILABLE", message: "Signed URL failed." });
    return { url: data.signedUrl, expiresInSec: 300 };
  }
}
