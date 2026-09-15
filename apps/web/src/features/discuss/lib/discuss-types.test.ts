import { describe, expect, it } from "vitest";

import {
  conversationTitle,
  formatActivityTimestamp,
  isUnread,
  personName,
  type Conversation,
  type ConversationMember,
} from "./discuss-types";

function member(
  overrides: Partial<ConversationMember> &
    Pick<ConversationMember, "id" | "email">,
): ConversationMember {
  return {
    firstName: null,
    lastName: null,
    joinedAt: "2026-01-01T00:00:00.000Z",
    lastReadMessageId: null,
    lastReadAt: null,
    ...overrides,
  };
}

describe("personName", () => {
  it("joins first and last name when both are present", () => {
    expect(
      personName({ firstName: "Dana", lastName: "Okafor", email: "d@x.test" }),
    ).toBe("Dana Okafor");
  });

  it("falls back to the email when no name is on file", () => {
    expect(
      personName({ firstName: null, lastName: null, email: "d@x.test" }),
    ).toBe("d@x.test");
  });
});

describe("conversationTitle", () => {
  it("uses the channel's own name for a CHANNEL", () => {
    expect(
      conversationTitle(
        { type: "CHANNEL", name: "Announcements", members: [] },
        "viewer-1",
      ),
    ).toBe("Announcements");
  });

  it("falls back for an unnamed channel", () => {
    expect(
      conversationTitle(
        { type: "CHANNEL", name: null, members: [] },
        "viewer-1",
      ),
    ).toBe("Untitled channel");
  });

  it("lists the other members' names for a direct or group conversation", () => {
    expect(
      conversationTitle(
        {
          type: "DIRECT",
          name: null,
          members: [
            member({ id: "viewer-1", email: "you@x.test" }),
            member({
              id: "user-2",
              email: "morgan@x.test",
              firstName: "Morgan",
            }),
          ],
        },
        "viewer-1",
      ),
    ).toBe("Morgan");
  });

  it("shows a placeholder when the viewer is the only member", () => {
    expect(
      conversationTitle(
        {
          type: "GROUP",
          name: null,
          members: [member({ id: "viewer-1", email: "you@x.test" })],
        },
        "viewer-1",
      ),
    ).toBe("Just you");
  });
});

describe("isUnread", () => {
  const conversation: Pick<Conversation, "updatedAt"> = {
    updatedAt: "2026-09-15T10:00:00.000Z",
  };

  it("is unread when the viewer has never read the conversation", () => {
    expect(isUnread(conversation, { lastReadAt: null })).toBe(true);
  });

  it("is unread when there is activity after the viewer's last read", () => {
    expect(
      isUnread(conversation, { lastReadAt: "2026-09-15T09:00:00.000Z" }),
    ).toBe(true);
  });

  it("is read when the viewer's last read is at or after the activity", () => {
    expect(
      isUnread(conversation, { lastReadAt: "2026-09-15T10:00:00.000Z" }),
    ).toBe(false);
  });
});

describe("formatActivityTimestamp", () => {
  it("renders a time, not a month abbreviation, for today's date", () => {
    const now = new Date();
    const result = formatActivityTimestamp(now.toISOString());
    expect(result).not.toMatch(/[A-Za-z]{3}/);
  });

  it("renders a short date for a past date", () => {
    expect(formatActivityTimestamp("2020-01-15T10:00:00.000Z")).toMatch(/Jan/);
  });
});
