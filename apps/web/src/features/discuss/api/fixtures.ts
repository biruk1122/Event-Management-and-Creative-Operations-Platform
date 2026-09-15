import type {
  Conversation,
  ConversationMember,
  DiscussPerson,
  Message,
} from "../lib/discuss-types";

/**
 * Placeholder content for the Discuss UI. DSC-05 replaces every seam in this
 * feature with real `@event-platform/api-client` calls; nothing here is a
 * production dependency. `FIXTURE_VIEWER_ID` stands in for the signed-in
 * account until then - every fixture conversation includes it as a member.
 */

export const FIXTURE_VIEWER_ID = "user-you";

const now = "2026-09-15T09:00:00.000Z";
const hourAgo = "2026-09-15T08:00:00.000Z";
const yesterday = "2026-09-14T17:30:00.000Z";

export const FIXTURE_PEOPLE: readonly DiscussPerson[] = [
  {
    id: FIXTURE_VIEWER_ID,
    email: "you@example.com",
    firstName: "You",
    lastName: null,
  },
  {
    id: "user-morgan",
    email: "morgan.lead@example.com",
    firstName: "Morgan",
    lastName: "Lead",
  },
  {
    id: "user-dana",
    email: "dana.okafor@example.com",
    firstName: "Dana",
    lastName: "Okafor",
  },
  {
    id: "user-tal",
    email: "tal.ferreira@example.com",
    firstName: "Tal",
    lastName: "Ferreira",
  },
  {
    id: "user-noname",
    email: "no.name@example.com",
    firstName: null,
    lastName: null,
  },
];

export function findPerson(id: string): DiscussPerson | null {
  return FIXTURE_PEOPLE.find((person) => person.id === id) ?? null;
}

/** Users the "start a conversation" and "add member" pickers may offer. */
export const FIXTURE_ASSIGNABLE_PEOPLE: readonly DiscussPerson[] =
  FIXTURE_PEOPLE.filter((person) => person.id !== FIXTURE_VIEWER_ID);

export const FIXTURE_WORKSPACES: readonly { id: string; name: string }[] = [
  { id: "workspace-gala", name: "Autumn Gala (event)" },
  { id: "workspace-microsite", name: "Launch Microsite (project)" },
];

export const FIXTURE_DEPARTMENTS: readonly { id: string; name: string }[] = [
  { id: "dep-production", name: "Production" },
  { id: "dep-marketing", name: "Marketing" },
];

export const FIXTURE_TEAMS: readonly { id: string; name: string }[] = [
  { id: "team-onsite", name: "On-site crew" },
];

function member(
  personId: string,
  overrides: Partial<ConversationMember> = {},
): ConversationMember {
  const person = findPerson(personId);
  if (!person) throw new Error(`Unknown fixture person: ${personId}`);
  return {
    ...person,
    joinedAt: yesterday,
    lastReadMessageId: null,
    lastReadAt: null,
    ...overrides,
  };
}

function conversation(
  overrides: Partial<Conversation> & Pick<Conversation, "id" | "type">,
): Conversation {
  return {
    name: null,
    visibility: null,
    workspaceId: null,
    departmentId: null,
    teamId: null,
    createdBy: null,
    members: [],
    createdAt: yesterday,
    updatedAt: now,
    ...overrides,
  };
}

export const FIXTURE_CONVERSATIONS: readonly Conversation[] = [
  conversation({
    id: "conversation-dm-morgan",
    type: "DIRECT",
    createdBy: findPerson(FIXTURE_VIEWER_ID),
    members: [
      member(FIXTURE_VIEWER_ID, { lastReadAt: hourAgo }),
      member("user-morgan"),
    ],
    updatedAt: now,
  }),
  conversation({
    id: "conversation-dm-tal",
    type: "DIRECT",
    createdBy: findPerson("user-tal"),
    members: [
      member(FIXTURE_VIEWER_ID, { lastReadAt: yesterday }),
      member("user-tal", { lastReadAt: yesterday }),
    ],
    updatedAt: yesterday,
  }),
  conversation({
    id: "conversation-group-launch",
    type: "GROUP",
    createdBy: findPerson(FIXTURE_VIEWER_ID),
    members: [
      member(FIXTURE_VIEWER_ID, { lastReadAt: hourAgo }),
      member("user-morgan"),
      member("user-dana"),
    ],
    updatedAt: now,
  }),
  conversation({
    id: "conversation-channel-announcements",
    type: "CHANNEL",
    name: "Announcements",
    visibility: "PUBLIC",
    createdBy: findPerson("user-morgan"),
    members: [
      member(FIXTURE_VIEWER_ID, { lastReadAt: now }),
      member("user-morgan"),
      member("user-dana"),
      member("user-tal"),
    ],
    updatedAt: hourAgo,
  }),
  conversation({
    id: "conversation-channel-production",
    type: "CHANNEL",
    name: "Production planning",
    visibility: "PRIVATE",
    departmentId: "dep-production",
    createdBy: findPerson("user-dana"),
    members: [
      member(FIXTURE_VIEWER_ID, { lastReadAt: yesterday }),
      member("user-dana"),
    ],
    updatedAt: yesterday,
  }),
];

function message(
  overrides: Partial<Message> & Pick<Message, "id" | "conversationId">,
): Message {
  return {
    author: null,
    content: "",
    parentMessageId: null,
    editedAt: null,
    deletedAt: null,
    pinnedAt: null,
    pinnedBy: null,
    mentionedUsers: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const FIXTURE_MESSAGES: Record<string, readonly Message[]> = {
  "conversation-dm-morgan": [
    message({
      id: "message-1",
      conversationId: "conversation-dm-morgan",
      author: findPerson("user-morgan"),
      content: "The venue is confirmed for Saturday.",
      createdAt: hourAgo,
      updatedAt: hourAgo,
    }),
    message({
      id: "message-2",
      conversationId: "conversation-dm-morgan",
      author: findPerson(FIXTURE_VIEWER_ID),
      content: "Great, I will update the run sheet.",
      editedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  ],
  "conversation-dm-tal": [
    message({
      id: "message-3",
      conversationId: "conversation-dm-tal",
      author: findPerson("user-tal"),
      content: "Can you send the updated rider?",
      createdAt: yesterday,
      updatedAt: yesterday,
    }),
  ],
  "conversation-group-launch": [
    message({
      id: "message-4",
      conversationId: "conversation-group-launch",
      author: findPerson("user-dana"),
      content: "Kickoff notes are in the shared doc.",
      pinnedAt: now,
      pinnedBy: findPerson("user-dana"),
      createdAt: hourAgo,
      updatedAt: now,
    }),
    message({
      id: "message-5",
      conversationId: "conversation-group-launch",
      author: findPerson(FIXTURE_VIEWER_ID),
      content: "Thanks - looping in Morgan for the budget line.",
      mentionedUsers: [findPerson("user-morgan")!],
      parentMessageId: "message-4",
      createdAt: now,
      updatedAt: now,
    }),
  ],
  "conversation-channel-announcements": [
    message({
      id: "message-6",
      conversationId: "conversation-channel-announcements",
      author: findPerson("user-morgan"),
      content: "Welcome to the team announcements channel.",
      createdAt: hourAgo,
      updatedAt: hourAgo,
    }),
    message({
      id: "message-7",
      conversationId: "conversation-channel-announcements",
      author: findPerson("user-dana"),
      content: "",
      deletedAt: now,
      createdAt: hourAgo,
      updatedAt: now,
    }),
  ],
  "conversation-channel-production": [],
};
