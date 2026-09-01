import { BadRequestException, type ValidationError } from "@nestjs/common";

interface ValidationIssue {
  field: string;
  messages: string[];
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = "",
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const current = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];

    return [
      ...current,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

export function createValidationException(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    code: "VALIDATION_ERROR",
    detail: "One or more request values are invalid.",
    error: "Validation Failed",
    errors: flattenValidationErrors(errors),
  });
}
