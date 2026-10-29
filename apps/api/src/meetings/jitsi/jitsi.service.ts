import { Injectable } from "@nestjs/common";

import type {
  MeetingParticipantRecord,
  MeetingRecord,
} from "../infrastructure/meetings.repository.js";
import { meetingVideoUnavailable } from "../meetings.errors.js";
import type { MeetingJitsiSessionResponse } from "../meetings.contracts.js";
import { JitsiConfig } from "./jitsi.config.js";

export interface JitsiSessionContext {
  userId: string;
  isOrganizer: boolean;
  participant: MeetingParticipantRecord | undefined;
}

function displayNameFor(
  person: { email: string } & {
    firstName: string | null;
    lastName: string | null;
  },
): string {
  const name = [person.firstName, person.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();
  return name || person.email;
}

@Injectable()
export class JitsiService {
  constructor(private readonly config: JitsiConfig) {}

  /** Derives the room name from the meeting's own id rather than storing one -
   * meeting ids are UUIDv7 (effectively non-guessable, not sequential), and
   * the real authorization boundary is the caller (`MeetingsService.getJitsiSession`),
   * not the room name's secrecy. */
  buildSession(
    meeting: MeetingRecord,
    ctx: JitsiSessionContext,
  ): MeetingJitsiSessionResponse {
    if (!this.config.enabled) throw meetingVideoUnavailable();
    const person = ctx.isOrganizer ? meeting.organizer : ctx.participant!;
    return {
      domain: this.config.domain,
      roomName: `lela-${meeting.id}`,
      displayName: displayNameFor(person),
      // UI hint only in this MVP - no JWT/server-enforced moderator role yet
      // (see JitsiConfig.jwt and docs/development/jitsi-integration.md).
      moderator: ctx.isOrganizer,
      jwt: null,
    };
  }
}
