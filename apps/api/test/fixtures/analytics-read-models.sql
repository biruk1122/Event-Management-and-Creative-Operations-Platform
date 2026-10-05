-- EVE-171 query specimens, not a runtime authorization boundary.
-- Caller-resolved ID arrays are authorized sets, never raw client filters.

-- model: task_cohort
-- $1 from, $2 toExclusive, $3 asOf (UTC timestamptz). Management only.
SELECT count(*)::int AS total,
       count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
       count(*) FILTER (WHERE status <> 'COMPLETED')::int AS pending,
       count(*) FILTER (WHERE status <> 'COMPLETED' AND due_at < $3::timestamptz)::int AS overdue,
       round(100.0 * count(*) FILTER (WHERE status = 'COMPLETED') / nullif(count(*), 0))::int AS percent
FROM tasks
WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
  AND status <> 'CANCELLED';

-- model: department_cohort
-- $1 from, $2 toExclusive, $3 asOf, $4 authorized department UUIDs, $5 limit, $6 offset.
SELECT d.id, count(t.id)::int AS total,
       count(t.id) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
       count(t.id) FILTER (WHERE t.status <> 'COMPLETED')::int AS pending,
       count(t.id) FILTER (WHERE t.status <> 'COMPLETED' AND t.due_at < $3::timestamptz)::int AS overdue,
       round(100.0 * count(t.id) FILTER (WHERE t.status = 'COMPLETED') / nullif(count(t.id), 0))::int AS percent
FROM departments d
LEFT JOIN tasks t ON t.department_id = d.id AND t.status <> 'CANCELLED'
  AND t.created_at >= $1::timestamptz AND t.created_at < $2::timestamptz
WHERE d.id = ANY($4::uuid[])
GROUP BY d.id ORDER BY d.id LIMIT $5 OFFSET $6;

-- model: employee_cohort
-- $1 from, $2 toExclusive, $3 asOf, $4 authorized employee UUIDs, $5 limit, $6 offset.
SELECT u.id, count(t.id)::int AS total,
       count(t.id) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
       count(t.id) FILTER (WHERE t.status <> 'COMPLETED')::int AS pending,
       count(t.id) FILTER (WHERE t.status <> 'COMPLETED' AND t.due_at < $3::timestamptz)::int AS overdue,
       round(100.0 * count(t.id) FILTER (WHERE t.status = 'COMPLETED') / nullif(count(t.id), 0))::int AS percent
FROM users u
LEFT JOIN task_assignments a ON a.user_id = u.id
LEFT JOIN tasks t ON t.id = a.task_id AND t.status <> 'CANCELLED'
  AND t.created_at >= $1::timestamptz AND t.created_at < $2::timestamptz
WHERE u.id = ANY($4::uuid[])
GROUP BY u.id ORDER BY u.id LIMIT $5 OFFSET $6;

-- model: event_progress
-- $1 authorized event workspace UUIDs, $2 limit, $3 offset. Current all-time work.
SELECT w.id AS workspace_id, count(t.id)::int AS total,
       count(t.id) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
       round(100.0 * count(t.id) FILTER (WHERE t.status = 'COMPLETED') / nullif(count(t.id), 0))::int AS percent
FROM workspaces w
LEFT JOIN tasks t ON t.workspace_id = w.id AND t.status <> 'CANCELLED'
WHERE w.kind = 'EVENT' AND w.id = ANY($1::uuid[])
GROUP BY w.id ORDER BY w.id LIMIT $2 OFFSET $3;

-- model: campaign_progress
-- $1 authorized campaign UUIDs, $2 limit, $3 offset. Matches CAM-02 progress.
SELECT c.id, count(a.id)::int AS total,
       count(a.id) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
       round(100.0 * count(a.id) FILTER (WHERE a.status = 'COMPLETED') / nullif(count(a.id), 0))::int AS percent
FROM campaigns c
LEFT JOIN campaign_activities a ON a.campaign_id = c.id AND a.status <> 'CANCELLED'
WHERE c.id = ANY($1::uuid[])
GROUP BY c.id ORDER BY c.id LIMIT $2 OFFSET $3;

-- model: promotion_delivery
-- $1 authorized promotion campaign UUIDs. At most seven approved channel rows.
SELECT p.channel, count(*)::int AS total,
       count(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
       round(100.0 * count(*) FILTER (WHERE a.status = 'COMPLETED') / nullif(count(*), 0))::int AS percent
FROM promotion_activities p
JOIN campaign_activities a ON a.id = p.campaign_activity_id AND a.campaign_id = p.campaign_id
WHERE p.campaign_id = ANY($1::uuid[]) AND a.status <> 'CANCELLED'
GROUP BY p.channel ORDER BY p.channel;

-- model: monthly_creation
-- $1 inclusive UTC month start, $2 exclusive UTC month start, maximum twelve months.
WITH source AS (
  SELECT 'task' AS kind, created_at FROM tasks
    WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
  UNION ALL SELECT 'event', created_at FROM events
    WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
  UNION ALL SELECT 'project', created_at FROM projects
    WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
  UNION ALL SELECT 'production', created_at FROM productions
    WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
  UNION ALL SELECT 'campaign', created_at FROM campaigns
    WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
), counts AS (
  SELECT date_trunc('month', created_at AT TIME ZONE 'UTC') AS month,
         kind, count(*)::int AS total FROM source GROUP BY 1, 2
), months AS (
  SELECT generate_series($1::timestamptz AT TIME ZONE 'UTC',
                         ($2::timestamptz AT TIME ZONE 'UTC') - interval '1 month',
                         interval '1 month') AS month
)
SELECT to_char(m.month, 'YYYY-MM') AS month, k.kind, coalesce(c.total, 0)::int AS total
FROM months m CROSS JOIN (VALUES ('task'), ('event'), ('project'), ('production'), ('campaign')) k(kind)
LEFT JOIN counts c ON c.month = m.month AND c.kind = k.kind
ORDER BY m.month, k.kind;

-- model: monthly_completion
-- $1 inclusive UTC month start, $2 exclusive UTC month start, maximum twelve months.
WITH counts AS (
  SELECT date_trunc('month', occurred_at AT TIME ZONE 'UTC') AS month,
         count(DISTINCT task_id)::int AS completed
  FROM task_activities
  WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
    AND type = 'STATUS_CHANGED' AND details ->> 'to' = 'COMPLETED'
  GROUP BY 1
), months AS (
  SELECT generate_series($1::timestamptz AT TIME ZONE 'UTC',
                         ($2::timestamptz AT TIME ZONE 'UTC') - interval '1 month',
                         interval '1 month') AS month
)
SELECT to_char(m.month, 'YYYY-MM') AS month, coalesce(c.completed, 0)::int AS completed
FROM months m LEFT JOIN counts c ON c.month = m.month ORDER BY m.month;
