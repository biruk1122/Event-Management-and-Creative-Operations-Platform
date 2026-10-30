# Meeting editing and removal

The meeting detail panel offers **Edit meeting** and **Remove meeting** to the
organizer with the existing `meeting.update` permission at organization or
department scope. Server-side organizer and permission checks remain authoritative.

Scheduled and completed meetings can be edited without changing their status.
The editor supports title, description, format, location, start/end times and the
existing optional reminder. It displays local browser times and sends UTC to the
API. Cancelled meetings remain read-only, but their organizer can remove them.

Removal requires explicit confirmation and permanently deletes the meeting for
everyone. Its participant invitations, associated notifications and calendar
entries are removed through existing foreign-key cascades. Action-item tasks
remain, with their meeting reference cleared through the existing `SET NULL`
relation. No database migration is needed.

The existing `PATCH /api/v1/meetings/{id}` accepts completed meetings as well as
scheduled meetings. The new `DELETE /api/v1/meetings/{id}` returns `204` and uses
the existing authenticated, CSRF-protected organizer update policy. Missing
meetings return `404`; unauthorized users cannot edit or delete them.

Successful edits refresh the organizer's meeting and calendar caches. Removal
also reconciles notification caches and clears selected/deep-linked meeting data.
Failed requests retain the meeting, confirmation and entered form values.
