-- ============================================================================
-- Schela — consolidated migration (covers 0012 → 0018)
--
-- Run this ONE file if you've already applied 0001–0011. It contains every
-- change from 0012 through 0018 combined, in dependency order.
--
-- SAFE TO RE-RUN. Every statement is guarded, so running it twice (or running
-- it after having already applied some of the individual files) is a no-op
-- rather than an error. Redundant intermediate steps are collapsed — e.g. the
-- interviews.format constraint is written once in its final form rather than
-- being set in 0012 and immediately widened again in 0015.
--
-- What's in here:
--   0012 — allow 'withdrawn' ai_state; allow every interview format the
--          wizard actually offers (the UI offered options the DB rejected)
--   0013 — AI reasoning/ambiguities/escalation_reason audit columns
--   0014 — remove the Google Calendar integration rows
--   0015 — allow 'Calendly' as an interview format
--   0016 — fix globally-unique primary keys on candidates + conversations,
--          and add messages.org_id (the big one — see notes below)
--   0017 — interviews.calendly_event_uri, for real Calendly cancel/reschedule
--   0018 — interviews.followup_email_sent_at, for the 24h no-reply email
--          follow-up
-- ============================================================================


-- ============================================================================
-- 0012 + 0015 — CHECK constraints that rejected values the app produces
-- ============================================================================

alter table candidates drop constraint if exists candidates_ai_state_check;
alter table candidates add constraint candidates_ai_state_check
  check (ai_state in (
    'sending_invitation','waiting_reply','scheduling','rescheduling',
    'reminder_sent','calendar_updated','escalated','completed','withdrawn'
  ));

alter table interviews drop constraint if exists interviews_ai_state_check;
alter table interviews add constraint interviews_ai_state_check
  check (ai_state in (
    'sending_invitation','waiting_reply','scheduling','rescheduling',
    'reminder_sent','calendar_updated','escalated','completed','withdrawn'
  ));

-- Final form, including both 'In-person' (0012) and 'Calendly' (0015).
alter table interviews drop constraint if exists interviews_format_check;
alter table interviews add constraint interviews_format_check
  check (format in ('Google Meet', 'Zoom', 'Calendly', 'Phone', 'In-person'));

-- 0010's notification type, repeated here so this file also works on a
-- database that skipped it.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('escalated', 'calendar_updated', 'rescheduling', 'reminder_sent', 'withdrawn'));


-- ============================================================================
-- 0013 — AI decision audit trail
-- ============================================================================

alter table ai_decisions
  add column if not exists reasoning text,
  add column if not exists ambiguities text[],
  add column if not exists escalation_reason text;

alter table conversations
  add column if not exists escalation_reason text;


-- ============================================================================
-- 0014 — remove Google Calendar as an integration
-- ============================================================================

delete from integrations where id = 'gcal';


-- ============================================================================
-- 0016 — fix globally-unique primary keys (the important one)
--
-- candidates.id was a TEXT key generated as initials + 2 random digits
-- ("MD61") and declared `primary key` on its own — so that ~90-value space
-- was shared across EVERY org in the deployment, not per-org.
-- conversations.id derives from it ("c-md61") and had the same flaw.
--
-- The silent failure this caused: the inbound webhooks upsert conversations
-- with onConflict "id", so a candidate's reply could attach to a conversation
-- row owned by a DIFFERENT org's candidate holding the same generated id.
-- The message stored, the webhook returned 200, and it never appeared in the
-- recruiter's thread.
-- ============================================================================

-- messages needs its own org_id: without it, a foreign key to a composite
-- (id, org_id) key would require a unique index on conversations(id) alone —
-- exactly the global-uniqueness constraint being removed here.
alter table messages add column if not exists org_id uuid references organizations(id) on delete cascade;

update messages m
set org_id = c.org_id
from conversations c
where m.conversation_id = c.id and m.org_id is null;

-- Any message whose conversation no longer exists can't be attributed to an
-- org and is unreachable in the UI regardless.
delete from messages where org_id is null;

