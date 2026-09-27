# Schela in-app UI redesign

This release keeps the production core from the performance-optimized Phase 6 build and replaces the in-app workspace presentation with the supplied 8-screen Schela UI system.

## Redesigned routes

- `/dashboard`
- `/interviews`
- `/interviews/new`
- `/inbox` and `/inbox/[conversationId]`
- `/candidates`
- `/calendar` (new UI route, existing interview data only)
- `/settings/integrations`
- `/analytics` (new UI route, computed from existing production data)
- `/settings` (new UI shell over existing profile settings columns)
- `/settings/company`
- `/search` (workspace search used by the shared top bar)

## Preserved production core

No provider/webhook/AI/scheduling/cron implementation was changed. The following areas are untouched:

- Supabase client/server/admin helpers
- WhatsApp send/webhook/signature logic
- Resend outbound/inbound/webhook logic
- Groq decision/orchestration logic
- Calendly OAuth/client/webhook/workflow logic
- cron-job.org worker endpoint
- production security/rate limiting/observability
- all 26 SQL migrations
- auth/onboarding flows
- server actions for candidate creation, interview creation, manual replies, company management, and Calendly management

The new Settings screen only persists fields that already existed in `profiles` from migration `0002_settings.sql`; no new database migration is required.

## Data policy

Reference-screen demo names and numbers were not copied into the product. Every metric, row, calendar event, conversation, candidate score, integration state, and analytics value is rendered from the current organization’s existing database or current provider environment state.
