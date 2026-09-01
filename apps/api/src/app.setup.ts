import { RequestMethod, ValidationPipe, VersioningType } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { ProblemDetailsFilter } from "./common/http/problem-details.filter.js";
import { createValidationException } from "./common/http/validation-exception.js";
import {
  ENVIRONMENT,
  parseCorsOrigins,
  type Environment,
} from "./config/environment.js";

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

  const openApiConfig = new DocumentBuilder()
    .setTitle("Event and Creative Operations Platform API")
    .setDescription(
      "Versioned API for the Event and Creative Operations Management Platform",
    )
    .setVersion("1.0")
    .addCookieAuth("access_token", {
      description: "Short-lived access token cookie",
      in: "cookie",
      type: "apiKey",
    })
    .addApiKey(
      {
        description: "CSRF token for state-changing authenticated requests",
        in: "header",
        name: "x-csrf-token",
        type: "apiKey",
      },
      "csrf-token",
    )
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);

  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/docs-json",
    swaggerOptions: { persistAuthorization: false },
  });
}
