import { describe, expect, it } from "vitest";

import { validateEnvironment } from "../src/config/environment.js";
import { JitsiConfig } from "../src/meetings/jitsi/jitsi.config.js";

const REQUIRED = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_ACCESS_TOKEN_SECRET: "access-token-secret-at-least-32-characters",
  AUTH_REFRESH_TOKEN_SECRET: "refresh-token-secret-at-least-32-characters",
};

describe("JitsiConfig", () => {
  it("defaults to disabled with no domain or JWT", () => {
    const config = new JitsiConfig(validateEnvironment(REQUIRED));
    expect(config.enabled).toBe(false);
    expect(config.domain).toBe("");
    expect(config.jwt).toBeNull();
  });

  it("accepts an enabled configuration with a domain", () => {
    const config = new JitsiConfig(
      validateEnvironment({
        ...REQUIRED,
        JITSI_ENABLED: "true",
        JITSI_DOMAIN: "meet.example.test",
      }),
    );
    expect(config.enabled).toBe(true);
    expect(config.domain).toBe("meet.example.test");
  });

  it("throws when enabled without a domain", () => {
    expect(
      () =>
        new JitsiConfig(
          validateEnvironment({ ...REQUIRED, JITSI_ENABLED: "true" }),
        ),
    ).toThrow(/JITSI_DOMAIN/);
  });

  it("builds a JWT config when JWT auth is enabled with both credentials", () => {
    const config = new JitsiConfig(
      validateEnvironment({
        ...REQUIRED,
        JITSI_JWT_ENABLED: "true",
        JITSI_APP_ID: "lela",
        JITSI_APP_SECRET: "a-very-secret-value",
      }),
    );
    expect(config.jwt).toEqual({
      appId: "lela",
      appSecret: "a-very-secret-value",
    });
  });

  it("throws when JWT auth is enabled without both credentials", () => {
    expect(
      () =>
        new JitsiConfig(
          validateEnvironment({
            ...REQUIRED,
            JITSI_JWT_ENABLED: "true",
            JITSI_APP_ID: "lela",
          }),
        ),
    ).toThrow(/JITSI_APP_ID and JITSI_APP_SECRET/);
  });
});
