import { RequestMethod, ValidationPipe, VersioningType } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { AuditRequestFailureService } from "./audit/audit-request-failure.service.js";
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
  app.use(cookieParser());
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
  // Stricter per-IP limit for credential and session-issuing routes.
  app.use(
    ["/api/v1/auth/login", "/api/v1/auth/refresh"],
    rateLimit({
      legacyHeaders: false,
      limit: environment.AUTH_LOGIN_RATE_LIMIT_MAX,
      standardHeaders: "draft-8",
      windowMs: environment.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
      handler: (request, response) => {
        const headerId = request.headers["x-request-id"];
        const requestId =
          (request as { id?: string }).id ??
          (typeof headerId === "string" ? headerId : "unavailable");
        response.status(429).type("application/problem+json").json({
          type: "https://api.event-platform.local/problems/auth_rate_limited",
          title: "Too Many Requests",
          status: 429,
          detail: "Too many authentication attempts. Try again later.",
          instance: request.originalUrl,
          code: "AUTH_RATE_LIMITED",
          requestId,
        });
      },
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
  app.useGlobalFilters(
    new ProblemDetailsFilter(app.get(AuditRequestFailureService)),
  );
  app.enableShutdownHooks();

  registerOpenApiDocumentation(app);
}
