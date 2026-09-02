import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { randomUUID } from "crypto";
import { AppModule } from "./app.module";
import { config } from "./config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());
  app.enableCors({
    origin: config.APPLICATION_URL.split(","),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  // Correlation id for every request (returned as X-Correlation-Id, logged, audited)
  app.use((req: { headers: Record<string, string>; correlationId?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    const id = (req.headers["x-request-id"] as string) ?? randomUUID();
    req.correlationId = id;
    res.setHeader("X-Correlation-Id", id);
    next();
  });

  await app.listen(config.PORT);
  console.log(`[gov-hris/api] listening on :${config.PORT} — mode=${config.APP_MODE} env=${config.APP_ENV}`);
}
bootstrap();
