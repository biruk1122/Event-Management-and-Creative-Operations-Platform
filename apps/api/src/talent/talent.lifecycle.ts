import {
  TalentAssignmentStatus,
  TalentAvailability,
} from "../generated/prisma/client.js";

const AVAILABILITY_TRANSITIONS: Record<
  TalentAvailability,
  readonly TalentAvailability[]
> = {
  [TalentAvailability.AVAILABLE]: [
    TalentAvailability.ASSIGNED,
    TalentAvailability.UNAVAILABLE,
    TalentAvailability.INACTIVE,
  ],
  [TalentAvailability.ASSIGNED]: [
    TalentAvailability.AVAILABLE,
    TalentAvailability.UNAVAILABLE,
    TalentAvailability.INACTIVE,
  ],
  [TalentAvailability.UNAVAILABLE]: [
    TalentAvailability.AVAILABLE,
    TalentAvailability.INACTIVE,
  ],
  [TalentAvailability.INACTIVE]: [],
};

const ASSIGNMENT_TRANSITIONS: Record<
  TalentAssignmentStatus,
  readonly TalentAssignmentStatus[]
> = {
  [TalentAssignmentStatus.ASSIGNED]: [
    TalentAssignmentStatus.COMPLETED,
    TalentAssignmentStatus.CANCELLED,
  ],
  [TalentAssignmentStatus.COMPLETED]: [],
  [TalentAssignmentStatus.CANCELLED]: [],
};

export function canTransitionAvailability(
  from: TalentAvailability,
  to: TalentAvailability,
): boolean {
  return AVAILABILITY_TRANSITIONS[from].includes(to);
}

export function canTransitionAssignment(
  from: TalentAssignmentStatus,
  to: TalentAssignmentStatus,
): boolean {
  return ASSIGNMENT_TRANSITIONS[from].includes(to);
}
