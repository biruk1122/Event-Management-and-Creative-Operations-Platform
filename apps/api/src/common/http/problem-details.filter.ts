import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";

import type { ProblemDetails } from "./problem-details.js";
import type { RequestWithContext } from "./request-with-context.js";

interface RequestFailureAuditor {
  recordFailure(
    request: RequestWithContext,
    status: number,
    errorCode: string,
  ): Promise<void>;
}

interface StructuredExceptionBody {
  code?: string;
  detail?: string;
  error?: string;
  errors?: unknown;
  message?: string | string[];
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly failureAuditor?: RequestFailureAuditor) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.getExceptionBody(exception);
    const requestId = request.id ?? "unavailable";

    await this.failureAuditor?.recordFailure(request, status, body.code);

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        {
          exception,
          method: request.method,
          path: request.originalUrl,
          requestId,
        },
        "Unhandled request exception",
      );
    } else if (status >= 500) {
      this.logger.warn(
        {
          code: body.code,
          method: request.method,
          path: request.originalUrl,
          requestId,
        },
        "Request failed because a required service is unavailable",
      );
    }

    const problem: ProblemDetails = {
      type: `https://api.event-platform.local/problems/${body.code.toLowerCase()}`,
      title: body.title,
      status,
      detail: body.detail,
      instance: request.originalUrl,
      code: body.code,
      requestId,
      ...(body.errors === undefined ? {} : { errors: body.errors }),
    };

    response.status(status).type("application/problem+json").json(problem);
  }

  private getExceptionBody(exception: unknown): {
    code: string;
    detail: string;
    errors?: unknown;
    title: string;
  } {
    if (!(exception instanceof HttpException)) {
      return {
        code: "INTERNAL_SERVER_ERROR",
        detail: "An unexpected error occurred.",
        title: "Internal Server Error",
      };
    }

    const response = exception.getResponse();
    const status = exception.getStatus();
    const fallbackTitle = HttpStatus[status] ?? "Request Error";

    if (typeof response === "string") {
      return { code: `HTTP_${status}`, detail: response, title: fallbackTitle };
    }

    const body = response as StructuredExceptionBody;
    const messages = Array.isArray(body.message) ? body.message : undefined;

    return {
      code: body.code ?? `HTTP_${status}`,
      detail:
        body.detail ??
        (typeof body.message === "string" ? body.message : undefined) ??
        messages?.join("; ") ??
        fallbackTitle,
      title: body.error ?? fallbackTitle,
      ...((body.errors ?? messages) === undefined
        ? {}
        : { errors: body.errors ?? messages }),
    };
  }
}
