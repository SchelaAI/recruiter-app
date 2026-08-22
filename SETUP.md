# Schela — Setup

This is a real Next.js 16 + Supabase app — not a mock. It won't run until you plug in
your own credentials, because those require accounts only you can create (Supabase,
Google Cloud, LinkedIn Developer Portal). Follow these steps in order.

## 1. Create a Supabase project

1. Go to supabase.com → New project.
2. Once it's up, go to **Settings → API** and copy:
   - Project URL
   - `anon` `public` key
   - `service_role` key (keep this one secret — never expose it to the browser)
3. Copy `.env.local.example` → `.env.local` and paste those three values in.

## 2. Run the database migrations

1. In the Supabase dashboard, go to **SQL Editor**.
2. Run each migration in order, pasting the full contents of each file and running it:
   - `supabase/migrations/0001_init.sql` — every table, the auto-profile-creation trigger, and all RLS policies.
   - `supabase/migrations/0002_settings.sql` — the extra columns the Settings screen persists.
   - `supabase/migrations/0003_multitenant_branding.sql` — hiring-company branding columns on `organizations` (name shown to candidates, website, "Powered by Schela" flag) and the `interviewers` table (your real per-org hiring team). No fake rows are seeded — a fresh org starts with zero interviewers, added from **Settings → Company**.
   - `supabase/migrations/0004_message_delivery_status.sql` — real delivery-status columns on `messages`.
   - `supabase/migrations/0005_message_sender_identity.sql` — who actually authored each message (AI vs. the human recruiter's real name vs. the candidate).
   - `supabase/migrations/0006_integration_connectors.sql` — **fixes a real bug**: `integrations.id` was a bare primary key, meaning it was globally unique across every org in the deployment rather than per-org. Only the very first org ever created could seed its integration rows; every other org silently failed and showed an empty Integrations page. This migration corrects the primary key to `(id, org_id)` and adds the `config` column each real connector (WhatsApp, Resend, Outlook, Zoom) stores its credentials/tokens in.
   - `supabase/migrations/0009_templates_and_reminders.sql` — WhatsApp template config + reminder tracking.
   - `supabase/migrations/0010_withdrawn_notification_type.sql` — allows the 'withdrawn' notification type.
   - `supabase/migrations/0011_resend_email_provider.sql` — switches the email integration from SendGrid to Resend (which supports inbound, so candidate email replies actually reach Schela).
   - `supabase/migrations/0014_remove_google_calendar.sql` — removes Google Calendar as an integration (see §11); replaced by Outlook + Zoom.
   - `supabase/migrations/0015_calendly_integration.sql` — allows "Calendly" as an interview format (see §11b).
3. You should see 11 tables under **Table Editor** (10 from 0001 plus `interviewers`).

## 3. Set up Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com), create (or reuse) a
   project → **APIs & Services → Credentials → Create OAuth client ID** → Web application.
2. Add this **Authorized redirect URI** (get the exact value from Supabase, step 4):
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy the generated Client ID and Client Secret.
4. In Supabase: **Authentication → Providers → Google** → paste both in, enable it.

## 4. Set up LinkedIn OAuth

1. In [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps), create an app.
2. Under **Products**, add "Sign In with LinkedIn using OpenID Connect."
3. Under **Auth**, add the same redirect URI pattern as above (Supabase will show you
   the exact one under **Authentication → Providers → LinkedIn (OIDC)**).
4. Copy the Client ID and Client Secret into Supabase's LinkedIn (OIDC) provider settings,
   enable it.

## 5. Switch email confirmation from a link to a 6-digit code

By default Supabase emails a confirmation **link**. This app's UI is a 6-digit **OTP**
screen, so you need to change the email template:

1. Supabase → **Authentication → Email Templates → Confirm signup**.
2. Replace `{{ .ConfirmationURL }}` with `{{ .Token }}` in the template body.
3. Save. Now `supabase.auth.signUp()` emails a 6-digit code instead of a link, which is
   what `app/(auth)/verify/page.tsx` expects.

(Optional but recommended for testing before your email sending is fully configured:
Supabase → **Authentication → Settings** lets you view auth logs, which show the OTP
code directly if you don't want to wait on real email delivery while developing.)

## 6. Install and run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. You should land on `/login`.

## 7. Deploy to Vercel

1. Push this repo to GitHub, import it in Vercel.
2. Add the same three env vars from `.env.local` in **Vercel → Project → Settings →
   Environment Variables** (Production + Preview).
3. In Supabase, add your Vercel domain to **Authentication → URL Configuration →
   Redirect URLs** (both the `*.vercel.app` preview domain and your real domain once
   you have one), or OAuth callbacks will fail in production with a redirect mismatch.

## 8. AI Orchestration (Groq)

1. Get an API key at [console.groq.com](https://console.groq.com).
2. Add `GROQ_API_KEY=gsk_...` to `.env.local` (and to Vercel's env vars).
3. That's it — no separate model deployment step. The model used is
   `openai/gpt-oss-120b`, set in `lib/ai/groq.ts`.

To actually exercise the pipeline end-to-end without a real WhatsApp/Email
provider wired up yet, POST directly to the same endpoint a real webhook
would eventually call:

```bash
curl -X POST http://localhost:3000/api/messages/inbound \
  -H "Content-Type: application/json" \
  -d '{"candidateId":"<a real candidate id from your candidates table>","text":"Does Thursday 3pm still work?","channel":"wa"}'
```

This creates/updates a real conversation, runs the real Groq classification
+ drafting pipeline, writes to `ai_decisions`, and either auto-sends a reply
or creates a real escalation (Action Required item + notification) — check
the Conversations and Notifications screens after calling it.

## 9. Real WhatsApp (Meta Business Cloud API)

WhatsApp can be connected two ways — pick one:

**A. Self-serve, per-org (recommended):** in the app, go to
**Settings → Integrations → WhatsApp Business API → Connect**, and paste in
a Phone Number ID + permanent Access Token from a Meta App with the
WhatsApp product added. The Connect flow validates the credentials against
Meta's Graph API for real before saving — a wrong ID/token is rejected with
Meta's own error message, not a fake "Connected!" This is per-org: each
organization on your deployment connects its own WhatsApp number.

**B. Deployment-wide env vars:** set `WHATSAPP_PHONE_NUMBER_ID` and
`WHATSAPP_ACCESS_TOKEN` in `.env.local` / Vercel — every org on the
deployment shares this one number unless they connect their own via (A),
which takes priority.

Either way:
1. [developers.facebook.com/apps](https://developers.facebook.com/apps) →
   create an app → add the **WhatsApp** product → **API Setup** for the
   Phone Number ID + a permanent Access Token (temporary tokens expire in
   24h — set up a System User for a real one before going live).
2. Under **WhatsApp → Configuration**, set the webhook URL to
   `https://<your-domain>/api/webhooks/whatsapp` and the Verify Token to
   whatever you set `WHATSAPP_WEBHOOK_VERIFY_TOKEN` to. Subscribe to the
   `messages` field.
3. A candidate's `phone` + `country_code` in your `candidates` table must
   match the number that messages you on WhatsApp — that's how the webhook
   knows which candidate/org an inbound message belongs to.

## 9b. WhatsApp message templates (required for cold outreach)

WhatsApp only permits free-form text within **24 hours** of the candidate's
last message. Any first contact — or a reminder days later — must use a
template approved by Meta, or it is rejected.

Schela handles this automatically: it always tries free-form first (so normal
in-conversation replies are unchanged), and only falls back to your template
when Meta rejects the send for being outside the window.

To enable it:
1. **WhatsApp Manager → Message Templates → Create Template**. Category
   "Utility". Write a body with numbered placeholders, e.g.
   `Hi {{1}}, we'd like to schedule your interview for {{2}}. Reply to continue.`
2. Submit and wait for approval (usually minutes, sometimes hours).
3. In Schela: **Settings → Company → WhatsApp template name**, enter the
   template's exact name and language code (e.g. `en_US`).

Schela passes two parameters in order: the candidate's first name, then a
context string (the role, or the proposed time). Design your template's
`{{1}}` and `{{2}}` around that. Without a configured template, out-of-window
sends fail with a clear, actionable error rather than silently doing nothing.

## 10. Real email (Resend)

Resend handles both directions: sending interview invitations and reminders,
and receiving candidate replies so email is genuinely two-way.

**Two ways to configure it — pick one:**

**A. One shared account (recommended — recruiters do nothing).** Create a
single Resend account, generate one API key, and set `RESEND_API_KEY` in your
Vercel environment variables. Every org on the deployment sends through it
automatically, with no key to paste and no account to create. This is the
right default given recruiters aren't developers.

**B. Per-org.** A recruiter connects their own Resend account under
**Settings → Integrations → Resend Email → Connect**. The key is validated
live against Resend's API before saving. A per-org key takes priority over
the shared env var.

### Sending

1. Create an account at [resend.com](https://resend.com).
2. **Domains → Add Domain**, then add the DNS records Resend shows you
   (SPF/DKIM). Verification usually completes in minutes.
3. **API Keys → Create API Key** with send permission.
4. Set `RESEND_API_KEY` (option A) or paste it in the app (option B).
5. Set the sender identity. **`EMAIL_FROM_ADDRESS` is required** — without it
   no email sends at all, and Schela reports exactly that rather than failing
   silently. It must be on the domain you verified in step 2, or Resend
   rejects every message.

   ```
   EMAIL_FROM_ADDRESS=interviews@yourdomain.com
   EMAIL_FROM_NAME=Schela
   EMAIL_REPLY_TO=reply@yourdomain.com
   ```

   A recruiter can override any of these per-org in **Settings → Channels**;
   the env values are the deployment-wide default so email works out of the
   box without each recruiter configuring anything.

### Receiving replies (inbound)

1. In Resend, go to **Receiving Emails**. Either use the free
   `<alias>@<id>.resend.app` address Resend creates for you, or set up a
   custom domain by adding the MX record they provide.
   **Use a subdomain** (e.g. `reply.yourdomain.com`) for a custom domain — an
   MX on the root domain routes *all* mail for that domain to Resend, which
   will break any existing mailbox on it.
2. **Webhooks → Add Webhook**: endpoint
   `https://<your-domain>/api/webhooks/email`, event **`email.received`**.
3. Resend shows a **signing secret** (`whsec_...`) after creating the
   webhook. Set it as `RESEND_WEBHOOK_SECRET` in Vercel and redeploy.
   **This matters**: without it, the endpoint accepts any POST claiming to be
   an inbound email — anyone who finds the URL could forge a fake candidate
   reply and trigger the AI (including its scheduling/withdrawal actions).
   With the secret set, requests are verified using the same HMAC scheme
   Resend signs them with (Svix/Standard Webhooks), and anything invalid or
   older than 5 minutes is rejected before it's even parsed.
3. Set `EMAIL_REPLY_TO` (or Settings → Channels) to that inbound address, so
   candidate replies land where the webhook is listening. Example:

   ```
   EMAIL_REPLY_TO=recruiter@schela.app
   ```

   That single address is shared by every org — the webhook identifies who
   replied from the **sender's** address, not the address they wrote to, so
   one inbound mailbox serves all recruiters.

Schela strips quoted history and signatures from replies, then matches the
sender against the candidate's email — so that address must match the one on
the candidate record. Note that Resend's webhook intentionally omits the
message body; Schela fetches it via their API using the same key, so no extra
configuration is needed for that.

## 11. Real Outlook Calendar / Zoom (OAuth)

These two use one shared OAuth engine (`lib/integrations/oauth.ts`) — same
shape, different provider. Each is optional and independent; until a
provider's client id/secret are set, its Connect button on the Integrations
page stays honestly disabled ("Not configured") instead of doing nothing.

**Google Calendar is intentionally not offered.** Google's OAuth verification
for the Calendar scope requires an app review — a demo video, a Limited Use
compliance questionnaire, and a review queue that can take weeks — which is
disproportionate friction for what the integration provided. Outlook's
publisher verification is comparatively light (domain + Microsoft Partner
Network association, no review queue), and Zoom's review is lighter still
since it never touches personal calendar data at all. If Google Calendar
support matters enough later to be worth that process, `lib/integrations/oauth.ts`
was written as a generic engine specifically so re-adding a provider is a
data entry, not new code — see `git log` for how `gcal` was defined before
removal.

For each provider you want live, register a redirect URI of
`https://<your-domain>/api/integrations/oauth/{outlook|zoom}/callback`
with that provider, then set:

- **Outlook Calendar** — Azure AD (Microsoft Entra) → App registrations:
  `MS_CLIENT_ID`, `MS_CLIENT_SECRET`.
- **Zoom** — Zoom Marketplace → Build App → OAuth: `ZOOM_CLIENT_ID`,
  `ZOOM_CLIENT_SECRET`.

**Who needs a developer account:** only you, the person deploying Schela.
You register each OAuth app **once**, and the client id/secret go in this
deployment's environment. Recruiters using Schela never touch a developer
console — they click "Connect" in Settings → Integrations and approve a
normal Microsoft / Zoom consent screen, exactly like signing into any other
app.

Once connected, these are wired end to end:

- **Outlook Calendar** — real events created via Microsoft Graph, with the
  candidate invited, a Teams join link generated, and the calendar's real
  free/busy checked (getSchedule) so Schela never proposes a slot the
  recruiter is already booked for.
- **Zoom** — when the recruiter picks "Zoom" as the interview format and the
  account is connected, a real scheduled Zoom meeting is created and its join
  URL becomes the interview's meeting link (and is embedded in the calendar
  invite, when Outlook is also connected).

If neither is connected, interviews still schedule correctly — they just
have no meeting link, and the interview drawer honestly shows "No Link Yet"
instead of a fake one.

## 11b. Real Calendly (OAuth)

Calendly works differently from Outlook/Zoom, and it's worth understanding
why before setting it up: Google Meet, Zoom, Phone, and In-person all have
Schela pick a specific time and hand it to the candidate. Calendly's actual
strength is the opposite — the candidate picks their own slot through
Calendly's own booking page. So when a recruiter picks **Calendly** as the
interview format, Schela sends a real, single-use Calendly booking link
instead of a fixed time, and finds out what the candidate actually chose via
a webhook once they book. This is the correct fit for what Calendly is, not
a shortcut — don't expect it to behave like the other formats.

**Create the OAuth app:**
1. [developer.calendly.com](https://developer.calendly.com) → sign up (free)
   → **Create an OAuth app**.
2. **Redirect URI**: `https://<your-domain>/api/integrations/oauth/calendly/callback`
3. Calendly requires PKCE on every OAuth app (Schela already implements this
   — nothing extra to configure on your end).
4. Copy the **Client ID**, **Client Secret**, and **Webhook Signing Key** —
   Calendly shows the secret and signing key exactly once, at creation, same
   as every other "copy it now" credential you've dealt with elsewhere in
   this setup.

```
CALENDLY_CLIENT_ID=...
CALENDLY_CLIENT_SECRET=...
CALENDLY_WEBHOOK_SIGNING_KEY=...
```

The signing key is a property of the OAuth app itself, not per connecting
org — one deployment-wide value covers every recruiter's connection, the
same shape as `RESEND_WEBHOOK_SECRET`.

**Connect and configure:**
1. Redeploy with the three env vars set.
2. Settings → Integrations → Calendly → **Connect** — approves a normal
   Calendly consent screen. A webhook subscription is registered
   automatically right after, so no separate webhook setup step is needed.
3. On the connected Calendly card, pick which **event type** Schela should
   book interviews through. Booking links can't be generated until one is
   selected.

**Who needs a developer account:** only you. Once connected, recruiters just
pick "Calendly" as a format in the New Interview wizard — no Calendly
developer account, no OAuth app, nothing beyond having their own Calendly
account connected.

**What happens when a candidate books:** `/api/webhooks/calendly` receives
the real signed event, matches the booking to a candidate by email, and
updates the interview's real scheduled time (and meeting link, when Calendly
provides one) — the same interview row created when the invite went out, not
a new one.

## What's real right now vs. what's next

**Fully wired to Supabase, real data only, no mocks:** Auth, onboarding,
Candidates, Interviews, Conversations, Notifications, the Integrations
catalog, and now the **Dashboard home page** — Action Required, Today's
Interviews, Active Conversations, the AI Timeline widget, Week at a Glance,
and This Week's Performance are all computed from real Supabase queries.
Two honest notes on that last one: avg. response time is genuinely computed
from real message/AI-decision timestamps and shows "—" when there's no data
yet rather than a fake number, and "Hours saved" is explicitly labeled an
*estimate* (AI-handled interviews × an assumed 2.5h manual-coordination
time) — it's not a directly measured quantity and the UI says so.

**Real Meta WhatsApp integration, not a stub:** `lib/integrations/whatsapp.ts`
sends real messages via Meta's Graph API. `/api/webhooks/whatsapp` handles
Meta's verification handshake and receives real inbound messages, matching
the sender's phone number to a candidate and running the full AI pipeline
on it — same as the manual test endpoint, but from real WhatsApp traffic.
Both the AI's auto-replies and a recruiter's manual replies in the
Conversations screen now actually send over WhatsApp when the channel is
WhatsApp, not just write a database row.

**AI Orchestration (Groq + gpt-oss-120b):** unchanged from before — real
classification, drafting, tool-calling, confidence-gated escalation, full
audit log in `ai_decisions`.

**Real integration connectors, not UI-only buttons:** every integration on
the Integrations page has a real Connect/Disconnect flow behind it now —
WhatsApp and Resend via validated, org-stored credentials; Outlook, Zoom,
and Calendly via real OAuth (see §11, §11b). Email sending
(`lib/integrations/resend.ts`) is wired into every place that previously
just recorded a message without sending it: conversation replies, AI
auto-replies, reschedule/cancellation notices, and reminders. Calendar-event
and meeting-link creation from a scheduled interview is real, not a
placeholder — a connected Outlook account gets a real Teams-linked event,
Zoom generates a real join URL, and Calendly hands the candidate a real
booking link and updates the interview once they pick a time.

**Also fully wired, contrary to an earlier note in this file:** Calendar
(`/api/interviews`) and Analytics (`/api/analytics`, backed by
`getAnalyticsSummary` in `store.ts`) both fetch and compute from real
Supabase data — nothing left on mock data in the app's main navigation.



## 13. Scheduled interview reminders (cron)

`/api/cron/reminders` sends the 24-hour and 1-hour reminders for upcoming
interviews. It's a plain authenticated GET, so **any** scheduler that can make
an HTTP request will drive it — no dependency on Vercel Cron (whose Hobby plan
only allows one run per day, too infrequent for the 1-hour reminder).

**Step 1 — set the secret.** Add `CRON_SECRET` to your Vercel environment
variables (any random string) and redeploy. Without it the endpoint logs a
warning and stays publicly triggerable.

**Step 2 — schedule it.** [cron-job.org](https://cron-job.org) is free and has
minute-level granularity:

1. Create an account, then **Create cronjob**.
2. **URL**: `https://<your-domain>/api/cron/reminders`
3. **Schedule**: every hour.
4. Under **Advanced → Headers**, add:
   `Authorization: Bearer <your CRON_SECRET>`
5. Save and enable.

Any equivalent works — EasyCron, Cronitor, or a GitHub Actions workflow on a
`schedule:` trigger (note that GitHub's scheduled runs can lag 5–15 minutes,
which matters more for the 1-hour reminder than the 24-hour one).

**Running it by hand** (useful for testing):

```bash
curl -H "Authorization: Bearer <your CRON_SECRET>" \
  https://<your-domain>/api/cron/reminders
```

Returns `{"sent24h":N,"sent1h":N,"failed":N}`.

**Safe to call repeatedly.** Every send stamps `reminder_24h_sent_at` /
`reminder_1h_sent_at` on the interview, and only unstamped interviews are
picked up — so overlapping runs, retries, or several schedulers pointing at
this endpoint at once cannot double-message a candidate. Extra calls simply
return zeros.

**Frequency is the only real constraint:** run it at least hourly, or the
1-hour reminder won't be meaningful.
