import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

function problem(code: string, detail: string) {
  return { code, detail };
}

export const expenseNotFound = () =>
  new NotFoundException(
    problem("EXPENSE_NOT_FOUND", "No expense exists with that id."),
  );
export const expenseEventNotFound = () =>
  new NotFoundException(
    problem("EXPENSE_EVENT_NOT_FOUND", "No event exists with that id."),
  );
export const expenseEventHasNoDepartment = () =>
  new BadRequestException(
    problem(
      "EXPENSE_EVENT_HAS_NO_DEPARTMENT",
      "Assign this event to a department before recording expenses against it.",
    ),
  );
export const expenseOwnerRequired = () =>
  new BadRequestException(
    problem(
      "EXPENSE_OWNER_REQUIRED",
      "An expense must belong to an event, a production, or both.",
    ),
  );
export const expenseProductionNotFound = () =>
  new NotFoundException(
    problem(
      "EXPENSE_PRODUCTION_NOT_FOUND",
      "No production exists with that id.",
    ),
  );
export const expenseProductionHasNoDepartment = () =>
  new BadRequestException(
    problem(
      "EXPENSE_PRODUCTION_HAS_NO_DEPARTMENT",
      "Assign this production to a department before recording expenses against it.",
    ),
  );
export const expenseSupplierNotFound = () =>
  new NotFoundException(
    problem("EXPENSE_SUPPLIER_NOT_FOUND", "No supplier exists with that id."),
  );
export const expenseInvalidTransition = () =>
  new ConflictException(
    problem(
      "EXPENSE_INVALID_TRANSITION",
      "The expense is not in the required lifecycle state.",
    ),
  );
export const expenseConcurrentChange = () =>
  new ConflictException(
    problem(
      "EXPENSE_CONCURRENT_CHANGE",
      "The expense changed concurrently. Refresh it and retry.",
    ),
  );
export const expenseAmountInvalid = () =>
  new BadRequestException(
    problem(
      "EXPENSE_AMOUNT_INVALID",
      "The actual amount and currency are required and must be well-formed.",
    ),
  );
