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
  if ("items" in data && "hasMore" in data) {
    return (
      <div className="space-y-3">
        {"count" in data ? (
          <p className="text-2xl font-semibold tabular-nums">
            {data.count}{" "}
            <span className="text-sm font-normal">
              {"totalConversations" in data
                ? `unread across ${data.totalConversations} conversations`
                : "active channels"}
            </span>
          </p>
        ) : null}
        {data.items.length === 0 ? (
          <p>No matching items.</p>
        ) : (
          <ul className="divide-y">
            {data.items.map((item) =>
              "conversationId" in item ? (
                <li key={item.conversationId} className="py-3">
                  <p className="break-all">
                    Conversation {item.conversationId}
                  </p>
                  <p>{item.count} unread</p>
                </li>
              ) : (
                <li key={`${item.kind}-${item.id}`} className="space-y-1 py-3">
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
        {data.hasMore ? (
          <p className="text-muted-foreground text-sm">
            More items available in the source workspace.
          </p>
        ) : null}
      </div>
    );
  }
  if ("count" in data)
    return <p className="text-3xl font-semibold tabular-nums">{data.count}</p>;
  return <p>No results supplied.</p>;
}
