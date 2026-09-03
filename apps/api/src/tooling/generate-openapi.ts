import "reflect-metadata";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { NestExpressApplication } from "@nestjs/platform-express";

process.env.DATABASE_URL ??=
  "postgresql://openapi:openapi@127.0.0.1:5432/openapi?schema=public";
process.env.LOG_LEVEL ??= "silent";
process.env.NODE_ENV ??= "test";

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }

  return value;
}

async function generateOpenApiDocument(): Promise<void> {
  const [{ NestFactory }, { AppModule }, { configureApplication }, openApi] =
    await Promise.all([
      import("@nestjs/core"),
      import("../app.module.js"),
      import("../app.setup.js"),
      import("../openapi.js"),
    ]);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    logger: false,
  });

  try {
    configureApplication(app);
    await app.init();

    const outputPath = resolve(
      process.cwd(),
      "../../packages/api-client/openapi/openapi.json",
    );
    const document = sortJson(openApi.createOpenApiDocument(app));

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(document, null, 2)}\n`,
      "utf8",
    );
  } finally {
    await app.close();
  }
}

try {
  await generateOpenApiDocument();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
