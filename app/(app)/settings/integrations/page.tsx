import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCalendlyConnection, listCalendlyEventTypes } from "@/lib/calendly/client";
import { recordOperationalEvent } from "@/lib/observability/events";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Icons } from "@/components/ui-icons";
import { disconnectCalendly, saveCalendlySettings } from "./actions";

function providerReady(keys: string[]) { return keys.every((key) => Boolean(process.env[key]?.trim())); }

export default async function IntegrationsSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string; saved?: string; disconnected?: string }> }) {
  const params = await searchParams;
  const { profile } = await requireAppUser();
  const orgId = profile.org_id!;
  const admin = createAdminClient();
  const [connection, interviewerResult] = await Promise.all([
    getCalendlyConnection(orgId),
    admin.from("interviewers").select("id,name,role,calendly_event_type_uri,calendly_event_type_name").eq("org_id", orgId).order("name"),
  ]);
  const interviewers = interviewerResult.data;
  let eventTypes: Awaited<ReturnType<typeof listCalendlyEventTypes>> = [];
  let loadError = false;
  if (connection) { try { eventTypes = await listCalendlyEventTypes(orgId); } catch (error) { loadError = true; await recordOperationalEvent({ severity:"warning", source:"calendly", eventType:"settings_health_failed", orgId, message:error instanceof Error ? error.message : "Calendly health check failed" }); } }
  const whatsappReady = providerReady(["WHATSAPP_PHONE_NUMBER_ID","WHATSAPP_ACCESS_TOKEN","WHATSAPP_WEBHOOK_VERIFY_TOKEN","WHATSAPP_APP_SECRET"]);
  const emailReady = providerReady(["RESEND_API_KEY","RESEND_WEBHOOK_SECRET","EMAIL_FROM_ADDRESS","EMAIL_REPLY_TO"]);

  return <div className="workspace-page">
    <WorkspaceHeader title="Integrations" subtitle={`${[whatsappReady,emailReady,Boolean(connection && !loadError)].filter(Boolean).length} connected · Everything Schela sends or receives through`}/>
    {params.error ? <div className="alert alert-error">{params.error}</div> : null}
    {params.connected ? <div className="alert alert-success">Calendly connected. Choose the event type Schela should use.</div> : null}
    {params.saved ? <div className="alert alert-success">Calendly scheduling settings saved.</div> : null}
    {params.disconnected ? <div className="alert alert-info">Calendly disconnected.</div> : null}
    {loadError ? <div className="alert alert-error">Calendly is connected, but Schela could not reach its API right now.</div> : null}

    <section className="integration-grid">
      <IntegrationCard icon={<Icons.whatsapp size={18}/>} title="WhatsApp Business API" connected={whatsappReady} detail={whatsappReady ? "Production credentials configured" : "Missing server configuration"}/>
      <IntegrationCard icon={<Icons.mail size={18}/>} title="Resend Email" connected={emailReady} detail={emailReady ? (process.env.EMAIL_FROM_ADDRESS || "Outbound + inbound ready") : "Missing server configuration"}/>
      <IntegrationCard icon={<Icons.calendar size={18}/>} title="Outlook Calendar" connected={false} detail="Real events, Teams links, and free/busy checking." comingSoon/>
      <IntegrationCard icon={<Icons.interviews size={18}/>} title="Zoom" connected={false} detail="Generates a real join link for scheduled interviews." comingSoon/>
      <article className="integration-card"><div className="integration-card-head"><span className="provider-icon"><Icons.calendar size={18}/></span><div><h2>Calendly</h2><span className={`status-chip ${connection && !loadError ? "green" : loadError ? "amber" : "neutral"}`}>{connection && !loadError ? "Connected" : loadError ? "Check connection" : "Not connected"}</span></div></div><p>{connection ? (connection.account_email || connection.account_name || "Candidate self-service booking with real webhooks.") : "Candidate self-service booking with real webhooks."}</p>{!connection ? <Link className="button button-primary button-small" href="/api/integrations/calendly/connect">Connect</Link> : <span className="integration-managed">Manage below ↓</span>}</article>
      <IntegrationCard icon={<Icons.analytics size={18}/>} title="AI Voice Calls" connected={false} detail="Coming soon." comingSoon/>
    </section>

    {connection ? <section className="workspace-card calendly-manage-card"><div className="card-title-row"><div><h2>Calendly scheduling</h2><p>Choose the real event types Schela can offer candidates.</p></div><span className="status-chip green">Connected</span></div><form action={saveCalendlySettings} className="settings-form"><label className="settings-field"><span>Workspace default event type</span><select name="defaultEventType" defaultValue={connection.default_event_type_uri ?? ""}><option value="">Select an event type</option>{eventTypes.map((eventType)=><option key={eventType.uri} value={eventType.uri}>{eventType.name}{eventType.profile?.name ? ` · ${eventType.profile.name}` : ""}</option>)}</select></label><div className="mapping-list"><h3>Interviewer event types</h3>{interviewers?.length ? interviewers.map((person)=><label key={person.id}><span>{person.name}{person.role ? ` · ${person.role}` : ""}</span><select name={`interviewer_${person.id}`} defaultValue={person.calendly_event_type_uri ?? ""}><option value="">Use workspace default</option>{eventTypes.map((eventType)=><option key={eventType.uri} value={eventType.uri}>{eventType.name}</option>)}</select></label>) : <div className="empty-mini">Add interviewers in Company settings first.</div>}</div><button className="button button-primary settings-save" type="submit">Save Calendly settings</button></form><form action={disconnectCalendly}><button className="text-button danger" type="submit">Disconnect Calendly</button></form></section> : null}
  </div>;
}

function IntegrationCard({ icon, title, connected, detail, comingSoon=false }: { icon:React.ReactNode; title:string; connected:boolean; detail:string; comingSoon?:boolean }) { return <article className="integration-card"><div className="integration-card-head"><span className="provider-icon">{icon}</span><div><h2>{title}</h2><span className={`status-chip ${connected ? "green" : "neutral"}`}>{connected ? "Connected" : "Not connected"}</span></div></div><p>{detail}</p>{comingSoon ? <button className="button button-primary button-small" disabled>Coming soon</button> : connected ? <span className="integration-managed">Connected</span> : <span className="integration-managed muted">Configure server env</span>}</article>; }
