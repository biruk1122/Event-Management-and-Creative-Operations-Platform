import type { TaskWorkspaceData } from "./tasks-types";

/**
 * Test-only presentation data. Production task screens use the generated
 * client; this fixture makes visual states testable without fake persistence.
 */
export const TASK_WORKSPACE_FIXTURE: TaskWorkspaceData = {
  tasks: [
    {
      id: "a0a00000-0000-4000-8000-000000000001",
      workspaceId: "b0b00000-0000-4000-8000-000000000001",
      departmentId: null,
      title: "Confirm venue accessibility plan",
      description: "Confirm step-free routes and reserve accessible seating.",
      priority: "URGENT",
      status: "IN_PROGRESS",
      progress: 60,
      startAt: "2026-09-14T09:00:00.000Z",
      dueAt: "2026-09-18T17:00:00.000Z",
      assignees: [
        {
          id: "c0c00000-0000-4000-8000-000000000001",
          email: "maya.chen@example.com",
          firstName: "Maya",
          lastName: "Chen",
          assignedAt: "2026-09-12T09:00:00.000Z",
        },
        {
          id: "c0c00000-0000-4000-8000-000000000002",
          email: "jon.baker@example.com",
          firstName: "Jon",
          lastName: "Baker",
          assignedAt: "2026-09-12T09:00:00.000Z",
        },
      ],
      createdBy: {
        id: "c0c00000-0000-4000-8000-000000000003",
        email: "alex.rivera@example.com",
        firstName: "Alex",
        lastName: "Rivera",
      },
      createdAt: "2026-09-12T08:00:00.000Z",
      updatedAt: "2026-09-15T10:30:00.000Z",
    },
    {
      id: "a0a00000-0000-4000-8000-000000000002",
      workspaceId: "b0b00000-0000-4000-8000-000000000001",
      departmentId: null,
      title: "Publish guest briefing",
      description: "Share the final arrival and registration briefing.",
      priority: "HIGH",
      status: "TODO",
      progress: 0,
      startAt: "2026-09-16T09:00:00.000Z",
      dueAt: "2026-09-19T17:00:00.000Z",
      assignees: [],
      createdBy: {
        id: "c0c00000-0000-4000-8000-000000000003",
        email: "alex.rivera@example.com",
        firstName: "Alex",
        lastName: "Rivera",
      },
      createdAt: "2026-09-13T08:00:00.000Z",
      updatedAt: "2026-09-13T08:00:00.000Z",
    },
    {
      id: "a0a00000-0000-4000-8000-000000000003",
      workspaceId: null,
      departmentId: "d0d00000-0000-4000-8000-000000000001",
      title: "Review production run sheet",
      description: "Check stage changes, cues, and contingency timings.",
      priority: "MEDIUM",
      status: "UNDER_REVIEW",
      progress: 100,
      startAt: "2026-09-13T09:00:00.000Z",
      dueAt: "2026-09-16T17:00:00.000Z",
      assignees: [
        {
          id: "c0c00000-0000-4000-8000-000000000004",
          email: "sam.ade@example.com",
          firstName: "Sam",
          lastName: "Ade",
          assignedAt: "2026-09-13T09:00:00.000Z",
        },
      ],
      createdBy: {
        id: "c0c00000-0000-4000-8000-000000000003",
        email: "alex.rivera@example.com",
        firstName: "Alex",
        lastName: "Rivera",
      },
      createdAt: "2026-09-13T08:00:00.000Z",
      updatedAt: "2026-09-15T09:00:00.000Z",
    },
    {
      id: "a0a00000-0000-4000-8000-000000000004",
      workspaceId: null,
      departmentId: "d0d00000-0000-4000-8000-000000000001",
      title: "Receive catering confirmation",
      description: null,
      priority: "LOW",
      status: "BLOCKED",
      progress: 35,
      startAt: "2026-09-11T09:00:00.000Z",
      dueAt: "2026-09-17T17:00:00.000Z",
      assignees: [
        {
          id: "c0c00000-0000-4000-8000-000000000005",
          email: "lina.owusu@example.com",
          firstName: "Lina",
          lastName: "Owusu",
          assignedAt: "2026-09-11T09:00:00.000Z",
        },
      ],
      createdBy: null,
      createdAt: "2026-09-11T08:00:00.000Z",
      updatedAt: "2026-09-14T16:30:00.000Z",
    },
    {
      id: "a0a00000-0000-4000-8000-000000000005",
      workspaceId: "b0b00000-0000-4000-8000-000000000001",
      departmentId: null,
      title: "Confirm volunteer check-in roster",
      description: "The check-in rota is ready for the event team.",
      priority: "MEDIUM",
      status: "COMPLETED",
      progress: 100,
      startAt: "2026-09-10T09:00:00.000Z",
      dueAt: "2026-09-14T17:00:00.000Z",
      assignees: [
        {
          id: "c0c00000-0000-4000-8000-000000000001",
          email: "maya.chen@example.com",
          firstName: "Maya",
          lastName: "Chen",
          assignedAt: "2026-09-10T09:00:00.000Z",
        },
      ],
      createdBy: {
        id: "c0c00000-0000-4000-8000-000000000003",
        email: "alex.rivera@example.com",
        firstName: "Alex",
        lastName: "Rivera",
      },
      createdAt: "2026-09-10T08:00:00.000Z",
      updatedAt: "2026-09-14T15:00:00.000Z",
    },
  ],
  details: {},
};

