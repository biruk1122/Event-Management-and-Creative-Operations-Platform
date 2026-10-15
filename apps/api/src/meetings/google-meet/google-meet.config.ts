import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ENVIRONMENT, type Environment } from "../../config/environment.js";

export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.owned";
export const GOOGLE_SCOPES = ["openid", "email", CALENDAR_SCOPE];

/** Versioned AES-GCM keyring. AAD binds each secret to its purpose and owner. */
export class MeetTokenCipher {
  private readonly keys: Record<string, Buffer>;
  constructor(
    private readonly active: string,
    serialized: string,
  ) {
    let values: Record<string, string>;
    try {
      const parsed = JSON.parse(serialized) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error();
      values = parsed as Record<string, string>;
    } catch {
      // JSON parser messages may include the secret input; never propagate it.
      throw new Error("Invalid Meet encryption keyring");
    }
    this.keys = Object.fromEntries(
      Object.entries(values).map(([id, key]) => {
        if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || typeof key !== "string")
          throw new Error("Invalid Meet keyring");
        const bytes = Buffer.from(key, "base64");
        if (bytes.length !== 32)
          throw new Error("Meet encryption keys must contain 32 bytes");
        return [id, bytes];
      }),
    );
    if (!this.keys[active])
      throw new Error("Active Meet encryption key is missing");
  }
  seal(value: string, owner: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys[this.active]!, iv);
    cipher.setAAD(Buffer.from(owner));
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      this.active,
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }
  open(value: string, owner: string): string {
    const [id, iv, tag, data, extra] = value.split(".");
    if (!id || !iv || !tag || !data || extra || !this.keys[id])
      throw new Error("Meet secret unavailable");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.keys[id],
      Buffer.from(iv, "base64url"),
    );
    cipher.setAAD(Buffer.from(owner));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      cipher.update(Buffer.from(data, "base64url")),
      cipher.final(),
    ]).toString("utf8");
  }
}

@Injectable()
export class GoogleMeetConfig {
  readonly cipher: MeetTokenCipher | null;
  constructor(@Inject(ENVIRONMENT) readonly env: Environment) {
    this.cipher = null;
    if (!env.GOOGLE_MEET_ENABLED) return;
    // This is an operator attestation, not a claim to inspect Google billing.
    if (
      !env.GOOGLE_MEET_OPERATOR.trim() ||
      !env.GOOGLE_MEET_ACTIVATION_REVIEW.trim() ||
      !env.GOOGLE_MEET_CLIENT_ID ||
      !env.GOOGLE_MEET_CLIENT_SECRET
    )
      throw new Error("Meet activation review and credentials are required");
    for (const value of [
      env.GOOGLE_MEET_CALLBACK_URL,
      env.GOOGLE_MEET_RETURN_URL,
    ]) {
      const url = new URL(value);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(
            env.NODE_ENV !== "production" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)
          ))
      )
        throw new Error("Invalid Meet callback/return URL");
    }
    if (
      new URL(env.GOOGLE_MEET_CALLBACK_URL).pathname !==
      "/api/v1/meetings/google-calendar/callback"
    )
      throw new Error("Meet callback path must match the API route");
    this.cipher = new MeetTokenCipher(
      env.GOOGLE_MEET_KEY_ID,
      env.GOOGLE_MEET_KEYS,
    );
    // Never reuse the session signing secrets as encryption keys.
    const values = Object.values(
      JSON.parse(env.GOOGLE_MEET_KEYS) as Record<string, string>,
    );
    if (
      values.some(
        (key) =>
          key === env.AUTH_ACCESS_TOKEN_SECRET ||
          key === env.AUTH_REFRESH_TOKEN_SECRET,
      )
    )
      throw new Error("Meet keys must be independent of session secrets");
  }
}
