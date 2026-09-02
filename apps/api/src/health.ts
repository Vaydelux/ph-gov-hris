import { Controller, Get } from "@nestjs/common";
import { env, PrismaService } from "./platform";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public liveness + dependency probe (web app diagnostic panel pings this). */
  @Get("health")
  async health() {
    let db: "ok" | "error" = "ok";
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { db = "error"; }
    return {
      status: db === "ok" ? "ok" : "degraded",
      service: "gov-hris-api",
      env: env.NODE_ENV,
      db,
      queue: env.REDIS_URL ? "configured" : "missing",
      time: new Date().toISOString(),
    };
  }
}