TASK_WORKSPACE_FIXTURE.details[TASK_WORKSPACE_FIXTURE.tasks[0]!.id] = {
  task: TASK_WORKSPACE_FIXTURE.tasks[0]!,
  comments: [
    {
      id: "e0e00000-0000-4000-8000-000000000001",
      content: "The venue has sent the revised accessible-route map.",
      author: TASK_WORKSPACE_FIXTURE.tasks[0]!.assignees[0]!,
      mentionedUsers: [TASK_WORKSPACE_FIXTURE.tasks[0]!.assignees[1]!],
      createdAt: "2026-09-15T10:00:00.000Z",
      updatedAt: "2026-09-15T10:00:00.000Z",
    },
  ],
  activity: [
    {
      id: "f0f00000-0000-4000-8000-000000000001",
      type: "PROGRESS_UPDATED",
      actor: TASK_WORKSPACE_FIXTURE.tasks[0]!.assignees[0]!,
      details: { progress: 60 },
      occurredAt: "2026-09-15T10:30:00.000Z",
    },
  ],
  reviews: [],
  files: [
    {
      id: "f0f00000-0000-4000-8000-000000000002",
      filename: "accessible-route-map.pdf",
      mediaType: "application/pdf",
      sizeBytes: 842_000,
      state: "AVAILABLE",
      availableAt: "2026-09-15T10:00:00.000Z",
      createdAt: "2026-09-15T10:00:00.000Z",
    },
  ],
};

TASK_WORKSPACE_FIXTURE.details[TASK_WORKSPACE_FIXTURE.tasks[2]!.id] = {
  task: TASK_WORKSPACE_FIXTURE.tasks[2]!,
  comments: [],
  activity: [
    {
      id: "f0f00000-0000-4000-8000-000000000003",
      type: "STATUS_CHANGED",
      actor: TASK_WORKSPACE_FIXTURE.tasks[2]!.assignees[0]!,
      details: { status: "UNDER_REVIEW" },
      occurredAt: "2026-09-15T09:00:00.000Z",
    },
  ],
  reviews: [
    {
      id: "f0f00000-0000-4000-8000-000000000004",
      outcome: "CHANGES_REQUESTED",
      note: "Please clarify the rain-delay hand-off.",
      reviewer: {
        id: "c0c00000-0000-4000-8000-000000000003",
        email: "alex.rivera@example.com",
        firstName: "Alex",
        lastName: "Rivera",
      },
      reviewedAt: "2026-09-15T09:30:00.000Z",
    },
  ],
  files: [],
};
