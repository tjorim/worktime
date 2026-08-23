-- Purge one bounded batch of sync tombstones that are older than the supported
-- 90-day offline window. Run repeatedly until all returned counts are zero.
--
-- Child tables are processed before labels because their label_id foreign keys
-- intentionally do not cascade. Every predicate requires deleted_at to be both
-- non-null and older than the cutoff: active rows can never be selected. The
-- existing deleted_at indexes make each candidate scan bounded and indexable.
-- The scheduled SQL runner must log the single returned row; SQL errors must
-- fail the job so its normal failure alerting remains effective.
WITH
purged_tasks AS (
    DELETE FROM time_tracking_tasks
    WHERE id IN (
        SELECT id FROM time_tracking_tasks
        WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        ORDER BY deleted_at, id LIMIT 1000
    )
    RETURNING 1
),
purged_templates AS (
    DELETE FROM time_tracking_templates
    WHERE id IN (
        SELECT id FROM time_tracking_templates
        WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        ORDER BY deleted_at, id LIMIT 1000
    )
    RETURNING 1
),
purged_locations AS (
    DELETE FROM work_locations
    WHERE id IN (
        SELECT id FROM work_locations
        WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        ORDER BY deleted_at, id LIMIT 1000
    )
    RETURNING 1
),
purged_time_off AS (
    DELETE FROM time_off_entries
    WHERE id IN (
        SELECT id FROM time_off_entries
        WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        ORDER BY deleted_at, id LIMIT 1000
    )
    RETURNING 1
),
purged_gantt AS (
    DELETE FROM gantt_tasks
    WHERE id IN (
        SELECT id FROM gantt_tasks
        WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        ORDER BY deleted_at, id LIMIT 1000
    )
    RETURNING 1
),
purged_labels AS (
    DELETE FROM labels
    WHERE id IN (
        SELECT id FROM labels
        WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
          AND NOT EXISTS (SELECT 1 FROM time_tracking_tasks t WHERE t.label_id = labels.id)
          AND NOT EXISTS (SELECT 1 FROM time_tracking_templates t WHERE t.label_id = labels.id)
          AND NOT EXISTS (SELECT 1 FROM gantt_tasks g WHERE g.label_id = labels.id)
        ORDER BY deleted_at, id LIMIT 1000
    )
    RETURNING 1
)
SELECT
    (SELECT count(*) FROM purged_tasks) AS time_tracking_tasks,
    (SELECT count(*) FROM purged_templates) AS time_tracking_templates,
    (SELECT count(*) FROM purged_locations) AS work_locations,
    (SELECT count(*) FROM purged_time_off) AS time_off_entries,
    (SELECT count(*) FROM purged_gantt) AS gantt_tasks,
    (SELECT count(*) FROM purged_labels) AS labels;
