import type { components } from "@event-platform/api-client";
import { AnalyticsResults } from "@/features/analytics";
import type { DashboardCard } from "../lib/dashboard-presentation";

type Schemas = components["schemas"];
export function DashboardResults({
  card,
  cardKey,
}: {
  card: DashboardCard;
  cardKey: string;
}) {
  const data = card.data;
  if (!data) return <p>No results supplied.</p>;
  if (cardKey === "taskCompletionRate" && "counts" in data)
    return <AnalyticsResults measure="tasks" data={data} />;
  if (
    [
      "departmentPerformance",
      "eventProgress",
      "marketingProgress",
      "promotionPerformance",
      "monthlyActivity",
    ].includes(cardKey)
  ) {
    const measure = {
      departmentPerformance: "departments",
      eventProgress: "events",
      marketingProgress: "campaigns",
      promotionPerformance: "promotion",
      monthlyActivity: "monthly",
    } as const;
    return (
      <AnalyticsResults
        measure={measure[cardKey as keyof typeof measure]}
        data={
          data as
            | Schemas["WorkAnalyticsPageResponse"]
            | Schemas["ProgressAnalyticsPageResponse"]
            | Schemas["PromotionAnalyticsResponse"]
            | Schemas["MonthlyAnalyticsResponse"]
        }
      />
    );
  }
  if (cardKey === "budgetPlannedVsApproved" && "items" in data) {
    const budget = data as Schemas["DashboardBudgetList"];
    return (
      <div className="space-y-3">
        {budget.items.length === 0 ? (
          <p>No event budgets in scope.</p>
        ) : (
          <ul className="space-y-2">
            {budget.items.map((item) => (
              <li
                key={item.eventId}
                className="bg-muted/50 space-y-1 rounded-xl border p-3"
              >
                <p className="font-medium break-words">{item.eventName}</p>
                <p className="text-muted-foreground text-sm">
                  Planned:{" "}
                  {item.plannedAmount
                    ? `${item.plannedAmount} ${item.currency ?? ""}`
                    : "not set"}
                </p>
                <p className="text-sm">
                  Approved: {item.actualApproved} · Pending:{" "}
                  {item.actualPending}
                </p>
              </li>
            ))}
          </ul>
        )}
        {budget.hasMore ? (
          <p className="text-muted-foreground text-sm">
            More items available in the source workspace.
          </p>
        ) : null}
      </div>
    );
  }
  if ("items" in data && "hasMore" in data) {
    const list = data as Exclude<typeof data, Schemas["DashboardBudgetList"]>;
    return (
      <div className="space-y-3">
        {"count" in list ? (
          <p className="text-2xl font-semibold tabular-nums">
            {list.count}{" "}
            <span className="text-sm font-normal">
              {"totalConversations" in list
                ? `unread across ${list.totalConversations} conversations`
                : "active channels"}
            </span>
          </p>
        ) : null}
        {list.items.length === 0 ? (
          <p>No matching items.</p>
        ) : (
          <ul className="space-y-2">
            {list.items.map((item) =>
              "conversationId" in item ? (
                <li
                  key={item.conversationId}
                  className="bg-muted/50 rounded-xl border p-3"
                >
                  <p className="break-all">
                    Conversation {item.conversationId}
                  </p>
                  <p>{item.count} unread</p>
                </li>
              ) : (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="bg-muted/50 space-y-1 rounded-xl border p-3"
                >
                  <p className="font-medium break-words">{item.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {item.kind.replaceAll("_", " ")}
                    {item.status
                      ? ` · ${item.status.replaceAll("_", " ")}`
                      : ""}
                  </p>
                  {item.attentionReasons?.length ? (
                    <p className="text-sm">
                      Needs attention:{" "}
                      {item.attentionReasons.join(", ").replaceAll("_", " ")}
                    </p>
                  ) : null}
                  {[
                    item.startAt && `Starts ${item.startAt} (UTC)`,
                    item.endAt && `Ends ${item.endAt} (UTC)`,
                    item.dueAt && `Due ${item.dueAt} (UTC)`,
                    item.occurredAt &&
                      `${item.activityType ?? "Activity"}: ${item.occurredAt} (UTC)`,
                  ]
                    .filter(Boolean)
                    .map((text) => (
                      <p key={text as string} className="text-sm break-words">
                        {text}
                      </p>
                    ))}
                  {item.dueDate ? (
                    <p className="text-sm">
                      Due {item.dueDate}
                      {item.dueTime ? ` at ${item.dueTime}` : ""} (floating
                      date/time; no timezone)
                    </p>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}
        {list.hasMore ? (
          <p className="text-muted-foreground text-sm">
            More items available in the source workspace.
          </p>
        ) : null}
      </div>
    );
  }
  if ("count" in data)
    return (
      <p className="text-primary py-2 text-4xl font-semibold tracking-tight tabular-nums">
        {data.count}
      </p>
    );
  return <p>No results supplied.</p>;
}
