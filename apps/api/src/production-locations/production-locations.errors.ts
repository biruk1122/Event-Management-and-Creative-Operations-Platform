import { NotFoundException } from "@nestjs/common";

export const productionLocationNotFound = () =>
  new NotFoundException({
    code: "PRODUCTION_LOCATION_NOT_FOUND",
    detail: "No location exists with that id for this production.",
  });
