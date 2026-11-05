-- Talent assignment notifications link to the talent they concern. The column is
-- nullable, so every existing notification keeps its current meaning. Deleting a
-- talent is blocked while it has history (see 20261103120200), so this cascade
-- only ever removes notifications for a talent that was already removed.

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "talent_id" UUID;

-- CreateIndex
CREATE INDEX "notifications_talent_id_idx" ON "notifications"("talent_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
