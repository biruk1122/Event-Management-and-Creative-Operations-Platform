# Product vocabulary and lifecycle catalog

## Purpose and authority

This catalog defines the canonical product language and approved lifecycle transitions for the
Event Management and Creative Operations Platform. Use these terms consistently in requirements,
architecture, Linear issues, API descriptions, and user interfaces.

The [Software Requirements Specification (SRS)](../requirements/software-requirements-specification.pdf)
remains the source of product requirements. This catalog reconciles its terminology without adding
business behavior. The [technical architecture](../architecture/technical-architecture.md) still
applies: records have concrete owners, module relationships are explicit, and an application must
not implement unchecked polymorphic references. The words **shall**, **should**, and **may** retain
their meanings from the SRS.

This catalog does not define database enums, API wire values, or UI labels. Those are approved as
part of the issue that implements the relevant module. An entry marked **open** is not permission
to invent behavior; the decision must be resolved before implementation depends on it.

## Naming rules

- Use the canonical term as the unqualified name in product and technical documentation.
- Qualify **Production Management** when necessary to distinguish the business module from a
  software production environment.
- A status describes lifecycle state. A type classifies a record, a priority orders attention, a
  category or view groups records, and progress is a measurement. Do not use them interchangeably.
- A record has one concrete owning module. Other modules refer to that record through explicit,
  authorized relationships rather than creating duplicate copies.
- The initial release serves one organization. Use **organization** as the canonical term;
  **company** in the SRS means the same organization and is not a separate aggregate.

## Canonical glossary

### Organization and access

