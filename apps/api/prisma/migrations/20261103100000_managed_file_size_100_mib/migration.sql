-- The managed file policy now permits objects from 1 byte through 100 MiB.
-- Declared and verified byte counts move together so verification cannot make
-- an accepted object exceed the policy.
ALTER TABLE "managed_files"
    DROP CONSTRAINT "managed_files_declared_size_bytes_in_range",
    DROP CONSTRAINT "managed_files_verified_size_bytes_in_range";

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_declared_size_bytes_in_range"
    CHECK ("declared_size_bytes" BETWEEN 1 AND 104857600),
    ADD CONSTRAINT "managed_files_verified_size_bytes_in_range"
    CHECK ("verified_size_bytes" IS NULL OR "verified_size_bytes" BETWEEN 1 AND 104857600);
