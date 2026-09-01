import { HttpStatus } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Response } from "express";

import type { ProblemDetails } from "./problem-details.js";
import type { RequestWithContext } from "./request-with-context.js";

export function registerNotFoundHandler(app: NestExpressApplication): void {
  app.use((request: RequestWithContext, response: Response) => {
    const problem: ProblemDetails = {
      type: "https://api.event-platform.local/problems/http_404",
      title: "Not Found",
      status: HttpStatus.NOT_FOUND,
      detail: `Cannot ${request.method} ${request.originalUrl}`,
      instance: request.originalUrl,
      code: "HTTP_404",
      requestId: request.id,
    };

    response
      .status(HttpStatus.NOT_FOUND)
      .type("application/problem+json")
      .json(problem);
  });
}
