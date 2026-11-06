-- Read-only preview of the event schedule correction. Run BEFORE applying
-- migration 20261106120000_event_schedule_timezone_correction. Before that
-- migration every event is legacy, so every row listed here is shifted by -3 hours.
-- Nothing is modified.

-- 1. How many events are affected, and how many have any schedule value.
SELECT
    count(*) AS events_total,
    count(*) FILTER (
        WHERE start_at IS NOT NULL OR end_at IS NOT NULL OR reminder_at IS NOT NULL
    ) AS events_with_schedule
FROM events;

-- 2. Before and after values for each affected event, plus the timestamps the
--    migration must leave alone.
SELECT
    id,
    name,
    start_at AS start_before,
    start_at - INTERVAL '3 hours' AS start_after,
    end_at AS end_before,
    end_at - INTERVAL '3 hours' AS end_after,
    reminder_at AS reminder_before,
    reminder_at - INTERVAL '3 hours' AS reminder_after,
    created_at,
    updated_at
FROM events
WHERE start_at IS NOT NULL OR end_at IS NOT NULL OR reminder_at IS NOT NULL
ORDER BY created_at, id;
