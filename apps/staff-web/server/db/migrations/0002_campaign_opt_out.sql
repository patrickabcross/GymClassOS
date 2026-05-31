-- ============================================================
-- P260531-n7i: Campaign opt-out marker — additive migration
-- ============================================================
-- CLAUDE.md no-breaking-DB-changes guard: strictly additive.
-- NO DROP, NO RENAME, NO destructive ALTER.
-- Adds a nullable opted_out_at column to whatsapp_opt_in so
-- the worker optInGate can refuse opted-out members while
-- keeping the same table structure (one row per member, PK=member_id).
-- WA-09/WA-10: opt-out marker (additive, nullable).

ALTER TABLE "whatsapp_opt_in" ADD COLUMN IF NOT EXISTS "opted_out_at" text;
