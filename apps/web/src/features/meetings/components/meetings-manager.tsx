"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  Plus,
  UserRound,
  UsersRound,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  useRealtimeConnection,
  type ConnectRealtime,
} from "@/features/realtime";

import {
  getMeeting,
  listAssignablePeople,
  MeetingsRequestError,
  type Meeting,
  type UpdateMeetingInput,
} from "../api/meetings-gateway";
import {
  meetingsKeys,
  useMeetingMutations,
  useMeetings,
} from "../api/meetings-queries";
import { getJitsiSession } from "../api/jitsi-gateway";
import styles from "./meetings-presentation.module.css";
import { CreateMeetingForm } from "./create-meeting-form";
import { JitsiMeetingRoom } from "./jitsi-meeting-room";
import { EditMeetingDialog } from "./edit-meeting-dialog";
import { RemoveMeetingDialog } from "./remove-meeting-dialog";

const LIVE_EVENT = "notification.invalidated";

const MEETING_TYPE_LABELS: Record<Meeting["type"], string> = {
  PHYSICAL: "In person",
  ONLINE: "Online",
  HYBRID: "Hybrid",
};

const MEETING_STATUS_LABELS: Record<Meeting["status"], string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PARTICIPANT_RESPONSE_LABELS: Record<
  Meeting["participants"][number]["response"],
  string
> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};

function personName(person: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return name || person.email;
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type MeetingPeriod = "upcoming" | "past";

function meetingPeriod(meeting: Meeting): MeetingPeriod {
  return meeting.status === "SCHEDULED" &&
    new Date(meeting.endAt).getTime() >= Date.now()
    ? "upcoming"
    : "past";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
    new Date(value),
  );
}

export interface MeetingsManagerProps {
  access: CurrentAccess;
  connect?: ConnectRealtime;
}

