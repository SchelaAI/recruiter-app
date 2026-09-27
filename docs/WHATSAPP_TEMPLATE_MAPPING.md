# Schela WhatsApp template mapping (27 September 2026)

The four templates below were supplied as **Active / Utility / English** screenshots and are wired into Schela. They all use Meta named body parameters. No per-template access token is required: every template uses the existing `WHATSAPP_ACCESS_TOKEN`.

## Required Meta URL buttons

The body variables are confirmed by the screenshots. For Schela's interview-specific routing, configure the approved URL buttons with these dynamic bases:

- `interview_invitation` → `https://recruiter.schela.app/book/{{1}}`
- `scheduling_reminder` → `https://recruiter.schela.app/book/{{1}}`
- `availability_request` → `https://recruiter.schela.app/book/{{1}}`
- `interview_scheduled` → `https://recruiter.schela.app/join/{{1}}`

Schela sends only an opaque route token as the button suffix. The public `/book/[token]` endpoint redirects to the exact one-use Calendly URL; `/join/[token]` redirects to the saved meeting URL only around the scheduled interview window.

## 1. `interview_invitation`

Body parameters:

- `candidate_name`
- `company_name`
- `job_title`

Body:

```text
Hi {{candidate_name}}, this is Schela, the AI Hiring Coordinator for {{company_name}}. We'd like to schedule your interview for the {{job_title}} position. Please choose a convenient time using the link below.
```

Button: **Choose a time**

Runtime event: recruiter creates a WhatsApp + Calendly interview. Schela creates the one-use Calendly link first, then sends this template.

## 2. `scheduling_reminder`

Body parameters:

- `candidate_name`
- `job_title`

Body:

```text
Hi {{candidate_name}}, we're still waiting for you to select an interview time for the {{job_title}} position. Please choose a convenient slot using the link below.
```

Button: **Choose a time**

Runtime event: one reminder after the candidate has engaged, has an unused Calendly link, and still has not booked after 24 hours. The existing no-reply WhatsApp → email fallback remains separate.

## 3. `availability_request`

Body parameters:

- `candidate_name`
- `job_title`
- `company_name`

Body:

```text
Hi {{candidate_name}}, we'd like to schedule your interview for the {{job_title}} position at {{company_name}}. Please share your preferred availability using the link below.
```

Button: **Share availability**

Runtime event: Schela AI recognizes scheduling intent in a WhatsApp conversation and creates a fresh one-use Calendly link.

## 4. `interview_scheduled`

Body parameters:

- `candidate_name`
- `job_title`
- `company_name`
- `interview_date`
- `interview_time`

Body:

```text
Hi {{candidate_name}}, your interview for the {{job_title}} position at {{company_name}} is confirmed for {{interview_date}} at {{interview_time}}. Please use the link below to join.
```

Button: **Join interview**

Runtime event: Calendly `invitee.created` successfully updates the Schela interview and a meeting URL is available. Date/time are formatted in the candidate timezone where possible.

## Other template names seen in the recording

Schela also registers these names for future mapping, but does not invent their variable contracts without their Meta definitions:

- `interview_confirmation`
- `interview_reminder`
- `interview_starting_soon`
- `reschedule_request`
- `interview_rescheduled`
- `interview_cancelled`
- `missed_interview`

## Language

The supplied screenshots show **English**. Schela defaults to Meta language code `en`. If the actual template metadata reports `en_US`, set these optional Vercel values:

```env
WHATSAPP_INVITATION_LANGUAGE=en_US
WHATSAPP_TEMPLATE_LANGUAGE=en_US
```

These are configuration values, not access tokens.

## Read-only verification

If you know your WABA ID, you can inspect the exact Meta metadata without sending a message:

```bash
WHATSAPP_ACCESS_TOKEN=... npm run whatsapp:inspect -- YOUR_WABA_ID
```

No extra WhatsApp token is required for these templates.
