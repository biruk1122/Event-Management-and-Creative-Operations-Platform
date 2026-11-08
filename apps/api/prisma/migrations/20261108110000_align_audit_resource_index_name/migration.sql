-- schema.prisma's unnamed AuditRecord index has Prisma's default name, but
-- 20260914160000 created it as "audit_records_resource_lookup_idx".
-- Databases built from migration history get the old name; the development
-- database already has the new one, so IF EXISTS makes this a no-op there.
ALTER INDEX IF EXISTS "audit_records_resource_lookup_idx"
  RENAME TO "audit_records_resource_type_resource_id_occurred_at_idx";
