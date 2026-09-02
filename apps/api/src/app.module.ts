import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { AllExceptionsFilter } from "./common";
import { config } from "./config";
import { HrModule } from "./hr/hr.module";
import { MoneyModule } from "./money/money.module";
import { PayrollModule } from "./payroll/payroll.module";
import { TalentModule } from "./talent/talent.module";

const redis = () => {
  const url = (config as { REDIS_URL?: string }).REDIS_URL;
  if (!url) return { connection: { host: "127.0.0.1", port: 6379 } };
  const u = new URL(url);
  return {
    connection: {
      host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined,
      tls: u.protocol === "rediss:" ? {} : undefined,
    },
  };
};

@Module({
  imports: [
    BullModule.forRootAsync({ useFactory: redis }),
    BullModule.registerQueue({ name: "payroll" }, { name: "reports" }, { name: "email" }, { name: "biometrics" }),
    AuthModule,
    HrModule,
    PayrollModule,
    MoneyModule,
    TalentModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
