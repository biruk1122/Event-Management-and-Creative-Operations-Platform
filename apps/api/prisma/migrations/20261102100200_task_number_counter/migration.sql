-- Replace the task_number sequence with a counter row. Prisma cannot model a
-- database sequence, so `prisma migrate dev` would otherwise generate a drop.
-- The counter is a real table Prisma models, incremented by a function that
-- every task insert calls. Concurrent creates serialize on the single counter
-- row, so numbers stay unique; a rolled-back create releases its number.

CREATE TABLE "task_number_counters" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_value" INTEGER NOT NULL,
    CONSTRAINT "task_number_counters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_number_counters_single_row" CHECK ("id" = 1),
    CONSTRAINT "task_number_counters_last_value_non_negative" CHECK ("last_value" >= 0)
);

-- Resume after the highest number already assigned by the previous migration.
INSERT INTO "task_number_counters" ("id", "last_value")
VALUES (1, COALESCE((SELECT MAX("task_number") FROM "tasks"), 0));

CREATE FUNCTION "next_task_number"() RETURNS INTEGER
LANGUAGE sql
VOLATILE
AS $$
    UPDATE "task_number_counters"
    SET "last_value" = "last_value" + 1
    WHERE "id" = 1
    RETURNING "last_value";
$$;

-- Repoint the column default first: the sequence cannot be dropped while the
-- default still depends on it.
ALTER TABLE "tasks" ALTER COLUMN "task_number" SET DEFAULT next_task_number();
DROP SEQUENCE "task_number_seq";
