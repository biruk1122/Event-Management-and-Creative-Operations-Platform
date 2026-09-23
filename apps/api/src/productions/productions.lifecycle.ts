import { ProductionStatus } from "../generated/prisma/client.js";

const TRANSITIONS: Record<ProductionStatus, readonly ProductionStatus[]> = {
  PLANNED: [ProductionStatus.ACTIVE, ProductionStatus.CANCELLED],
  ACTIVE: [ProductionStatus.COMPLETED, ProductionStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: ProductionStatus, to: ProductionStatus) {
  return TRANSITIONS[from].includes(to);
}
