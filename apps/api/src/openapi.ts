import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
  type SwaggerDocumentOptions,
} from "@nestjs/swagger";

const documentOptions: SwaggerDocumentOptions = {
  autoTagControllers: false,
  operationIdFactory: (controllerKey, methodKey, version) =>
    [
      controllerKey.replace(/Controller$/, ""),
      methodKey,
      version ? `v${version}` : undefined,
    ]
      .filter(Boolean)
      .join("_"),
};

function createOpenApiConfiguration() {
  return new DocumentBuilder()
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
}

export function createOpenApiDocument(
  app: NestExpressApplication,
): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    createOpenApiConfiguration(),
    documentOptions,
  );
}

export function registerOpenApiDocumentation(
  app: NestExpressApplication,
): void {
  SwaggerModule.setup("api/docs", app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: "api/docs-json",
    swaggerOptions: { persistAuthorization: false },
  });
}
