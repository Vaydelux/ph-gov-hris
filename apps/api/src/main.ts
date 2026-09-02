import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { env, structuredLog } from "./platform";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: env.CORS_ORIGIN.split(","), credentials: true });
  const server = app.getHttpServer();
  server.disable?.("x-powered-by");
  await app.listen(env.PORT);
  structuredLog("info", "api.started", { port: env.PORT, env: env.NODE_ENV, url: env.APPLICATION_URL });
}
void bootstrap();
