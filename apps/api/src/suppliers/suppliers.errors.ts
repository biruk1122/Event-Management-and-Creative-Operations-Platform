import { ConflictException, NotFoundException } from "@nestjs/common";

function problem(code: string, detail: string) {
  return { code, detail };
}

export const supplierNotFound = () =>
  new NotFoundException(
    problem("SUPPLIER_NOT_FOUND", "No supplier exists with that id."),
  );
export const supplierDuplicate = () =>
  new ConflictException(
    problem(
      "SUPPLIER_DUPLICATE",
      "A supplier with this name already exists for this department.",
    ),
  );
