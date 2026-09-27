-- Schela: send one booking-link reminder after 24 hours to a candidate who
-- has already replied, but has not completed the Calendly booking.
-- No-reply WhatsApp candidates instead get the existing email fallback.

alter table public.interviews
  add column if not exists scheduling_reminder_sent_at timestamptz;

create index if not exists interviews_scheduling_reminder_due_idx
  on public.interviews (calendly_booking_link_sent_at)
  where scheduled_at is null
    and calendly_booking_link_sent_at is not null
    and scheduling_reminder_sent_at is null;

create or replace function public.claim_due_scheduling_reminders(p_limit integer default 5)
returns table (interview_id bigint, org_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select i.id
    from public.interviews i
    where i.scheduled_at is null
      and i.calendly_booking_link_sent_at <= now() - interval '24 hours'
      and i.scheduling_reminder_sent_at is null
      and i.ai_state not in ('completed', 'escalated')
      and i.last_candidate_reply_at is not null
      and (
        i.initial_outreach_sent_at is null
        or i.last_candidate_reply_at >= i.initial_outreach_sent_at
      )
      and exists (
        select 1 from public.calendly_booking_routes r
        where r.interview_id = i.id and r.org_id = i.org_id
          and r.used_at is null
      )
    order by i.calendly_booking_link_sent_at, i.id
    limit greatest(1, least(coalesce(p_limit, 5), 10))
    for update of i skip locked
  ), claimed as (
    update public.interviews i
    set scheduling_reminder_sent_at = now()
    from due where i.id = due.id
    returning i.id, i.org_id
  )
  select claimed.id, claimed.org_id from claimed;
end;
$$;

revoke all on function public.claim_due_scheduling_reminders(integer) from public;
grant execute on function public.claim_due_scheduling_reminders(integer) to service_role;

comment on column public.interviews.scheduling_reminder_sent_at is
  'One-time claim for a reminder after an engaged candidate received a Calendly link.';