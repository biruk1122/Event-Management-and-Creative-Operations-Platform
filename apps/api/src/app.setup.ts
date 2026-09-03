import { RequestMethod, ValidationPipe, VersioningType } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { ProblemDetailsFilter } from "./common/http/problem-details.filter.js";
import { createValidationException } from "./common/http/validation-exception.js";
import {
  ENVIRONMENT,
  parseCorsOrigins,
  type Environment,
} from "./config/environment.js";
import { registerOpenApiDocumentation } from "./openapi.js";

export function configureApplication(app: NestExpressApplication): void {
  const environment = app.get<Environment>(ENVIRONMENT);

  app.use(helmet());
  app.enableCors({
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: parseCorsOrigins(environment.CORS_ORIGINS),
  });
  app.use(
    rateLimit({
      legacyHeaders: false,
      limit: environment.API_RATE_LIMIT_MAX,
      skip: (request) => request.path === "/health/live",
      standardHeaders: "draft-8",
      windowMs: environment.API_RATE_LIMIT_TTL_MS,
    }),
  );
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health/live", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ defaultVersion: "1", type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: createValidationException,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  registerOpenApiDocumentation(app);
}
