# Self-hosted Jitsi Meet integration

The Meetings feature embeds a self-hosted [Jitsi Meet](https://jitsi.org/)
video/audio room directly in the app for every ONLINE or HYBRID meeting - no
external link, no redirect to another site, no third-party conferencing
subscription. This replaces an earlier Google Meet integration (OAuth
Google Calendar connection + manual/automatic link generation), which has
been fully removed.

## Configuration

API-only environment variables (`apps/api/src/config/environment.ts`):

| Variable                                                | Purpose                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JITSI_ENABLED`                                         | Feature flag. `GET /meetings/:id/jitsi-session` returns `409 MEETING_VIDEO_UNAVAILABLE` while this is `false` (the default) - never falls back to the public `meet.jit.si`.                                                                                                                                                             |
| `JITSI_DOMAIN`                                          | The self-hosted deployment's domain, **including port for local dev** (e.g. `localhost:8000` locally, `meet.example.com` in production). **Never a `NEXT_PUBLIC_*` value** - the frontend learns the domain from the live `jitsi-session` API response at join time, not a build-time var, so it can change without a frontend rebuild. |
| `JITSI_JWT_ENABLED`, `JITSI_APP_ID`, `JITSI_APP_SECRET` | Reserved for an optional future JWT/moderator scheme - see below. Leave disabled.                                                                                                                                                                                                                                                       |

For local development (no domain, no VPS, no paid service), see
`docker/jitsi/local/README.md` - it walks through cloning the official
project, generating secrets with its own script, and configuring Lela to
point at it (`JITSI_ENABLED=true`, `JITSI_DOMAIN=localhost:8000`). For a
real deployment, see `docker/jitsi/production/README.md` and
`docker/reverse-proxy/` for the shared front door it sits behind.

## How joining works

1. The Meetings UI shows a **Join meeting** button on any ONLINE/HYBRID,
   still-SCHEDULED meeting the current user organizes or is invited to.
2. On click, the frontend calls `GET /meetings/:id/jitsi-session`
   (`apps/web/src/features/meetings/api/jitsi-gateway.ts`), which returns
   `{ domain, roomName, displayName, moderator, jwt }`.
3. `JitsiMeetingRoom` (`apps/web/src/features/meetings/components/jitsi-meeting-room.tsx`)
   dynamically loads the self-hosted deployment's own
   `https://{domain}/external_api.js` and constructs a `JitsiMeetExternalAPI`
   instance in place, inside the existing meeting detail panel - no new
   route, no new tab. It always disposes the instance on unmount (the one
   line that prevents duplicate instances/memory leaks across remounts,
   including React Strict Mode's dev double-invoke).
4. **Leave meeting** hangs up locally and returns to the normal detail view
   - it does not end the meeting for anyone else.
5. **End meeting for everyone** (organizer only) calls the existing
   `POST /:id/transition` endpoint (`status: "COMPLETED"`) - a Lela-side
   state change, not a Jitsi moderation action. Once a meeting is no longer
   SCHEDULED, nobody sees a Join button for it anymore.

Meetings default to audio-first (`startWithVideoMuted: true`); participants
can enable video or screen share from Jitsi's own in-room toolbar.

## Authorization model

Room-join information is gated independently of a caller's general
`meeting.read` grant. `MeetingsService.getJitsiSession`
(`apps/api/src/meetings/meetings.service.ts`) requires:

- any `meeting.read` grant (ORGANIZATION/DEPARTMENT/SELF), **and**
- the caller is either the meeting's organizer, or holds an actual
  `MeetingParticipant` row for it.

This is deliberately **stricter** than `meeting.update`'s own DEPARTMENT
reach: a Department Manager can see a meeting they didn't organize or get
invited to in the list/detail view, but will not get a Jitsi session for
it. No new permission key was introduced - this is a resource-level
ownership check layered on top of the existing `meeting.read` grant, the
same idiom `requireOrganizerUpdateGrant` already uses elsewhere in this
service.

The room name itself (`lela-{meetingId}`) is derived on the fly from the
meeting's own UUIDv7 id and is never persisted - it is not sensitive by
design, and is not the thing standing between an unauthorized user and the
room: the authorization check above is. This is a deliberate answer to "a
hard-to-guess room name is not sufficient authorization" - the name can be
reasonably non-obvious _and_ the endpoint that reveals it is independently
gated.

## JWT / moderator authentication (reserved, not built yet)

Self-hosted Jitsi supports an optional JWT-based auth scheme
(`prosody-plugin-jitsi-meet-tokens`) where the API would sign a short-lived
token (room, user identity, moderator flag) with a locally-generated shared
secret (`JITSI_APP_ID`/`JITSI_APP_SECRET` - never a third-party credential)
that the self-hosted Prosody server validates.

This is **not built yet**, by deliberate choice: no self-hosted Jitsi server
exists to test token validation against at the time this integration
shipped, and the real security boundary (the authorization check above)
already holds without it. JWT would add two things on top: a true,
server-enforced moderator role (today, `session.moderator` is only a UI
hint - "End meeting for everyone" works by calling Lela's own transition
endpoint, not a Jitsi moderation action), and defense-in-depth against
someone who obtains a room name through some other channel. The reserved,
disabled-by-default env vars and the `jwt: string | null` field already in
`MeetingJitsiSessionResponse` make enabling this later purely additive - no
breaking contract change.

## Scale

This integration targets roughly **5-10 concurrent participants per
meeting** as an initial baseline, subject to real VPS resources and testing

- there is no capacity-limiting code, only this expectation. Media traffic
  (audio/video/screen-share) is handled entirely by the Jitsi deployment's own
  JVB component, not by the Lela API; bandwidth and CPU requirements on the
  VPS scale with concurrent participants and video usage, and compete with
  Lela's own containers for the same host resources (see
  `docker/jitsi/README.md`'s resource-usage section).

## Not included

- **Recording** is intentionally out of scope for this integration, while
  keeping the architecture extensible enough to add later (Jitsi's own
  Jibri component would be the natural fit).
- **JWT/moderator enforcement** - see above.

## Testing

Automated tests use a mocked `JitsiMeetExternalAPI` constructor
(`apps/web/src/features/meetings/components/jitsi-meeting-room.test.tsx`)
and a mocked `GET /jitsi-session` response
(`apps/web/src/features/meetings/components/meetings-manager.test.tsx`) -
**no live media functionality has been exercised against a real Jitsi
server**. Backend authorization is covered by a full matrix in
`apps/api/test/meetings-service.spec.ts` (`getJitsiSession` describe block)
and env validation by `apps/api/test/jitsi-config.spec.ts`.
