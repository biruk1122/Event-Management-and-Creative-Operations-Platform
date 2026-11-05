"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, Plus } from "lucide-react";

import { AttachmentDropzone } from "@/components/ui/attachment-dropzone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkDialogContent as DialogContent } from "@/components/ui/work-dialog-content";
import {
  useCurrentAccess,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";

import {
  getTalent,
  listAssignableUsers,
  uploadTalentPhoto,
} from "../api/talent-gateway";
import {
  listTalentActivity,
  type TalentActivity,
} from "../api/talent-assignments-gateway";
import { talentKeys, useTalentMutations } from "../api/talent-queries";
import { canReadTalent, talentAbilities } from "../lib/talent-access";
import { talentTypeLabel } from "../lib/talent-types";
import { BackButton } from "@/features/navigation/components/back-button";
import { TalentAssignmentsPanel } from "./talent-assignments-panel";
import { TalentHistoryTimeline } from "./talent-history-timeline";
import { TalentProfileBody } from "./talent-profile-body";
import { TalentProfileOverview } from "./talent-profile-overview";

const LOGIN_HREF = "/login?next=%2Ftalent";

export function TalentProfilePage({
  talentId,
  assignOnLoad = false,
}: {
  talentId: string;
  /** Open the Assign talent dialog on arrival, from the directory's Assign button. */
  assignOnLoad?: boolean;
}) {
  const access = useCurrentAccess();

  if (access.isPending) {
    return <p role="status">Checking permissions…</p>;
  }

  if (access.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>{access.error.message}</p>
      </div>
    );
  }

  if (access.data === null) {
    return (
      <div role="alert" className="space-y-2">
        <p>Your session expired. Sign in again to continue.</p>
        <Link
          href={LOGIN_HREF}
          className="text-sm underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!canReadTalent(access.data)) {
    return <p role="alert">You do not have access to this area.</p>;
  }

  return (
    <ProfileContent
      key={`${access.data.userId}-${talentId}`}
      access={access.data}
      talentId={talentId}
      assignOnLoad={assignOnLoad}
    />
  );
}

function ProfileContent({
  access,
  talentId,
  assignOnLoad,
}: {
  access: CurrentAccess;
  talentId: string;
  assignOnLoad: boolean;
}) {
  const client = useQueryClient();
  const keys = talentKeys(access);
  const abilities = talentAbilities(access);
  const mutations = useTalentMutations(access);

  const [announcement, setAnnouncement] = useState("");
  const [assignOpen, setAssignOpen] = useState(assignOnLoad);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const detail = useQuery({
    queryKey: keys.detail(talentId),
    queryFn: ({ signal }) => getTalent(talentId, signal),
    retry: false,
  });
  const talent = detail.data ?? null;
  const talentName = talent?.fullName ?? "This talent";

  const users = useQuery({
    queryKey: keys.users,
    queryFn: ({ signal }) => listAssignableUsers(signal),
    retry: false,
    staleTime: 60_000,
    enabled: abilities.canUpdate && editOpen,
  });

  const activity = useQuery({
    queryKey: keys.activity(talentId),
    queryFn: ({ signal }) => listTalentActivity(talentId, signal),
    retry: false,
  });

  function refresh(message?: string) {
    if (message) setAnnouncement(message);
    void client.invalidateQueries({ queryKey: keys.detail(talentId) });
    void client.invalidateQueries({ queryKey: keys.activity(talentId) });
  }

  async function archive() {
    setArchiveError(null);
    const outcome = await mutations.transition.mutateAsync({
      id: talentId,
      availability: "INACTIVE",
    });
    if (outcome.status === "success") {
      setArchiveOpen(false);
      refresh("Talent archived.");
      return;
    }
    setArchiveError(
      outcome.status === "has_active_assignments"
        ? "This talent still has active assignments. Complete or cancel them before archiving."
        : outcome.status === "permission_denied"
          ? "You do not have permission to archive talent."
          : "We could not archive this talent. Try again.",
    );
  }

  async function attachPhoto(files: File[]) {
    const [file] = files;
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await uploadTalentPhoto(talentId, file);
      refresh("Profile photo updated.");
    } catch {
      setPhotoError(
        "The photo could not be uploaded. Use a PNG, JPG or WEBP image and try again.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  if (detail.isPending) {
    return (
      <p role="status" className="text-primary/70 py-10 text-sm">
        Loading talent…
      </p>
    );
  }

  if (detail.isError || !talent) {
    return (
      <div role="alert" className="space-y-2">
        <p>We could not load this talent. Go back to the list and try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <BackButton fallbackHref="/talent" />
      <nav aria-label="Breadcrumb" className="text-primary/70 text-sm">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/talent" className="hover:text-foreground">
              Talent
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>{talentTypeLabel(talent.type)} profile</li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          {talent.fullName}
        </h1>
        <div className="flex flex-wrap gap-2">
          {abilities.canAssign ? (
            <Button type="button" onClick={() => setAssignOpen(true)}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              Assign talent
            </Button>
          ) : null}
          {abilities.canUpdate ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <Pencil aria-hidden="true" data-icon="inline-start" />
              Edit profile
            </Button>
          ) : null}
          {abilities.canTransition && talent.availability !== "INACTIVE" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setArchiveError(null);
                setArchiveOpen(true);
              }}
            >
              <Archive aria-hidden="true" data-icon="inline-start" />
              Archive talent
            </Button>
          ) : null}
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <TalentProfileOverview talent={talent} />

      <TalentAssignmentsPanel
        access={access}
        talentId={talentId}
        talentName={talentName}
        canAssign={abilities.canAssign}
        assignOpen={assignOpen}
        onAssignOpenChange={setAssignOpen}
        onChanged={() => refresh("Assignments updated.")}
      />

      <section
        aria-labelledby="talent-history-heading"
        className="border-primary/15 bg-card space-y-4 rounded-2xl border p-6 shadow-sm"
      >
        <h2 id="talent-history-heading" className="text-base font-semibold">
          History
        </h2>
        {activity.isPending ? (
          <p role="status" className="text-primary/70 text-sm">
            Loading history…
          </p>
        ) : activity.isError ? (
          <p role="alert" className="text-destructive text-sm">
            We could not load the history.
          </p>
        ) : (
          <TalentHistoryTimeline items={activity.data as TalentActivity[]} />
        )}
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="[&_section]:border-primary/15! [&_section]:bg-card! max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit {talentName}</DialogTitle>
            <DialogDescription>
              Details, status, manager, schedule, social links and photo.
            </DialogDescription>
          </DialogHeader>

          {abilities.canUpdate ? (
            <section
              aria-labelledby="talent-photo-heading"
              className="space-y-3"
            >
              <h3 id="talent-photo-heading" className="text-sm font-semibold">
                Profile photo
              </h3>
              <AttachmentDropzone
                inputLabel="Choose a profile photo"
                disabled={photoBusy}
                multiple={false}
                accept="image/png,image/jpeg,image/webp"
                hint="PNG, JPG or WEBP"
                onFiles={(files) => void attachPhoto(files)}
              />
              {photoBusy ? (
                <p role="status" className="text-primary/70 text-sm">
                  Uploading photo…
                </p>
              ) : null}
              {photoError ? (
                <p role="alert" className="text-destructive text-sm">
                  {photoError}
                </p>
              ) : null}
            </section>
          ) : null}

          <TalentProfileBody
            talentId={talentId}
            users={users.data ?? []}
            abilities={abilities}
            onUpdate={(id, values) =>
              mutations.update.mutateAsync({ id, values })
            }
            onTransition={(id, availability) =>
              mutations.transition.mutateAsync({ id, availability })
            }
            onSetManager={(id, managerId) =>
              mutations.setManager.mutateAsync({ id, managerId })
            }
            onAddSocialLink={(talentIdArg, values) =>
              mutations.addSocialLink.mutateAsync({
                talentId: talentIdArg,
                values,
              })
            }
            onRemoveSocialLink={(talentIdArg, socialLinkId) =>
              mutations.removeSocialLink.mutateAsync({
                talentId: talentIdArg,
                socialLinkId,
              })
            }
            onAddSchedule={(talentIdArg, values) =>
              mutations.addSchedule.mutateAsync({
                talentId: talentIdArg,
                values,
              })
            }
            onUpdateSchedule={(talentIdArg, scheduleId, values) =>
              mutations.updateSchedule.mutateAsync({
                talentId: talentIdArg,
                scheduleId,
                values,
              })
            }
            onRemoveSchedule={(talentIdArg, scheduleId) =>
              mutations.removeSchedule.mutateAsync({
                talentId: talentIdArg,
                scheduleId,
              })
            }
            onChanged={() => refresh("Talent details saved.")}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {talentName}?</DialogTitle>
            <DialogDescription>
              Archived talent are marked inactive. Their assignment history is
              kept. Archiving is blocked while they have active assignments.
            </DialogDescription>
          </DialogHeader>
          {archiveError ? (
            <p role="alert" className="text-destructive text-sm">
              {archiveError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setArchiveOpen(false)}
            >
              Keep talent active
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void archive()}
            >
              Archive talent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
