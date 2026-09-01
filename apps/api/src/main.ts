import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import { configureApplication } from "./app.setup.js";
import { registerNotFoundHandler } from "./common/http/not-found.handler.js";
import { ENVIRONMENT, type Environment } from "./config/environment.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  configureApplication(app);
  await app.init();
  registerNotFoundHandler(app);

  const environment = app.get<Environment>(ENVIRONMENT);
  await app.listen(environment.API_PORT, environment.API_HOST);
}

void bootstrap();
