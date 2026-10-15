import { Injectable } from "@nestjs/common";
import {
  GoogleMeetConfig,
  CALENDAR_SCOPE,
  GOOGLE_SCOPES,
} from "./google-meet.config.js";
import { MeetError } from "./google-meet.errors.js";
import { GoogleMeetRepository } from "./google-meet.repository.js";

interface TokenPayload {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}
export interface GoogleEvent {
  id?: string;
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
}

/** The only vendor HTTP boundary. No arbitrary provider URLs or raw error bodies
 * are returned, logged or persisted; every call has a deadline and quota debit. */
@Injectable()
export class GoogleCalendarAdapter {
  constructor(
    private readonly config: GoogleMeetConfig,
    private readonly repository: GoogleMeetRepository,
  ) {}

  private async request(
    userId: string,
    url: string,
    init: RequestInit,
    allowMissing = false,
  ): Promise<Record<string, unknown>> {
    if (!this.config.env.GOOGLE_MEET_ENABLED) throw new MeetError("DISABLED");
    if (!(await this.repository.active(userId)))
      throw new MeetError("RECONNECT_REQUIRED");
    const e = this.config.env;
    await this.repository.reserve(userId, [
      e.GOOGLE_MEET_PROJECT_MINUTE_CAP,
      e.GOOGLE_MEET_PROJECT_DAY_CAP,
      e.GOOGLE_MEET_USER_MINUTE_CAP,
      e.GOOGLE_MEET_USER_DAY_CAP,
    ]);
    try {
      const response = await fetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (allowMissing && [404, 410].includes(response.status)) return {};
      if (response.status === 409) return { duplicate: true };
      if (response.status === 401) throw new MeetError("RECONNECT_REQUIRED");
      // 403 may be either a quota error or an authorization refusal.
      if (response.status === 429) throw new MeetError("QUOTA");
      if (response.status >= 500) throw new MeetError("PROVIDER_UNAVAILABLE");
      if (response.status === 204) return {};
      if (response.ok && url === "https://oauth2.googleapis.com/revoke")
        return {};
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const quota =
          JSON.stringify(body).includes("rateLimitExceeded") ||
          JSON.stringify(body).includes("quotaExceeded") ||
          JSON.stringify(body).includes("userRateLimitExceeded");
        if (body.error === "invalid_grant")
          throw new MeetError("RECONNECT_REQUIRED");
        throw new MeetError(quota ? "QUOTA" : "PROVIDER_DENIED");
      }
      return body;
    } catch (error) {
      if (error instanceof MeetError) throw error;
      throw new MeetError("PROVIDER_UNAVAILABLE");
    }
  }
  authorizationUrl(state: string, challenge: string): string {
    const query = new URLSearchParams({
      client_id: this.config.env.GOOGLE_MEET_CLIENT_ID,
      redirect_uri: this.config.env.GOOGLE_MEET_CALLBACK_URL,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent select_account",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }
  private async token(
    userId: string,
    values: Record<string, string>,
  ): Promise<TokenPayload> {
    const result = (await this.request(
      userId,
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        body: new URLSearchParams({
          ...values,
          client_id: this.config.env.GOOGLE_MEET_CLIENT_ID,
          client_secret: this.config.env.GOOGLE_MEET_CLIENT_SECRET,
        }),
      },
    )) as TokenPayload;
    if (!result.access_token || result.token_type?.toLowerCase() !== "bearer")
      throw new MeetError("PROVIDER_DENIED");
    return result;
  }
  async exchange(userId: string, code: string, verifier: string) {
    const tokens = await this.token(userId, {
      code,
      code_verifier: verifier,
      redirect_uri: this.config.env.GOOGLE_MEET_CALLBACK_URL,
      grant_type: "authorization_code",
    });
    if (
      !tokens.refresh_token ||
      !tokens.scope?.split(" ").includes(CALENDAR_SCOPE)
    )
      throw new MeetError("PROVIDER_DENIED");
    const identity = await this.request(
      userId,
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (
      typeof identity.sub !== "string" ||
      !identity.sub ||
      identity.email_verified !== true
    )
      throw new MeetError("PROVIDER_DENIED");
    return { refreshToken: tokens.refresh_token, subject: identity.sub };
  }
  refresh(userId: string, refreshToken: string) {
    return this.token(userId, {
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
  }
  async revoke(userId: string, token: string): Promise<void> {
    await this.request(userId, "https://oauth2.googleapis.com/revoke", {
      method: "POST",
      body: new URLSearchParams({ token }),
    });
  }
  async event(
    userId: string,
    accessToken: string,
    eventId: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    body?: Record<string, unknown>,
  ): Promise<GoogleEvent & { duplicate?: boolean }> {
    const collection =
      "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    const url =
      method === "POST"
        ? `${collection}?conferenceDataVersion=1&sendUpdates=none`
        : `${collection}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=none`;
    return await this.request(
      userId,
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      method === "DELETE" || method === "GET",
    );
  }
}

export function conferenceLink(event: GoogleEvent): string | null {
  if (event.conferenceData?.createRequest?.status?.statusCode !== "success")
    return null;
  const value = event.conferenceData.entryPoints?.find(
    (p) => p.entryPointType === "video",
  )?.uri;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "meet.google.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname) &&
      !url.search &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}
