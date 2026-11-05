import type { ReactNode } from "react";

import { TalentAvailabilityBadge } from "./availability-badges";
import { TalentAvatar } from "./talent-avatar";
import {
  availabilityLabel,
  personName,
  talentTypeLabel,
  type Talent,
  type TalentSchedule,
} from "../lib/talent-types";

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "30 min", "1 hour", "1 h 30 min" for a schedule entry's window. */
function durationLabel(
  item: Pick<TalentSchedule, "startAt" | "endAt">,
): string {
  const minutes = Math.round(
    (Date.parse(item.endAt) - Date.parse(item.startAt)) / 60_000,
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hours} h ${rest} min`;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-primary/70 text-xs font-medium">{label}</dt>
      <dd className="text-sm font-medium wrap-break-word">{children}</dd>
    </div>
  );
}

/**
 * The read-only profile overview: identity, biography and contact details,
 * and the scheduled availability. Editing lives in the Edit profile dialog.
 */
export function TalentProfileOverview({ talent }: { talent: Talent }) {
  const schedule = [...talent.schedules].sort((a, b) =>
    a.startAt.localeCompare(b.startAt),
  );

  return (
    <div className="space-y-6">
      <section
        aria-label="Talent summary"
        data-talent-summary
        className="border-primary/15 bg-card relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-8"
      >
        <div
          aria-hidden="true"
          className="from-primary/10 pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-linear-to-r to-transparent"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <TalentAvatar
            fullName={talent.fullName}
            profileImageUrl={talent.profileImageUrl}
            size="hero"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-primary/70 text-xs font-semibold tracking-wider uppercase">
              {talentTypeLabel(talent.type)}
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">
              {talent.fullName}
            </h2>
            {talent.biography ? (
              <p className="text-primary/70 line-clamp-2 max-w-2xl text-sm">
                {talent.biography}
              </p>
            ) : null}
          </div>
          <div className="relative self-start sm:self-center">
            <TalentAvailabilityBadge availability={talent.availability} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="talent-biography-heading"
          className="border-primary/15 bg-card space-y-6 rounded-2xl border p-6 shadow-sm"
        >
          <h2 id="talent-biography-heading" className="text-base font-semibold">
            Biography
          </h2>
          <p className="text-primary/70 text-sm leading-relaxed whitespace-pre-line">
            {talent.biography ?? "No biography yet."}
          </p>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Detail label="Email">
              {talent.email ? (
                <a
                  href={`mailto:${talent.email}`}
                  className="underline underline-offset-4"
                >
                  {talent.email}
                </a>
              ) : (
                "Not added"
              )}
            </Detail>
            <Detail label="Phone">{talent.phone ?? "Not added"}</Detail>
            <Detail label="Manager">
              {talent.manager ? personName(talent.manager) : "No manager"}
            </Detail>
            <Detail label="Availability">
              {availabilityLabel(talent.availability)}
            </Detail>
            <Detail label="Status">
              {talent.availability === "INACTIVE" ? "Inactive" : "Active"}
            </Detail>
            <Detail label="Social profiles">
              {talent.socialLinks.length > 0 ? (
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {talent.socialLinks.map((link) => (
                    <li key={link.id}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline underline-offset-4"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                "None added"
              )}
            </Detail>
          </dl>
        </section>

        <section
          aria-labelledby="talent-schedule-heading"
          className="border-primary/15 bg-card rounded-2xl border p-6 shadow-sm"
        >
          <h2 id="talent-schedule-heading" className="text-base font-semibold">
            Availability
          </h2>
          {schedule.length === 0 ? (
            <p className="text-primary/70 mt-4 text-sm">
              No scheduled time yet. Add entries from Edit profile.
            </p>
          ) : (
            <ul className="divide-primary/15 mt-4 divide-y">
              {schedule.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="w-20 shrink-0">
                    <p className="text-sm font-semibold tabular-nums">
                      {TIME.format(new Date(item.startAt))}
                    </p>
                    <p className="text-primary/70 text-xs">
                      {durationLabel(item)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-primary/70 text-xs">
                      {DAY.format(new Date(item.startAt))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
