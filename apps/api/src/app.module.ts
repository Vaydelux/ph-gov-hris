import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PermissionsGuard, SupabaseAuthGuard } from "./auth";
import { CorrelationMiddleware, PrismaService } from "./platform";
import { PayrollController, PayrollService } from "./payroll";
import { ReportsController } from "./reports";
import { HealthController } from "./health";

/**
 * Global guards: every route requires a verified Supabase JWT, then capability
 * checks declared with @RequirePermissions(...). Supabase RLS is deliberately
 * NOT the authorization system — this guard + PostgreSQL-resolved permissions
 * are authoritative (per architecture decision).
 */
@Module({
  controllers: [HealthController, PayrollController, ReportsController],
  providers: [
    PrismaService,
    PayrollService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