| Canonical term                   | Definition and reconciled usage                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organization                     | The company operating the platform. It is the top-level business context for the initial single-organization release.                                                                      |
| User                             | An authenticated account with a profile, role assignments, and access to authorized platform capabilities. A user may correspond to an employee or talent manager.                         |
| Employee                         | An internal workforce member represented by a user and optionally assigned to a department and one or more teams. It is a business classification, not a separate login type.              |
| Role                             | A named bundle of permissions assigned to users for role-based access control.                                                                                                             |
| Permission                       | Authorization to perform a defined action on a defined platform resource or capability.                                                                                                    |
| Role-based access control (RBAC) | The authorization model in which effective access is determined from assigned roles and their permissions, with any approved scope rules.                                                  |
| Super Admin                      | The role with organization-wide configuration and access-management responsibility. This term replaces the SRS shorthand **Admin** when referring to unrestricted platform administration. |
| Management/Admin                 | The management role described by the SRS for organization-wide operational oversight. Whether it is distinct from Super Admin is open in [OD-01](#open-product-decisions).                 |
| Department Manager               | A manager whose operational access is scoped to an assigned department and its work.                                                                                                       |
| Team Member                      | The canonical role term for an employee who performs assigned work. The SRS terms **Employee** and **Team Member/Employee** refer to this role context.                                    |
| Talent Manager                   | The canonical role term for **Talent/Artist Manager**: a user responsible for talent records and assignments.                                                                              |
| Department                       | A stable organizational unit that groups employees, teams, and department-owned work.                                                                                                      |
| Team                             | A working group within the organization. A team may be associated with a department and assigned to events, projects, campaigns, or tasks.                                                 |
| Team membership                  | The explicit relationship connecting a user to a team, including any approved responsibility or membership metadata.                                                                       |
| Manager                          | A user assigned responsibility for a concrete entity, such as an event, project, campaign, team, or department. The unqualified term does not imply a global role.                         |

### Connected operational work

| Canonical term          | Definition and reconciled usage                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connected workspace     | The combined operational context for an event and its explicitly related projects, campaigns, tasks, meetings, calendar projections, discussions, files, notifications, and reports. It is a product concept, not a catch-all database entity. |
| Workspace relation      | An explicit, authorized association between records owned by different modules. It replaces the SRS suggestion of a generic `relatedEntityType`/`relatedEntityId` pair.                                                                        |
| Event                   | The central record for planning and executing a concert, conference, wedding, corporate event, festival, or another configured event type.                                                                                                     |
| Event type              | The classification of an event. The initial named values are Concert, Conference, Wedding, Corporate Event, Festival, and Other.                                                                                                               |
| Event workspace         | The event detail experience that presents the event and its explicitly related operational records. It does not take ownership away from their source modules.                                                                                 |
| Event organizer         | The internal or external party responsible for organizing an event. Its representation is open in [OD-16](#open-product-decisions).                                                                                                            |
| Event manager           | The user accountable for managing an event.                                                                                                                                                                                                    |
| Event team assignment   | The explicit relationship assigning one or more teams to an event.                                                                                                                                                                             |
| Event talent assignment | The explicit relationship assigning talent to an event, including role, schedule, contract status, and payment status when those fields are approved.                                                                                          |
| Project                 | A managed body of work with a responsible manager, team, dates, progress, and optional relationship to an event or campaign.                                                                                                                   |
| General project         | A project not governed by the Production Management workflow.                                                                                                                                                                                  |
| Production project      | A project governed by Production Management, such as sound, video, stage, lighting, or logistics work. It is a specialized project, not a duplicate of the general project concept.                                                            |
| Production type         | The classification of a production project: Sound, Video, Stage, Lighting, Logistics, or another configured type.                                                                                                                              |
| Campaign                | A coordinated promotion or marketing effort with goals, dates, ownership, budget, progress, and explicit relationships to its activities and optional event.                                                                                   |
| Promotion campaign      | A campaign focused on awareness, outreach, promotion channels, and promotion activities.                                                                                                                                                       |
| Marketing campaign      | A campaign focused on marketing goals, strategy, target audience, marketing activities, and budget.                                                                                                                                            |
| Marketing strategy      | The stated approach for achieving a marketing campaign's goals. It is content of the campaign, not a lifecycle state.                                                                                                                          |
| Campaign activity       | A planned unit of work owned by a campaign. A campaign activity may generate or relate to tasks but is not automatically a task.                                                                                                               |
| Promotion activity      | A campaign activity used by a promotion campaign.                                                                                                                                                                                              |
| Promotion channel       | A medium through which a promotion campaign is delivered.                                                                                                                                                                                      |
| Talent                  | A performer, artist, speaker, host, DJ, band, or another configured talent type that can be assigned to events. A talent record is not necessarily a platform user.                                                                            |
| Talent type             | The classification of talent. The initial named values are Artist, Speaker, Host, DJ, Band, and Other.                                                                                                                                         |
| Talent assignment       | The explicit relationship between talent and an event, including the engagement details approved for that assignment.                                                                                                                          |
| Product                 | A product promoted or marketed by a campaign when applicable. The SRS does not define Product as an independently managed module.                                                                                                              |
| Progress                | A measured indication of work completion. It is derived or entered according to an approved formula and is not a lifecycle status. See [OD-13](#open-product-decisions).                                                                       |
| Budget                  | A monetary allocation associated with an event, project, or campaign. Every amount must be interpreted with an approved currency. See [OD-14](#open-product-decisions).                                                                        |

### Tasks, communication, and collaboration

| Canonical term      | Definition and reconciled usage                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task                | An actionable unit of work with a title, description, assignee, due date, priority, status, and optional explicit relationships to operational records.  |
| Department work     | A task or other approved work item whose ownership or visibility is scoped to a department. It is not a separate task type unless later specified.       |
| Task assignment     | The relationship that makes a user responsible for a task. The initial requirement describes one assignee; multi-assignee behavior is not implied.       |
| Task priority       | The attention level Low, Medium, High, or Urgent. Priority is not task status.                                                                           |
| Task progress       | Completion measurement for a task, separate from its lifecycle status.                                                                                   |
| Task comment        | A discussion entry attached to a task and authored by a user.                                                                                            |
| Attachment          | A managed file linked through an explicit owning or association record to a message, task comment, report, or another approved parent.                   |
| Task review         | The review action performed while a task is Under Review. **Approved** and **Changes Requested** are review outcomes, not persistent task statuses.      |
| Discuss             | The product area for direct messages, group conversations, channels, meeting collaboration, replies, mentions, files, and activity history.              |
| Conversation        | A message container of type Direct, Group, or Channel.                                                                                                   |
| Direct conversation | A private conversation between explicitly participating users.                                                                                           |
| Group conversation  | A private multi-user conversation with explicit membership.                                                                                              |
| Channel             | A named conversation for an event, project, department, team, or approved general purpose.                                                               |
| Public channel      | A channel discoverable and joinable according to organization policy. Public does not mean accessible outside the organization.                          |
| Private channel     | A channel visible only to explicitly authorized members.                                                                                                 |
| Conversation member | A user explicitly participating in a conversation, including approved membership and read-state metadata.                                                |
| Message             | User-authored content within a conversation.                                                                                                             |
| Reply               | A message explicitly related to a parent message.                                                                                                        |
| Mention             | An explicit reference to a user in message content that may trigger a notification.                                                                      |
| Pinned message      | A message marked for prominent retrieval in its conversation. Pinning does not change message ownership.                                                 |
| Read state          | Per-user evidence of the latest message or time read in a conversation. It is distinct from message lifecycle state.                                     |
| Managed file        | File metadata governed by authenticated ownership, authorization, storage, and retention rules. Raw storage references are not public contracts.         |
| Activity history    | A user-facing chronological presentation of approved domain events and changes.                                                                          |
| Audit record        | Security- or governance-relevant evidence of an action, actor, time, and affected resource. It is not interchangeable with user-facing activity history. |
| Domain event        | A past-tense fact emitted by a module after a successful state change for approved asynchronous or real-time consumers.                                  |

### Meetings, calendar, and personal work

| Canonical term       | Definition and reconciled usage                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meeting              | A scheduled physical, online, or hybrid collaboration with an organizer, participants, time, agenda, location or link, reminders, and optional explicit relationships to operational records. |
| Meeting organizer    | The user responsible for creating and administering a meeting.                                                                                                                                |
| Meeting participant  | A user invited to a meeting and associated with an individual response.                                                                                                                       |
| Meeting type         | Physical, Online, or Hybrid. It classifies the meeting and is not a status.                                                                                                                   |
| Participant response | A participant's Pending, Accepted, or Declined answer to a meeting invitation. It is not the meeting's lifecycle status.                                                                      |
| Calendar             | The integrated time-based view of authorized events, tasks, meetings, projects, campaigns, reminders, and personal entries. It does not take ownership of source records.                     |
| Calendar entry       | A calendar-owned Personal or Reminder record, or a projection of an explicitly related source record. A projection must retain the source record's ownership and authorization.               |
| Calendar view        | Day, Week, Month, or Agenda presentation of calendar data.                                                                                                                                    |
| Personal schedule    | The authorized calendar view for one user. The SRS phrase **personal calendar** refers to this view and any calendar-owned personal entries.                                                  |
| Reminder             | A request to notify a user at a specified time about a calendar entry, meeting, to-do item, or another approved record. It is distinct from the delivered notification.                       |
| To-Do item           | A personal productivity record owned by one user. It may explicitly relate to work but is not a shared operational Task.                                                                      |
| To-Do type           | Personal, Work, Reminder, Quick Note, or Follow-Up. It classifies a to-do item and is not its lifecycle status.                                                                               |
| To-Do category       | A grouping or view such as My Day, Important, Upcoming, Work, Personal, or Completed. Completed reflects the underlying status; the others do not create lifecycle states.                    |
| To-Do suggestion     | A derived recommendation based on authorized work data. It does not create or alter a to-do item without an approved user or system action.                                                   |

### Notifications, reports, dashboard, and analytics

| Canonical term       | Definition and reconciled usage                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notification         | An in-app record informing a user of an approved event such as an assignment, deadline, mention, invitation, or status change.                                                                       |
| Notification type    | A classification of the triggering event, including assignment, deadline, mention, invitation, and status-change families.                                                                           |
| Notification channel | The delivery mechanism. In-app delivery is required; email is optional and must be separately approved and configured.                                                                               |
| Invitation           | A request for a user to participate in a meeting or another approved collaborative record. A meeting invitation uses the participant response lifecycle.                                             |
| Daily report         | A user's structured report of completed work, ongoing work, blockers or issues, and next-day plan.                                                                                                   |
| Weekly report        | A user's structured report of achievements, pending work, next-week plan, blockers, and optional rating or feedback.                                                                                 |
| Monthly report       | A user's structured report of summary, major achievements, challenges, lessons learned, and next-month plan.                                                                                         |
| Report               | The common concept covering daily, weekly, and monthly reports. The SRS includes an unspecified status field; its lifecycle remains open.                                                            |
| Dashboard            | A role-aware summary experience assembled from authorized source modules. It does not own the operational records it displays.                                                                       |
| Management dashboard | The organization-level dashboard for authorized management roles.                                                                                                                                    |
| Employee dashboard   | The personal and assigned-work dashboard for a team member.                                                                                                                                          |
| Analytics            | Derived measures and visualizations computed from authoritative source records using approved formulas.                                                                                              |
| Performance          | A derived assessment based on approved task, report, attendance, or other measures. No scoring formula is implied by the term.                                                                       |
| Upcoming             | A derived time-based classification for an incomplete item scheduled after the current time and within an approved horizon.                                                                          |
| Overdue              | A derived condition in which an incomplete item is past its due date or time. It is not a lifecycle status.                                                                                          |
| Pending              | A context-dependent state meaning that a required response or action has not occurred. Use it only with the owning concept, such as participant response, and never as an unqualified shared status. |

## Lifecycle catalog

Transitions not listed below are not approved. **Terminal** means no outgoing transition is defined
by the current product requirements; retention, correction, reopening, or deletion still require an
explicit decision. Types, priorities, categories, views, and derived conditions are deliberately
excluded from lifecycle states.

### Defined lifecycles

| Aggregate                    | Initial state | Allowed transitions                                                                                                                                                                                                          | Terminal states      | Notes                                                                                                                                                                                                 |
| ---------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User access                  | Active        | Active -> Inactive                                                                                                                                                                                                           | Inactive             | The SRS requires deactivation rather than deletion. Provisioning, suspension, reactivation, and session invalidation remain open in OD-01.                                                            |
| Event                        | Planning      | Planning -> Ready, In Progress, or Cancelled; Ready -> In Progress or Cancelled; In Progress -> Completed or Cancelled                                                                                                       | Completed, Cancelled | Ready is the named pre-execution state. Its entry criteria and whether it is mandatory remain open in OD-05.                                                                                          |
| Talent availability          | Available     | Available -> Assigned, Unavailable, or Inactive; Assigned -> Available, Unavailable, or Inactive; Unavailable -> Available or Inactive                                                                                       | Inactive             | This reconciles the named SRS statuses. Whether Assigned is stored or derived remains open in OD-04.                                                                                                  |
| Task                         | To Do         | To Do -> In Progress, Blocked, or Cancelled; In Progress -> Under Review, Blocked, or Cancelled; Under Review -> Completed when Approved, or In Progress when Changes Requested; Blocked -> To Do, In Progress, or Cancelled | Completed, Cancelled | Approved and Changes Requested are review outcomes. Overdue is derived from due date and nonterminal status.                                                                                          |
| Message                      | Created       | Created -> Edited or Deleted; Edited -> Edited or Deleted                                                                                                                                                                    | Deleted              | The SRS permits editing and deletion. Time limits, retention, and deletion semantics remain open in OD-08.                                                                                            |
| Meeting participant response | Pending       | Pending -> Accepted or Declined                                                                                                                                                                                              | Accepted, Declined   | Whether a participant may change a response is open in OD-06.                                                                                                                                         |
| Meeting                      | Scheduled     | Scheduled -> Completed                                                                                                                                                                                                       | Completed            | Scheduled is the necessary initial interpretation of a created future meeting. Cancellation, rescheduling, and no-show behavior remain open in OD-06 and must not be implemented from this row alone. |
| To-Do item                   | Not Started   | Not Started -> In Progress or Completed; In Progress -> Completed                                                                                                                                                            | Completed            | Reopening and deletion behavior remain open in OD-10.                                                                                                                                                 |
| To-Do reminder               | Pending       | Pending -> Sent                                                                                                                                                                                                              | Sent                 | The SRS explicitly names Pending and Sent. Delivery failure, retry, and cancellation remain open in OD-11.                                                                                            |
| Notification read state      | Unread        | Unread -> Read                                                                                                                                                                                                               | Read                 | Delivery state is separate. Mark-as-unread behavior and channel delivery remain open in OD-11.                                                                                                        |

### Status fields without an approved lifecycle

| Aggregate               | Current requirement                                                              | Required decision before implementation |
| ----------------------- | -------------------------------------------------------------------------------- | --------------------------------------- |
| General project         | The SRS requires a status field but names no values or transitions.              | OD-03                                   |
| Production project      | The SRS requires a status field but names no values or transitions.              | OD-03                                   |
| Promotion campaign      | The SRS requires status and progress but names no states or transitions.         | OD-03                                   |
| Marketing campaign      | The SRS requires status and progress but names no states or transitions.         | OD-03                                   |
| Event talent assignment | The SRS requires contract status and payment status but defines neither catalog. | OD-04                                   |
| Report                  | The SRS requires a status field but names no states or transitions.              | OD-07                                   |

Roles, permissions, departments, teams, conversations, channels, calendar projections, and managed
files have no SRS-defined status lifecycle. Archive, delete, deactivate, retention, and restoration
behavior for them must be approved in the applicable open decision before implementation.

## Open product decisions

| ID    | Decision required                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-01 | Define user provisioning, initial credential delivery, first-login behavior, the distinction between Super Admin and Management/Admin, reactivation or suspension, and whether deactivation immediately invalidates active sessions.    |
| OD-02 | Define archive, deactivate, delete, reassignment, and historical-reference behavior for roles, permissions, departments, teams, and memberships.                                                                                        |
| OD-03 | Define status values, initial states, allowed transitions, terminal states, and progress rules for general projects, production projects, promotion campaigns, and marketing campaigns.                                                 |
| OD-04 | Decide whether talent Assigned is stored or derived, how simultaneous assignments affect availability, and define event-talent assignment, contract, payment, conflict, cancellation, completion, and reactivation states.              |
| OD-05 | Define the criteria for Event Ready, whether every event must pass through it, who may make each transition, and whether completed or cancelled events can be reopened.                                                                 |
| OD-06 | Define meeting cancellation, rescheduling, completion authority, no-show handling, participant response changes, scheduling conflicts, and terminal behavior.                                                                           |
| OD-07 | Define report Draft, Submitted, review or approval behavior, correction and resubmission, rating and feedback authority, and terminal states.                                                                                           |
| OD-08 | Define message edit windows, deletion visibility, retention, attachment behavior, read-state semantics, and moderation or administrative deletion.                                                                                      |
| OD-09 | Decide which calendar entries are materialized versus projected, how changes reconcile with source records, visibility of personal entries, all-day behavior, and conflict handling.                                                    |
| OD-10 | Define to-do reopening, deletion, work visibility, personal-data privacy, and authorization for relationships to operational records.                                                                                                   |
| OD-11 | Define notification and reminder delivery states, retries, deduplication, scheduling, mark-as-unread behavior, user preferences, and optional email delivery. Resolve these with the delivery design before implementing notifications. |
| OD-12 | Define managed-file ownership, authorization, size and type limits, storage, retention, orphan handling, and secure deletion before implementing attachments.                                                                           |
| OD-13 | Define progress and performance formulas, authoritative inputs, rounding, update timing, and whether values are entered, derived, or both.                                                                                              |
| OD-14 | Define supported currencies, stored representation, display and rounding rules, and organization defaults for all budget and payment amounts.                                                                                           |
| OD-15 | Define organization and user display time zones, daylight-saving handling, all-day entries, date-only deadlines, and conversion rules while preserving UTC storage.                                                                     |
| OD-16 | Define whether organizers and locations are users, contacts, free text, or structured records, including external participants and online meeting links.                                                                                |
| OD-17 | Define who may configure values represented as Other for event, talent, and production types, plus rename, deactivate, and historical-reference behavior.                                                                               |

## SRS traceability

| SRS area                                      | Catalog coverage                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1-3 Introduction, overview, roles             | Purpose, naming rules, Organization and access                                                             |
| 4 Dashboard                                   | Dashboard and analytics                                                                                    |
| 5 User & Access Management                    | Organization and access; User access lifecycle; OD-01 and OD-02                                            |
| 6 Event Management                            | Connected operational work; Event lifecycle; OD-05, OD-14, OD-15, OD-16, OD-17                             |
| 7 Talent Management                           | Connected operational work; Talent lifecycle; OD-04 and OD-17                                              |
| 8 Production, Promotion, and Marketing        | Connected operational work; status-without-lifecycle table; OD-03, OD-13, OD-14, OD-17                     |
| 9 Project and Task Management                 | Connected operational work; Tasks and collaboration; Task lifecycle; OD-03 and OD-13                       |
| 10 Discuss and Meetings                       | Tasks and collaboration; Meetings and calendar; Message and meeting lifecycles; OD-06, OD-08, OD-12, OD-16 |
| 11 Calendar and To-Do                         | Meetings, calendar, and personal work; To-Do lifecycles; OD-09, OD-10, OD-11, OD-15                        |
| 12 Notifications                              | Notifications; Notification lifecycle; OD-11                                                               |
| 13 Reports and Analytics                      | Reports, dashboard, and analytics; status-without-lifecycle table; OD-07 and OD-13                         |
| 14 Data model and non-functional requirements | Naming rules; workspace relations; managed files, audit records, and domain events; OD-12, OD-14, OD-15    |
