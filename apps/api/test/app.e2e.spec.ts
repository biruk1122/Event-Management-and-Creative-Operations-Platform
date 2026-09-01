import "reflect-metadata";

import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApplication } from "../src/app.setup.js";
import { registerNotFoundHandler } from "../src/common/http/not-found.handler.js";

interface HealthBody {
  status: string;
  timestamp: string;
}

interface OpenApiBody {
  info: { title: string };
  paths: Record<string, unknown>;
}

describe("API foundation", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
    registerNotFoundHandler(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("exposes an unversioned liveness endpoint with a request ID", async () => {
    const response = await request(app.getHttpServer())
      .get("/health/live")
      .expect(200);
    const body = response.body as HealthBody;

    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(body).toMatchObject({ status: "ok" });
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it("publishes the machine-readable OpenAPI document", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/docs-json")
      .expect(200);
    const body = response.body as OpenApiBody;

    expect(body.info.title).toBe("Event and Creative Operations Platform API");
    expect(body.paths).toHaveProperty("/health/live");
    expect(body.paths).toHaveProperty("/health/ready");
  });

  it("returns Problem Details for unknown routes", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/does-not-exist")
      .set("x-request-id", "phase-4-test")
      .expect(404);

    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.body).toMatchObject({
      code: "HTTP_404",
      requestId: "phase-4-test",
      status: 404,
    });
  });
});
