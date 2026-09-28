"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CampaignActivity } from "@/features/campaigns/lib/campaigns-types";
import { activityStatusLabel } from "@/features/campaigns/lib/campaigns-types";

import {
  PROMOTION_CHANNEL_LABELS,
  PROMOTION_CHANNELS,
  type PromotionActivity,
  type PromotionChannel,
} from "../promotion-types";

type BoardState = "loading" | "ready" | "error" | "denied";
type ChannelFilter = PromotionChannel | "ALL" | "UNCONFIGURED";

export interface PromotionOperationsBoardProps {
  campaignName: string;
  activities: readonly CampaignActivity[];
  promotionActivities: readonly PromotionActivity[];
  state: BoardState;
  onRetry?: () => void;
  canManage?: boolean;
  canAssignTalent?: boolean;
  availableTalents?: readonly { id: string; name: string }[];
  talentsUnavailable?: boolean;
  onAttach?: (activityId: string, channel: PromotionChannel) => Promise<void>;
  onChangeChannel?: (
    activityId: string,
    channel: PromotionChannel,
  ) => Promise<void>;
  onRemove?: (activityId: string) => Promise<void>;
  onAssignTalent?: (
    activityId: string,
    talentId: string,
    role: string,
  ) => Promise<void>;
  onUnassignTalent?: (activityId: string, talentId: string) => Promise<void>;
}

const CONTROL_CLASS =
  "border-input bg-background text-foreground focus-visible:ring-ring min-h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

