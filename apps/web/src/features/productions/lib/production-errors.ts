import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

export class ProductionRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to production projects."
          : status === 404
            ? "This production no longer exists."
            : "We could not load production data. Try again.",
    );
    this.name = "ProductionRequestError";
  }
}

export class ProductionMutationError extends Error {
  readonly fieldErrors: Record<string, string>;
  constructor(
    readonly status: number,
    error: unknown,
  ) {
    const code = isProblemDetails(error) ? error.code : "";
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have permission to make this change."
          : code === "PRODUCTION_NOT_FOUND"
            ? "This production no longer exists. Refresh the list."
            : code === "USER_NOT_FOUND"
              ? "That person no longer exists. Choose another."
              : code === "TEAM_NOT_FOUND"
                ? "That team no longer exists. Choose another."
                : code === "TALENT_NOT_FOUND"
                  ? "That talent profile no longer exists. Choose another."
                  : code === "PRODUCTION_SCHEDULE_INVALID"
                    ? "End must follow start."
                    : code === "PRODUCTION_TRANSITION_INVALID"
                      ? "This status change is no longer allowed."
                      : code === "PRODUCTION_WORKSPACE_IN_USE"
                        ? "This production still has connected work and cannot be deleted."
                        : status === 409
                          ? "This assignment changed. Refresh and try again."
                          : "We could not save this change. Try again.",
    );
    this.name = "ProductionMutationError";
    this.fieldErrors = isProblemDetails(error) ? fieldErrorsOf(error) : {};
    if (code === "PRODUCTION_SCHEDULE_INVALID")
      this.fieldErrors.endAt = this.message;
  }
}
