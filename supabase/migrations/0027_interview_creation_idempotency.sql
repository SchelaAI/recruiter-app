-- ============================================================================
-- Schela — interview creation idempotency
-- Run after 0026_production_hardening.sql.
--
-- A browser retry/double-click must never create multiple interview rows and
-- therefore multiple inbox conversations for the same form submission.
-- Existing interviews are untouched because the new key is nullable.
-- ============================================================================

alter table interviews
  add column if not exists creation_request_id text;

create unique index if not exists interviews_org_creation_request_unique_idx
  on interviews(org_id, creation_request_id)
  where creation_request_id is not null;

comment on column interviews.creation_request_id is
  'One-time browser/server-action idempotency key. Multiple submits of the same rendered New Interview form resolve to one interview.';