export function PromotionOperationsBoard({
  campaignName,
  activities,
  promotionActivities,
  state,
  onRetry,
  canManage = false,
  canAssignTalent = false,
  availableTalents = [],
  talentsUnavailable = false,
  onAttach,
  onChangeChannel,
  onRemove,
  onAssignTalent,
  onUnassignTalent,
}: PromotionOperationsBoardProps) {
  const ids = {
    search: useId(),
    filter: useId(),
    channel: useId(),
    talent: useId(),
    role: useId(),
  };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChannelFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [channel, setChannel] = useState<PromotionChannel>("CONTENT_CREATION");
  const [talentId, setTalentId] = useState("");
  const [role, setRole] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);

  const details = useMemo(
    () => new Map(promotionActivities.map((item) => [item.activity.id, item])),
    [promotionActivities],
  );
  const shown = activities.filter((activity) => {
    const detail = details.get(activity.id);
    return (
      activity.name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) &&
      (filter === "ALL" ||
        (filter === "UNCONFIGURED" ? !detail : detail?.channel === filter))
    );
  });
  const selected = activities.find((activity) => activity.id === selectedId);
  const detail = selected ? details.get(selected.id) : undefined;

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function act(work: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setAnnouncement("");
    try {
      await work();
      setAnnouncement(message);
      setConfirming(false);
    } catch {
      setError("We could not save that change. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading")
    return <p role="status">Loading promotion activities…</p>;
  if (state === "error")
    return (
      <Alert role="alert">
        <AlertTitle>Promotion activities could not be loaded</AlertTitle>
        <AlertDescription>
          <Button variant="outline" onClick={onRetry} disabled={!onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (state === "denied")
    return <p role="alert">You do not have access to promotion activities.</p>;

  return (
    <section
      aria-label={`Promotion activities for ${campaignName}`}
      className="space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">
            Promotion activities
          </h2>
          <p className="text-muted-foreground text-sm">
            Plan delivery channels and talent for {campaignName}. Schedules and
            status remain in campaign activities.
          </p>
        </div>
        <Badge variant="secondary">
          {promotionActivities.length} configured
        </Badge>
      </div>
      {!canManage && (
        <p className="text-muted-foreground text-sm">
          Read-only access. You can review channels and assignments.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ids.search}>Search activities</Label>
          <Input
            id={ids.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by activity name"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.filter}>Channel</Label>
          <select
            id={ids.filter}
            className={CONTROL_CLASS}
            value={filter}
            onChange={(event) => setFilter(event.target.value as ChannelFilter)}
          >
            <option value="ALL">All channels</option>
            <option value="UNCONFIGURED">Needs a channel</option>
            {PROMOTION_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {PROMOTION_CHANNEL_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {activities.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
          No campaign activities yet. Add one in the campaign activity section
          before setting its promotion channel.
        </p>
      ) : shown.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed p-6 text-sm">
          <p>No activities match these filters.</p>
          <Button
            variant="link"
            onClick={() => {
              setSearch("");
              setFilter("ALL");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
          <ul aria-label="Campaign activities" className="min-w-0 space-y-2">
            {shown.map((activity) => {
              const item = details.get(activity.id);
              return (
                <li key={activity.id}>
                  <button
                    type="button"
                    aria-current={
                      selectedId === activity.id ? "true" : undefined
                    }
                    onClick={() => {
                      setSelectedId(activity.id);
                      setChannel(item?.channel ?? "CONTENT_CREATION");
                      setTalentId("");
                      setRole("");
                      setConfirming(false);
                      setError("");
                    }}
                    className="border-border hover:bg-accent focus-visible:ring-ring w-full min-w-0 rounded-lg border p-4 text-left focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="block font-medium break-words">
                      {activity.name}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-sm">
                      {activityStatusLabel(activity.status)} ·{" "}
                      {item
                        ? PROMOTION_CHANNEL_LABELS[item.channel]
                        : "Needs a channel"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-border min-w-0 rounded-lg border p-4 sm:p-5">
            {selected ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold break-words">
                    {selected.name}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {activityStatusLabel(selected.status)}
                  </p>
                </div>
                {error && (
                  <Alert role="alert" variant="destructive">
                    <AlertTitle>Change not saved</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {detail ? (
                  <>
                    <form
                      className="space-y-2"
                      onSubmit={(event: FormEvent) => {
                        event.preventDefault();
                        if (onChangeChannel && channel !== detail.channel)
                          void act(
                            () => onChangeChannel(selected.id, channel),
                            "Channel updated.",
                          );
                      }}
                    >
                      <Label htmlFor={ids.channel}>Delivery channel</Label>
                      <select
                        id={ids.channel}
                        className={CONTROL_CLASS}
                        value={channel}
                        onChange={(event) =>
                          setChannel(event.target.value as PromotionChannel)
                        }
                        disabled={!canManage || busy}
                      >
                        {PROMOTION_CHANNELS.map((value) => (
                          <option key={value} value={value}>
                            {PROMOTION_CHANNEL_LABELS[value]}
                          </option>
                        ))}
                      </select>
                      {canManage && (
                        <Button
                          type="submit"
                          disabled={
                            busy ||
                            !onChangeChannel ||
                            channel === detail.channel
                          }
                        >
                          Save channel
                        </Button>
                      )}
                    </form>
                    <div className="space-y-3">
                      <h4 className="font-medium">Talent assignments</h4>
                      {detail.talents.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          No talent assigned yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {detail.talents.map((talent) => (
                            <li
                              key={talent.id}
                              className="border-border flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                            >
                              <span className="min-w-0 break-words">
                                {availableTalents.find(
                                  (item) => item.id === talent.talentId,
                                )?.name ?? "Talent"}{" "}
                                · {talent.role}
                              </span>
                              {canAssignTalent && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy || !onUnassignTalent}
                                  onClick={() =>
                                    onUnassignTalent &&
                                    void act(
                                      () =>
                                        onUnassignTalent(
                                          selected.id,
                                          talent.talentId,
                                        ),
                                      "Talent removed.",
                                    )
                                  }
                                >
                                  Remove talent
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {canAssignTalent && (
                        <form
                          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                          onSubmit={(event: FormEvent) => {
                            event.preventDefault();
                            if (!talentId || !role.trim() || !onAssignTalent)
                              return;
                            void act(
                              () =>
                                onAssignTalent(
                                  selected.id,
                                  talentId,
                                  role.trim(),
                                ),
                              "Talent assigned.",
                            );
                          }}
                        >
                          <div className="space-y-1">
                            <Label htmlFor={ids.talent}>Talent</Label>
                            <select
                              id={ids.talent}
                              className={CONTROL_CLASS}
                              value={talentId}
                              onChange={(event) =>
                                setTalentId(event.target.value)
                              }
                              disabled={
                                busy ||
                                talentsUnavailable ||
                                availableTalents.length === 0
                              }
                            >
                              <option value="">Choose talent</option>
                              {availableTalents.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={ids.role}>Role</Label>
                            <Input
                              id={ids.role}
                              value={role}
                              onChange={(event) => setRole(event.target.value)}
                              maxLength={200}
                              disabled={busy || talentsUnavailable}
                              placeholder="e.g. Presenter"
                            />
                          </div>
                          <Button
                            type="submit"
                            disabled={
                              busy ||
                              !onAssignTalent ||
                              !talentId ||
                              !role.trim() ||
                              talentsUnavailable
                            }
                          >
                            Assign
                          </Button>
                        </form>
                      )}
                      {canAssignTalent &&
                        (talentsUnavailable ||
                          availableTalents.length === 0) && (
                          <p
                            role="status"
                            className="text-muted-foreground text-sm"
                          >
                            Talent choices are unavailable. Try again when they
                            load.
                          </p>
                        )}
                    </div>
                    {canManage && (
                      <div className="border-border border-t pt-4">
                        {confirming ? (
                          <div className="space-y-2">
                            <p>
                              Remove this promotion detail and its talent
                              assignments? The shared campaign activity will
                              remain.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                ref={confirmRef}
                                type="button"
                                variant="destructive"
                                disabled={busy || !onRemove}
                                onClick={() =>
                                  onRemove &&
                                  void act(
                                    () => onRemove(selected.id),
                                    "Promotion detail removed.",
                                  )
                                }
                              >
                                Confirm removal
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setConfirming(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy || !onRemove}
                            onClick={() => setConfirming(true)}
                          >
                            Remove promotion detail
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-muted-foreground text-sm">
                      This activity does not have a promotion channel yet.
                    </p>
                    {canManage && (
                      <form
                        className="space-y-2"
                        onSubmit={(event: FormEvent) => {
                          event.preventDefault();
                          if (onAttach)
                            void act(
                              () => onAttach(selected.id, channel),
                              "Promotion channel added.",
                            );
                        }}
                      >
                        <Label htmlFor={ids.channel}>Delivery channel</Label>
                        <select
                          id={ids.channel}
                          className={CONTROL_CLASS}
                          value={channel}
                          onChange={(event) =>
                            setChannel(event.target.value as PromotionChannel)
                          }
                          disabled={busy}
                        >
                          {PROMOTION_CHANNELS.map((value) => (
                            <option key={value} value={value}>
                              {PROMOTION_CHANNEL_LABELS[value]}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" disabled={busy || !onAttach}>
                          Add channel
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Choose an activity to review its promotion plan.
              </p>
            )}
          </div>
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
