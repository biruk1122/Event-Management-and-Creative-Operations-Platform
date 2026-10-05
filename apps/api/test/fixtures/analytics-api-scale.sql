-- Same representative cardinalities as the EVE-171 read-model benchmark.
-- Run only in the isolated integration schema; preserve authenticated principals.
INSERT INTO departments (id, name)
SELECT md5('department' || g)::uuid, 'Department ' || g FROM generate_series(1, 100) g;
INSERT INTO users (id, email)
SELECT md5('user' || g)::uuid, 'employee' || g || '@scale.invalid' FROM generate_series(1, 1000) g;
INSERT INTO workspaces (id, kind)
SELECT md5('event-workspace' || g)::uuid, 'EVENT' FROM generate_series(1, 50) g;
INSERT INTO events (workspace_id, name, event_type, created_at)
SELECT md5('event-workspace' || g)::uuid, 'Event', 'CONCERT', '2026-09-01' FROM generate_series(1, 50) g;
INSERT INTO workspaces (id, kind)
SELECT md5('campaign-workspace' || g)::uuid, 'CAMPAIGN' FROM generate_series(1, 100) g;
INSERT INTO campaigns (id, workspace_id, name, campaign_type, created_at)
SELECT md5('campaign' || g)::uuid, md5('campaign-workspace' || g)::uuid, 'Campaign',
  (CASE WHEN g % 2 = 0 THEN 'MARKETING' ELSE 'PROMOTION' END)::campaign_type, '2026-09-01'
FROM generate_series(1, 100) g;
INSERT INTO workspaces (id, kind)
SELECT md5('project-workspace' || g)::uuid, 'PROJECT' FROM generate_series(1, 500) g;
INSERT INTO projects (workspace_id, name, created_at)
SELECT md5('project-workspace' || g)::uuid, 'Project', '2026-09-01' FROM generate_series(1, 500) g;
INSERT INTO workspaces (id, kind)
SELECT md5('production-workspace' || g)::uuid, 'PRODUCTION' FROM generate_series(1, 500) g;
INSERT INTO productions (workspace_id, name, production_type, created_at)
SELECT md5('production-workspace' || g)::uuid, 'Production', 'Video', '2026-09-01' FROM generate_series(1, 500) g;
INSERT INTO tasks (id, department_id, workspace_id, title, status, created_at, due_at)
SELECT md5('task' || g)::uuid, md5('department' || (g % 100 + 1))::uuid,
  md5('event-workspace' || (g % 50 + 1))::uuid, 'Task',
  (ARRAY['TODO','IN_PROGRESS','UNDER_REVIEW','BLOCKED','COMPLETED','CANCELLED'])[g % 6 + 1]::task_status,
  '2025-01-01'::timestamptz + (g % 730) * interval '1 day',
  CASE WHEN g % 7 = 0 THEN NULL ELSE '2026-09-15'::timestamptz END
FROM generate_series(1, 100000) g;
INSERT INTO task_assignments (task_id, user_id)
SELECT md5('task' || g)::uuid, md5('user' || (g % 1000 + 1))::uuid FROM generate_series(1, 100000) g;
INSERT INTO task_assignments (task_id, user_id)
SELECT md5('task' || g)::uuid, md5('user' || ((g + 1) % 1000 + 1))::uuid FROM generate_series(1, 100000) g;
INSERT INTO task_activities (task_id, type, details, occurred_at)
SELECT md5('task' || g)::uuid, 'STATUS_CHANGED', '{"to":"COMPLETED"}',
  '2025-01-01'::timestamptz + (g % 730) * interval '1 day' FROM generate_series(1, 100000) g;
INSERT INTO task_activities (task_id, type, details, occurred_at)
SELECT md5('task' || g)::uuid, 'PROGRESS_UPDATED', '{"progress":25}',
  '2025-01-01'::timestamptz + (g % 730) * interval '1 day' FROM generate_series(1, 100000) g;
INSERT INTO campaign_activities (id, campaign_id, name, status)
SELECT md5('activity' || g)::uuid, md5('campaign' || (g % 100 + 1))::uuid, 'Activity',
  (ARRAY['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'])[(g / 100) % 4 + 1]::campaign_activity_status
FROM generate_series(1, 20000) g;
INSERT INTO promotion_activities (campaign_activity_id, campaign_id, channel)
SELECT a.id, a.campaign_id, 'RADIO_PROMOTION' FROM campaign_activities a
  JOIN campaigns c ON c.id = a.campaign_id WHERE c.campaign_type = 'PROMOTION' AND a.name = 'Activity';
ANALYZE tasks; ANALYZE departments; ANALYZE users; ANALYZE workspaces;
ANALYZE events; ANALYZE campaigns; ANALYZE campaign_activities;
ANALYZE projects; ANALYZE productions;
ANALYZE promotion_activities; ANALYZE task_assignments; ANALYZE task_activities;
