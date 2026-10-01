import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

function problem(code: string, detail: string) {
  return { code, detail };
}

export const reportNotFound = () =>
  new NotFoundException(
    problem("REPORT_NOT_FOUND", "No report exists with that id."),
  );
export const reportInvalidPeriod = () =>
  new BadRequestException(
    problem(
      "REPORT_INVALID_PERIOD",
      "The report period does not match its type.",
    ),
  );
export const reportInvalidSections = () =>
  new BadRequestException(
    problem(
      "REPORT_INVALID_SECTIONS",
      "The report sections do not match its type or required content.",
    ),
  );
export const reportInvalidRange = () =>
  new BadRequestException(
    problem(
      "REPORT_INVALID_RANGE",
      "The date filter range must be ordered and no longer than 366 days.",
    ),
  );
export const reportDuplicate = () =>
  new ConflictException(
    problem(
      "REPORT_DUPLICATE",
      "This author already has a report of this type for this period.",
    ),
  );
export const reportInvalidTransition = () =>
  new ConflictException(
    problem(
      "REPORT_INVALID_TRANSITION",
      "The report is not in the required lifecycle state.",
    ),
  );
export const reportConcurrentChange = () =>
  new ConflictException(
    problem(
      "REPORT_CONCURRENT_CHANGE",
      "The report changed concurrently. Refresh it and retry.",
    ),
  );
export const reportWorkspaceNotFound = () =>
  new NotFoundException(
    problem("REPORT_WORKSPACE_NOT_FOUND", "A linked workspace does not exist."),
  );