/** REST-backed meeting list and participant response surface. */
export function MeetingsManager({ access, connect }: MeetingsManagerProps) {
  const client = useQueryClient();
  const keys = meetingsKeys(access);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [period, setPeriod] = useState<MeetingPeriod | null>(null);
  // A `MEETING_INVITATION` notification deep-links here with `?meetingId=` -
  // reuse the existing detail fetch-and-merge query so that meeting is
  // selected and visible even when it isn't on the currently loaded page.
  // Adjusted during render (React's documented pattern for state that must
  // follow a changed prop/param) rather than in an effect, to avoid an extra
  // commit with the stale selection.
  const meetingIdParam = useSearchParams().get("meetingId");
  const [appliedMeetingIdParam, setAppliedMeetingIdParam] = useState<
    string | null
  >(null);
  if (meetingIdParam !== appliedMeetingIdParam) {
    setAppliedMeetingIdParam(meetingIdParam);
    if (meetingIdParam) {
      setPeriod(null);
      setCreatedId(meetingIdParam);
      setSelectedId(meetingIdParam);
    }
  }
  const reconcile = useCallback(() => {
    void client.invalidateQueries({ queryKey: keys.all });
  }, [client, keys.all]);

  // Meeting invitations are delivered through the authorized per-user
  // notification invalidation. Its payload is advisory; a frame only causes
  // the REST query to refetch (ADR 0004).
  const connection = useRealtimeConnection(connect, (event) => {
    if (event === LIVE_EVENT) reconcile();
  });
  const everConnected = useRef(false);
  useEffect(() => {
    if (connection.state.status === "connected") {
      if (everConnected.current) reconcile();
      everConnected.current = true;
    }
  }, [connection.state.status, reconcile]);

  const feed = useMeetings(access);
  const mutations = useMeetingMutations(access);
  const createdDetail = useQuery({
    queryKey: [...keys.all, "detail", createdId],
    queryFn: ({ signal }) => getMeeting(createdId!, signal),
    enabled: createdId !== null,
    retry: false,
  });
  useEffect(() => {
    if (
      feed.error instanceof MeetingsRequestError &&
      (feed.error.status === 401 || feed.error.status === 403)
    ) {
      void client.invalidateQueries({ queryKey: accessKey });
    }
  }, [feed.error, client]);

  const meetings = useMemo(() => {
    const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
    // The detail query refreshes after minutes/Google mutations even outside loaded pages.
    const createdMeeting = createdDetail.isError
      ? undefined
      : createdDetail.data;
    return createdMeeting &&
      !items.some((item) => item.id === createdMeeting.id)
      ? [createdMeeting, ...items]
      : items;
  }, [feed.data, createdDetail.data, createdDetail.isError]);
  const requestedMeeting = meetings.find(
    (meeting) => meeting.id === selectedId,
  );
  const activePeriod =
    period ??
    (requestedMeeting
      ? meetingPeriod(requestedMeeting)
      : meetings.some((meeting) => meetingPeriod(meeting) === "upcoming")
        ? "upcoming"
        : "past");
  const visibleMeetings = meetings.filter(
    (meeting) => meetingPeriod(meeting) === activePeriod,
  );
  const selected =
    visibleMeetings.find((meeting) => meeting.id === selectedId) ??
    visibleMeetings[0] ??
    null;
  const participant = selected?.participants.find(
    (item) => item.id === access.userId,
  );
  const canRespond =
    participant?.response === "PENDING" &&
    selected?.status === "SCHEDULED" &&
    access.grants.some((grant) => grant.permissionKey === "meeting.respond");
  const isOrganizer = selected?.organizer.id === access.userId;
  // "as its organizer" (EOM-01): the backend enforces this; hiding the
  // controls for anyone else avoids a confusing 403 after a submit.
  const canManage = Boolean(
    isOrganizer &&
    access.grants.some(
      (grant) =>
        grant.permissionKey === "meeting.update" &&
        (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
    ),
  );
  const canOrganize = canManage && selected?.status !== "CANCELLED";
  const canCreate = access.grants.some(
    (grant) =>
      grant.permissionKey === "meeting.create" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );
  // `GET /api/v1/users` requires `user.read` at ORGANIZATION scope (Super
  // Admin only) - a Department Manager can create meetings but cannot
  // browse the full directory, same constraint productions' own "Add
  // member" picker already has.
  const canListPeople = access.grants.some(
    (grant) =>
      grant.permissionKey === "user.read" && grant.scope === "ORGANIZATION",
  );
  const people = useQuery({
    queryKey: ["meetings", "assignable-people"],
    queryFn: ({ signal }) => listAssignablePeople(signal),
    enabled: canCreate && canListPeople,
    retry: false,
    staleTime: 60_000,
  });

  async function respond(response: "ACCEPTED" | "DECLINED") {
    if (!selected) return;
    setNotice(null);
    try {
      await mutations.respond.mutateAsync({ id: selected.id, response });
      setNotice(`Your response is marked ${response.toLowerCase()}.`);
    } catch (error) {
      setNotice(
        error instanceof MeetingsRequestError
          ? error.message
          : "We could not update your response. Try again.",
      );
    }
  }

  async function saveMinutes(minutes: string) {
    if (!selected) return false;
    setNotice(null);
    try {
      await mutations.setMinutes.mutateAsync({ id: selected.id, minutes });
      setNotice("Meeting notes saved.");
      return true;
    } catch (error) {
      setNotice(
        error instanceof MeetingsRequestError
          ? error.message
          : "We could not save the meeting notes. Try again.",
      );
      return false;
    }
  }

  async function addActionItem(title: string) {
    if (!selected) return false;
    setNotice(null);
    try {
      await mutations.createActionItem.mutateAsync({
        id: selected.id,
        input: { title },
      });
      setNotice("Action item created.");
      return true;
    } catch (error) {
      setNotice(
        error instanceof MeetingsRequestError
          ? error.message
          : "We could not create that action item. Try again.",
      );
      return false;
    }
  }

  if (feed.isPending) return <p role="status">Loading your meetings…</p>;
  if (feed.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>
          {feed.error instanceof MeetingsRequestError
            ? feed.error.message
            : "We could not load your meetings. Try again."}
        </p>
        <Button variant="outline" onClick={() => void feed.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  async function endMeeting() {
    if (!selected) return;
    setNotice(null);
    try {
      await mutations.transition.mutateAsync({
        id: selected.id,
        status: "COMPLETED",
      });
    } catch (error) {
      setNotice(
        error instanceof MeetingsRequestError
          ? error.message
          : "We could not end the meeting. Try again.",
      );
    }
  }

  return (
    <div className={`${styles.surface} space-y-4`}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <span className={styles.headerIcon}>
            <CalendarDays aria-hidden="true" />
          </span>
          <div>
            <h1>Meetings</h1>
            <p>Your schedule, and the meetings you&apos;ve been invited to.</p>
          </div>
        </div>
        {canCreate && !creating ? (
          <Button data-meeting-create onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Create meeting
          </Button>
        ) : null}
      </header>
      {canCreate && creating ? (
        <CreateMeetingForm
          people={(people.data ?? []).filter(
            (person) => person.id !== access.userId,
          )}
          peopleUnavailable={!canListPeople}
          onCreate={mutations.create.mutateAsync}
          onCancel={() => setCreating(false)}
          onCreated={(meeting) => {
            client.setQueryData([...keys.all, "detail", meeting.id], meeting);
            setCreatedId(meeting.id);
            setSelectedId(meeting.id);
            setPeriod(null);
            setCreating(false);
            setNotice("Meeting created. Open its details below to manage it.");
          }}
        />
      ) : null}
      {connection.state.status === "reconnecting" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Reconnecting…
        </p>
      ) : null}
      {connection.state.status === "denied" ? (
        <p role="status" className="text-muted-foreground text-sm">
          Live updates are unavailable. Refresh to see changes made elsewhere.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-muted-foreground text-sm">
          {notice}
        </p>
      ) : null}
      {meetings.length === 0 ? (
        <section
          aria-labelledby="meeting-list-title"
          className="rounded-lg border p-4 sm:p-6"
        >
          <h2
            id="meeting-list-title"
            tabIndex={-1}
            className="text-lg font-medium"
          >
            No meetings to show
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            When you are invited to a meeting, it will appear here and in your
            calendar.
          </p>
        </section>
      ) : (
        <div className={styles.workspace}>
          <section aria-label="Meetings" className={styles.meetingList}>
            <div
              role="group"
              aria-label="Meeting period"
              className={styles.periodTabs}
            >
              {(["upcoming", "past"] as const).map((value) => (
                <Button
                  key={value}
                  variant="ghost"
                  aria-pressed={activePeriod === value}
                  onClick={() => setPeriod(value)}
                >
                  {value === "upcoming" ? "Upcoming" : "Past"}
                </Button>
              ))}
            </div>
            <div className={styles.listItems}>
              {visibleMeetings.map((meeting) => (
                <Button
                  key={meeting.id}
                  data-meeting-item
                  variant="outline"
                  className={styles.meetingCard}
                  onClick={() => setSelectedId(meeting.id)}
                  aria-pressed={selected?.id === meeting.id}
                >
                  <span className={styles.dateTile} aria-hidden="true">
                    <strong>
                      {new Intl.DateTimeFormat(undefined, {
                        day: "numeric",
                      }).format(new Date(meeting.startAt))}
                    </strong>
                    <span>
                      {new Intl.DateTimeFormat(undefined, {
                        month: "short",
                      }).format(new Date(meeting.startAt))}
                    </span>
                  </span>
                  <span className={styles.cardContent}>
                    <span className={styles.cardTitleRow}>
                      <span className={styles.cardTitle}>{meeting.title}</span>
                      <span className={styles.cardStatus}>
                        {meetingPeriod(meeting) === "upcoming"
                          ? "Upcoming"
                          : MEETING_STATUS_LABELS[meeting.status]}
                      </span>
                    </span>
                    <span className={styles.cardTime}>
                      <span className="sr-only">
                        {formatWhen(meeting.startAt)}.{" "}
                      </span>
                      <span aria-hidden="true">
                        {formatTime(meeting.startAt)} –{" "}
                        {formatTime(meeting.endAt)}
                      </span>
                    </span>
                    <span className={styles.cardLocation}>
                      <MapPin aria-hidden="true" />
                      {meeting.location || MEETING_TYPE_LABELS[meeting.type]}
                    </span>
                  </span>
                  <ChevronRight
                    className={styles.cardChevron}
                    aria-hidden="true"
                  />
                </Button>
              ))}
              {visibleMeetings.length === 0 ? (
                <p className={styles.listEmpty}>
                  No {activePeriod} meetings in the loaded list.
                </p>
              ) : null}
            </div>
            {feed.hasNextPage ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={feed.isFetchingNextPage}
                onClick={() => void feed.fetchNextPage()}
              >
                {feed.isFetchingNextPage ? "Loading…" : "Load more meetings"}
              </Button>
            ) : null}
          </section>
          {selected ? (
            <div className="min-w-0">
              <MeetingDetail
                key={selected.id}
                meeting={selected}
                participant={participant ?? null}
                canRespond={canRespond}
                submitting={mutations.respond.isPending}
                onRespond={respond}
                isOrganizer={isOrganizer}
                canOrganize={canOrganize}
                canRemove={canManage}
                onRemove={async () => {
                  await mutations.remove.mutateAsync(selected.id);
                  setSelectedId(null);
                  if (createdId === selected.id) setCreatedId(null);
                  setNotice("Meeting removed.");
                }}
                onUpdate={async (input) => {
                  const updated = await mutations.update.mutateAsync({
                    id: selected.id,
                    input,
                  });
                  setNotice("Meeting updated.");
                  setPeriod(null);
                  return updated;
                }}
                savingMinutes={mutations.setMinutes.isPending}
                onSaveMinutes={saveMinutes}
                creatingActionItem={mutations.createActionItem.isPending}
                onAddActionItem={addActionItem}
                onEndMeeting={endMeeting}
                endingMeeting={mutations.transition.isPending}
              />
            </div>
          ) : (
            <section className={styles.emptyDetail}>
              <CalendarDays aria-hidden="true" />
              <h2>No {activePeriod} meetings to show</h2>
              <p>
                Choose another view
                {feed.hasNextPage ? " or load more meetings" : ""} to explore
                your schedule.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingDetail({
  meeting,
  participant,
  canRespond,
  submitting,
  onRespond,
  isOrganizer,
  canOrganize,
  canRemove,
  onRemove,
  onUpdate,
  savingMinutes,
  onSaveMinutes,
  creatingActionItem,
  onAddActionItem,
  onEndMeeting,
  endingMeeting,
}: {
  meeting: Meeting;
  participant: Meeting["participants"][number] | null;
  canRespond: boolean;
  submitting: boolean;
  onRespond: (response: "ACCEPTED" | "DECLINED") => void;
  isOrganizer: boolean;
  canOrganize: boolean;
  canRemove: boolean;
  onRemove: () => Promise<void>;
  onUpdate: (input: UpdateMeetingInput) => Promise<Meeting>;
  savingMinutes: boolean;
  onSaveMinutes: (minutes: string) => Promise<boolean>;
  creatingActionItem: boolean;
  onAddActionItem: (title: string) => Promise<boolean>;
  onEndMeeting: () => void;
  endingMeeting: boolean;
}) {
  const minutesId = useId();
  const actionItemId = useId();
  const participantsId = useId();
  const [minutesDraft, setMinutesDraft] = useState(meeting.minutes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const notesEditorRef = useRef<HTMLTextAreaElement>(null);
  const notesButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditingNotes = useRef(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [addingActionItem, setAddingActionItem] = useState(false);
  const [actionItemTitle, setActionItemTitle] = useState("");
  useEffect(() => {
    if (editingNotes) notesEditorRef.current?.focus();
    else if (wasEditingNotes.current) notesButtonRef.current?.focus();
    wasEditingNotes.current = editingNotes;
  }, [editingNotes]);
  // Mirrors the backend's own, deliberately looser gate on
  // `MeetingsService.getJitsiSession`: the organizer always qualifies, even
  // without the `meeting.update` grant `canOrganize` additionally requires.
  const canJoin =
    meeting.type !== "PHYSICAL" &&
    meeting.status === "SCHEDULED" &&
    (isOrganizer || participant !== null);

  async function submitActionItem() {
    const title = actionItemTitle.trim();
    if (!title) return;
    const created = await onAddActionItem(title);
    if (created) {
      setActionItemTitle("");
      setAddingActionItem(false);
    }
  }

  return (
    <section
      data-meeting-detail
      aria-labelledby="meeting-detail-title"
      className={styles.detail}
    >
      <div className={styles.detailHeader}>
        <span className={styles.detailIcon}>
          <CalendarDays aria-hidden="true" />
        </span>
        <div className={styles.detailHeading}>
          <div className={styles.titleRow}>
            <h2
              id="meeting-detail-title"
              className="text-lg font-medium wrap-anywhere"
            >
              {meeting.title}
            </h2>
            <Badge>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
          </div>
          <p className={styles.detailMeta}>
            <CalendarDays aria-hidden="true" />
            {formatWhen(meeting.startAt)} – {formatWhen(meeting.endAt)}
          </p>
          <p className={styles.detailMeta}>
            <MapPin aria-hidden="true" />
            {meeting.location || MEETING_TYPE_LABELS[meeting.type]}
          </p>
        </div>
        <div className={styles.detailActions}>
          {canOrganize ? (
            <EditMeetingDialog meeting={meeting} onSave={onUpdate} />
          ) : null}
          {canRemove ? (
            <RemoveMeetingDialog title={meeting.title} onRemove={onRemove} />
          ) : null}
        </div>
      </div>
      {meeting.description ? (
        <p className="mt-4 text-sm">{meeting.description}</p>
      ) : null}
      {meeting.agenda ? (
        <div className="mt-4">
          <h3 className="font-medium">Agenda</h3>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
            {meeting.agenda}
          </p>
        </div>
      ) : null}
      <dl className={styles.overview}>
        <div>
          <UserRound aria-hidden="true" />
          <div>
            <dt>Organizer</dt>
            <dd>{personName(meeting.organizer)}</dd>
            <dd className={styles.metaHint}>{meeting.organizer.email}</dd>
          </div>
        </div>
        <div>
          <Video aria-hidden="true" />
          <div>
            <dt>Format</dt>
            <dd>{MEETING_TYPE_LABELS[meeting.type]}</dd>
            <dd className={styles.metaHint}>
              {meeting.type === "PHYSICAL"
                ? "Meet in person"
                : "Video conference"}
            </dd>
          </div>
        </div>
        <div>
          <UsersRound aria-hidden="true" />
          <div>
            <dt>Participants</dt>
            <dd>
              {meeting.participants.length}{" "}
              {meeting.participants.length === 1
                ? "participant"
                : "participants"}
            </dd>
            <dd>
              <Button
                variant="link"
                className={styles.participantsLink}
                aria-expanded={showParticipants}
                aria-controls={participantsId}
                onClick={() => setShowParticipants((value) => !value)}
              >
                {showParticipants ? "Hide participants" : "View participants"}
                <ArrowRight aria-hidden="true" />
              </Button>
            </dd>
          </div>
        </div>
      </dl>
      {canJoin ? (
        <div className="mt-4">
          <JoinMeetingPanel
            meetingId={meeting.id}
            meetingTitle={meeting.title}
            canEndForEveryone={canOrganize}
            onEndForEveryone={onEndMeeting}
            endingForEveryone={endingMeeting}
          />
        </div>
      ) : null}
      <div
        id={participantsId}
        hidden={!showParticipants}
        className={styles.participants}
      >
        <h3 className="font-medium">Participants</h3>
        {meeting.participants.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No participants invited yet.
          </p>
        ) : null}
        <ul className="mt-2 space-y-1 text-sm">
          {meeting.participants.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>{personName(item)}</span>
              <span
                data-participant-response={item.response}
                className="text-muted-foreground"
              >
                {PARTICIPANT_RESPONSE_LABELS[item.response]}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <section
        className={styles.detailSection}
        aria-labelledby={`${minutesId}-title`}
      >
        <h3 id={`${minutesId}-title`}>
          <FileText aria-hidden="true" />
          Meeting notes
        </h3>
        {editingNotes && canOrganize ? (
          <div className="space-y-3">
            <Label htmlFor={minutesId} className="sr-only">
              Meeting notes
            </Label>
            <textarea
              ref={notesEditorRef}
              id={minutesId}
              rows={4}
              value={minutesDraft}
              placeholder="Write what was discussed, decisions made, and next steps."
              disabled={savingMinutes}
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(event) => setMinutesDraft(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={savingMinutes || minutesDraft.trim() === ""}
                aria-busy={savingMinutes}
                onClick={async () => {
                  if (await onSaveMinutes(minutesDraft)) setEditingNotes(false);
                }}
              >
                {savingMinutes ? "Saving…" : "Save meeting notes"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={savingMinutes}
                onClick={() => setEditingNotes(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.notesPreview}>
              {meeting.minutes || "No notes added yet."}
            </p>
            {canOrganize ? (
              <Button
                ref={notesButtonRef}
                size="sm"
                onClick={() => {
                  setMinutesDraft(meeting.minutes ?? "");
                  setEditingNotes(true);
                }}
              >
                <FileText aria-hidden="true" />
                {meeting.minutes ? "Edit meeting notes" : "Add meeting notes"}
              </Button>
            ) : null}
          </>
        )}
      </section>
      {canOrganize ? (
        <section
          className={styles.detailSection}
          aria-labelledby={`${actionItemId}-title`}
        >
          <h3 id={`${actionItemId}-title`}>
            <CheckCircle2 aria-hidden="true" />
            Action items
          </h3>
          {addingActionItem ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor={actionItemId}>Title</Label>
                <Input
                  id={actionItemId}
                  value={actionItemTitle}
                  disabled={creatingActionItem}
                  onChange={(event) => setActionItemTitle(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={creatingActionItem || actionItemTitle.trim() === ""}
                  aria-busy={creatingActionItem}
                  onClick={() => void submitActionItem()}
                >
                  {creatingActionItem ? "Adding…" : "Add"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={creatingActionItem}
                  onClick={() => {
                    setAddingActionItem(false);
                    setActionItemTitle("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.actionBar}>
              <p>Turn meeting decisions into follow-up tasks.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAddingActionItem(true)}
              >
                <Plus aria-hidden="true" />
                Add action item
              </Button>
            </div>
          )}
        </section>
      ) : null}
      {participant ? (
        <div className="mt-5">
          <p className="text-sm font-medium">
            Your response: {PARTICIPANT_RESPONSE_LABELS[participant.response]}
          </p>
          {canRespond ? (
            <div
              className="mt-3 flex gap-2"
              role="group"
              aria-label="Respond to meeting invitation"
            >
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void onRespond("ACCEPTED")}
              >
                Accept
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void onRespond("DECLINED")}
              >
                Decline
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Swaps a "Join meeting" button for the in-app Jitsi room, in place within
 * the detail panel (no new route/tab) - the backend independently gates the
 * session fetch to the organizer or an invited participant regardless of
 * why this button is shown. */
function JoinMeetingPanel({
  meetingId,
  meetingTitle,
  canEndForEveryone,
  onEndForEveryone,
  endingForEveryone,
}: {
  meetingId: string;
  meetingTitle: string;
  canEndForEveryone: boolean;
  onEndForEveryone: () => void;
  endingForEveryone: boolean;
}) {
  const [joined, setJoined] = useState(false);
  const session = useQuery({
    queryKey: ["meetings", meetingId, "jitsi-session"],
    queryFn: ({ signal }) => getJitsiSession(meetingId, signal),
    enabled: joined,
    retry: false,
  });

  if (!joined) {
    return (
      <Button type="button" onClick={() => setJoined(true)}>
        Join meeting
      </Button>
    );
  }
  if (session.isPending) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Preparing the meeting room…
      </p>
    );
  }
  if (session.isError) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-destructive text-sm">
          {session.error instanceof Error
            ? session.error.message
            : "Could not join the meeting. Try again."}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setJoined(false)}
        >
          Back
        </Button>
      </div>
    );
  }
  return (
    <JitsiMeetingRoom
      session={session.data}
      meetingTitle={meetingTitle}
      onLeave={() => setJoined(false)}
      canEndForEveryone={canEndForEveryone}
      onEndForEveryone={onEndForEveryone}
      endingForEveryone={endingForEveryone}
    />
  );
}
