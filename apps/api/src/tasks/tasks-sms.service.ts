import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { ENVIRONMENT, type Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import { AuditWriterService } from "../audit/audit-writer.service.js";
import {
  AuditActorKind,
  AuditOutcome,
  TaskStatus,
  type Prisma,
} from "../generated/prisma/client.js";
import { formatSmsDateTime, smsPersonName } from "../sms/sms-format.js";
import type { DispatchView } from "../sms/sms.repository.js";
import { SmsService } from "../sms/sms.service.js";
import { smsTitle } from "../sms/templates.js";

/** Reminders go out only for assignments made at least this long before the due date. */
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const SCAN_INTERVAL_MS = 60_000;
/** Tasks per scan page. Pages continue across scans, so a larger backlog is still fully covered. */
export const SCAN_PAGE_SIZE = 200;

const CLOSED: TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

/** The id to continue from. A short page means the backlog is done, so the next scan starts again from the beginning. */
export function nextScanCursor(
  page: readonly { id: string }[],
  pageSize: number = SCAN_PAGE_SIZE,
): string | undefined {
  if (page.length < pageSize) return undefined;
  return page[page.length - 1]!.id;
}

/**
 * Task SMS. Assignment messages are queued in the transaction that adds the
 * assignee. Overdue notices are queued in the transaction that writes the
 * in-app `task.overdue` claim, which happens once per task. Reminders come from
 * a scan. Each message is keyed to one assignment and one due date, so repeats
 * cannot send it twice. Each rule is checked again at send time.
 *
 * Every SMS step runs in a savepoint of its business transaction, so an SMS
 * failure never undoes the business change.
 */
@Injectable()
export class TasksSmsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksSmsService.name);
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;
  /** Where the reminder scan continues from. Undefined means the next scan starts at the beginning. */
  private reminderCursor: string | undefined;

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly db: DatabaseService,
    private readonly sms: SmsService,
    private readonly audit: AuditWriterService,
  ) {}

  onModuleInit(): void {
    this.sms.registerPrecondition("TASK_ASSIGNED", (message) =>
      this.check(message, false),
    );
    this.sms.registerPrecondition("TASK_REMINDER", (message) =>
      this.check(message, true),
    );
    this.sms.registerPrecondition("TASK_OVERDUE", (message) =>
      this.check(message, true),
    );
    if (!this.environment.AFROMESSAGE_ENABLED) return;
    this.timer = setInterval(() => {
      void this.scan(new Date());
    }, SCAN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Queues the assignment message in the caller's transaction. Never throws for an SMS failure. */
  async enqueueAssignment(
    tx: Prisma.TransactionClient,
    input: {
      taskId: string;
      assignmentId: string;
      taskTitle: string;
      dueAt: Date | null;
      assigneeUserId: string;
      assignedById: string | null;
      requestId: string;
    },
  ): Promise<void> {
    await this.sms.isolate(
      tx,
      "task assignment",
      async () => {
        const [assignee, actor] = await Promise.all([
          tx.user.findUnique({
            where: { id: input.assigneeUserId },
            select: { phone: true, firstName: true, lastName: true },
          }),
          input.assignedById
            ? tx.user.findUnique({
                where: { id: input.assignedById },
                select: { firstName: true, lastName: true },
              })
            : Promise.resolve(null),
        ]);
        await this.sms.enqueue(tx, {
          category: "TASK_ASSIGNED",
          idempotencyKey: `task.assigned:${input.assignmentId}`,
          recipientUserId: input.assigneeUserId,
          recipientPhone: assignee?.phone,
          template: "TASK_ASSIGNED",
          params: {
            employee_name: smsPersonName(assignee, "there"),
            task_title: smsTitle(input.taskTitle),
            assigned_by: smsPersonName(actor, "Lela"),
            due_date: formatSmsDateTime(input.dueAt),
          },
          sourceType: "task_assignment",
          sourceId: input.assignmentId,
          actorKind: input.assignedById ? "USER" : "SYSTEM",
          ...(input.assignedById ? { actorUserId: input.assignedById } : {}),
          requestId: input.requestId,
        });
      },
      (error) =>
        this.recordFailure(
          tx,
          input.taskId,
          "TASK_ASSIGNED",
          input.requestId,
          error,
        ),
    );
  }

  /**
   * Leaves a durable audit record of an SMS that could not be queued. The
   * business change still commits. Assignment and overdue messages are not
   * retried automatically, so this record is the only trace of the failure.
   * The message text and the recipient's number are not recorded.
   */
  private async recordFailure(
    tx: Prisma.TransactionClient,
    taskId: string,
    category: string,
    requestId: string | undefined,
    error: unknown,
  ): Promise<void> {
    const reason = error instanceof Error ? error.message : "unknown error";
    await this.audit.append(tx, {
      action: "sms.enqueue_failed",
      actorKind: AuditActorKind.SYSTEM,
      ...(requestId ? { requestId } : {}),
      resourceType: "task",
      resourceId: taskId,
      outcome: AuditOutcome.FAILED,
      metadata: { category, reason: reason.slice(0, 200) },
    });
  }

  /**
   * Queues overdue notices for one task, in the transaction that writes its
   * in-app `task.overdue` claim. That claim is written once per task, the first
   * time the task becomes overdue, so this runs once too. Tasks that were already
   * overdue before SMS was enabled had their claim written then, so they are
   * not notified now. No date cutoff is needed.
   */
  async queueOverdue(
    tx: Prisma.TransactionClient,
    taskId: string,
    dueAt: Date,
  ): Promise<void> {
    await this.sms.isolate(
      tx,
      "task overdue",
      async () => {
        const task = await tx.task.findUnique({
          where: { id: taskId },
          select: {
            title: true,
            status: true,
            dueAt: true,
            assignments: { select: { id: true, userId: true } },
          },
        });
        if (!task || CLOSED.includes(task.status)) return;
        if (task.dueAt?.getTime() !== dueAt.getTime()) return;
        for (const assignment of task.assignments) {
          const assignee = await tx.user.findUnique({
            where: { id: assignment.userId },
            select: { phone: true },
          });
          await this.sms.enqueue(tx, {
            category: "TASK_OVERDUE",
            idempotencyKey: `task.overdue:${assignment.id}:${dueAt.toISOString()}`,
            recipientUserId: assignment.userId,
            recipientPhone: assignee?.phone,
            template: "TASK_OVERDUE",
            params: {
              task_title: smsTitle(task.title),
              due_date: formatSmsDateTime(dueAt),
            },
            sourceType: "task_assignment",
            sourceId: assignment.id,
            sourceDueAt: dueAt,
            actorKind: "SYSTEM",
          });
        }
      },
      (error) =>
        this.recordFailure(tx, taskId, "TASK_OVERDUE", undefined, error),
    );
  }

  /**
   * One reminder scan. It pages through open tasks due within the next 24 hours,
   * a page at a time, continuing from the last id on the next scan. Each
   * assignment that was made at least 24 hours before the due date is queued
   * once. Assignments made inside the window get no reminder.
   */
  async scan(now: Date): Promise<number> {
    if (!this.environment.AFROMESSAGE_ENABLED || this.scanning) return 0;
    this.scanning = true;
    let queued = 0;
    try {
      const soon = new Date(now.getTime() + REMINDER_WINDOW_MS);
      const page = await this.db.task.findMany({
        where: {
          status: { notIn: CLOSED },
          dueAt: { gt: now, lte: soon },
          ...(this.reminderCursor ? { id: { gt: this.reminderCursor } } : {}),
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          title: true,
          dueAt: true,
          assignments: { select: { id: true, userId: true, assignedAt: true } },
        },
        take: SCAN_PAGE_SIZE,
      });
      for (const task of page) {
        queued += await this.queueReminders(task);
      }
      this.reminderCursor = nextScanCursor(page);
    } catch (error) {
      this.logger.error(
        `task SMS scan failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      this.scanning = false;
    }
    return queued;
  }

  private async queueReminders(task: {
    title: string;
    dueAt: Date | null;
    assignments: { id: string; userId: string; assignedAt: Date }[];
  }): Promise<number> {
    if (!task.dueAt) return 0;
    const dueAt = task.dueAt;
    const latestAssignment = dueAt.getTime() - REMINDER_WINDOW_MS;
    let queued = 0;
    for (const assignment of task.assignments) {
      // Assigned inside the 24-hour window: no reminder, so nothing is sent late.
      if (assignment.assignedAt.getTime() > latestAssignment) continue;
      const outcome = await this.db.$transaction((tx) =>
        this.sms.isolate(tx, "task reminder", async () => {
          const assignee = await tx.user.findUnique({
            where: { id: assignment.userId },
            select: { phone: true },
          });
          return this.sms.enqueue(tx, {
            category: "TASK_REMINDER",
            idempotencyKey: `task.reminder:${assignment.id}:${dueAt.toISOString()}`,
            recipientUserId: assignment.userId,
            recipientPhone: assignee?.phone,
            template: "TASK_REMINDER",
            params: {
              task_title: smsTitle(task.title),
              due_date: formatSmsDateTime(dueAt),
            },
            sourceType: "task_assignment",
            sourceId: assignment.id,
            sourceDueAt: dueAt,
            actorKind: "SYSTEM",
          });
        }),
      );
      if (outcome?.kind === "QUEUED") queued += 1;
    }
    return queued;
  }

  /**
   * Send-time rule for task messages. The assignment must still exist and still
   * belong to the recipient, the task must still be open, and for reminders and
   * overdue notices the due date must be the one the message was scheduled for.
   */
  private async check(
    message: DispatchView,
    dueDateMatters: boolean,
  ): Promise<string | null> {
    if (!message.sourceId) return "ASSIGNMENT_REMOVED";
    const assignment = await this.db.taskAssignment.findUnique({
      where: { id: message.sourceId },
      select: {
        userId: true,
        task: { select: { status: true, dueAt: true } },
      },
    });
    if (!assignment) return "ASSIGNMENT_REMOVED";
    if (assignment.userId !== message.recipientUserId)
      return "ASSIGNEE_CHANGED";
    if (CLOSED.includes(assignment.task.status)) return "TASK_CLOSED";
    if (dueDateMatters) {
      const scheduled = message.sourceDueAt?.getTime() ?? null;
      const current = assignment.task.dueAt?.getTime() ?? null;
      if (scheduled === null || scheduled !== current)
        return "DUE_DATE_CHANGED";
    }
    return null;
  }
}