alter table messages alter column org_id set not null;
create index if not exists messages_org_id_idx on messages(org_id);

-- Drop FKs that reference the keys being replaced.
alter table interviews    drop constraint if exists interviews_candidate_id_fkey;
alter table conversations drop constraint if exists conversations_candidate_id_fkey;
alter table messages      drop constraint if exists messages_conversation_id_fkey;
alter table action_items  drop constraint if exists action_items_candidate_id_fkey;
alter table action_items  drop constraint if exists action_items_conversation_id_fkey;
alter table notifications drop constraint if exists notifications_link_candidate_id_fkey;
alter table notifications drop constraint if exists notifications_link_conversation_id_fkey;
alter table ai_decisions  drop constraint if exists ai_decisions_conversation_id_fkey;

-- Swap each primary key to (id, org_id), only if it isn't already composite.
do $$
begin
  if (
    select count(*) from information_schema.key_column_usage
    where table_name = 'candidates' and constraint_name = 'candidates_pkey'
  ) < 2 then
    alter table candidates drop constraint candidates_pkey;
    alter table candidates add primary key (id, org_id);
  end if;
end $$;

do $$
begin
  if (
    select count(*) from information_schema.key_column_usage
    where table_name = 'conversations' and constraint_name = 'conversations_pkey'
  ) < 2 then
    alter table conversations drop constraint conversations_pkey;
    alter table conversations add primary key (id, org_id);
  end if;
end $$;

-- Recreate every FK against (id, org_id). Each referencing table already
-- carries org_id, so including it additionally makes it impossible at the
-- database level for a row to reference another org's candidate/conversation.
alter table interviews
  add constraint interviews_candidate_id_fkey
  foreign key (candidate_id, org_id) references candidates(id, org_id) on delete cascade;

alter table conversations
  add constraint conversations_candidate_id_fkey
  foreign key (candidate_id, org_id) references candidates(id, org_id) on delete cascade;

alter table messages
  add constraint messages_conversation_id_fkey
  foreign key (conversation_id, org_id) references conversations(id, org_id) on delete cascade;

alter table action_items
  add constraint action_items_candidate_id_fkey
  foreign key (candidate_id, org_id) references candidates(id, org_id) on delete cascade;

alter table action_items
  add constraint action_items_conversation_id_fkey
  foreign key (conversation_id, org_id) references conversations(id, org_id) on delete cascade;

alter table notifications
  add constraint notifications_link_candidate_id_fkey
  foreign key (link_candidate_id, org_id) references candidates(id, org_id) on delete set null;

alter table notifications
  add constraint notifications_link_conversation_id_fkey
  foreign key (link_conversation_id, org_id) references conversations(id, org_id) on delete set null;

alter table ai_decisions
  add constraint ai_decisions_conversation_id_fkey
  foreign key (conversation_id, org_id) references conversations(id, org_id) on delete set null;

-- messages RLS can now filter on org_id directly rather than subquerying
-- conversations on every row.
drop policy if exists "org members can manage their messages" on messages;
create policy "org members can manage their messages" on messages
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());


-- ============================================================================
-- 0017 — real Calendly cancellation + reschedule
-- ============================================================================

alter table interviews
  add column if not exists calendly_event_uri text;

comment on column interviews.calendly_event_uri is
  'The Calendly scheduled_event URI once a candidate books through a Calendly link — needed to actually cancel/reschedule the booking via Calendly''s API, not just update Schela''s own row.';


-- ============================================================================
-- 0018 — 24-hour no-reply email follow-up
-- ============================================================================

alter table interviews
  add column if not exists followup_email_sent_at timestamptz;

comment on column interviews.followup_email_sent_at is
  'When the cross-channel (email) follow-up was sent after 24h of no candidate reply. Null = not yet sent.';

create index if not exists interviews_followup_scan_idx
  on interviews(org_id, ai_state, followup_email_sent_at);
