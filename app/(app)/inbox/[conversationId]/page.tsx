import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { formatDateTime, formatRelativeTime, initials } from "@/lib/format";
import { interviewStatusLabel, statusTone } from "@/lib/ui";
import { sendManualMessage } from "./actions";
import { ConversationRealtime } from "@/components/conversation-realtime";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Icons } from "@/components/ui-icons";

function deliveryLabel(status: string | null | undefined, delivered: boolean, error: string | null) {
  if (error || status === "failed") return "Failed";
  if (status === "read") return "Read";
  if (status === "delivered" || delivered) return "Delivered";
  if (status === "sent") return "Sent";
  if (status === "accepted") return "Accepted";
  if (status === "received") return "Received";
  return "Pending";
}

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ conversationId: string }>; searchParams: Promise<{ outreach?: string; sent?: string; error?: string; deliveryError?: string }> }) {
  const { conversationId } = await params;
  const query = await searchParams;
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;

  const [{ data: conversation }, { data: conversations }] = await Promise.all([
    supabase.from("conversations").select("id,candidate_id,interview_id,primary_channel,channel,escalated,confidence,escalation_reason,updated_at").eq("id", conversationId).eq("org_id", orgId).single(),
    supabase.from("conversations").select("id,candidate_id,interview_id,unread,escalated,updated_at").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(60),
  ]);
  if (!conversation) notFound();

  const allCandidateIds = [...new Set((conversations ?? []).map((x) => x.candidate_id).filter(Boolean))];
  const conversationIds = (conversations ?? []).map((x) => x.id);
  const [candidateResult, messagesResult, interviewResult, allCandidatesResult, listMessagesResult] = await Promise.all([
    supabase.from("candidates").select("name,email,country_code,phone,time_zone").eq("id", conversation.candidate_id).eq("org_id", orgId).single(),
    supabase.from("messages").select("id,from_role,text,channel,sender_kind,sender_name,delivered,delivery_status,delivery_error,email_subject,created_at").eq("conversation_id", conversationId).eq("org_id", orgId).order("created_at", { ascending: false }).limit(100),
    conversation.interview_id ? supabase.from("interviews").select("id,role_title,interviewer,scheduled_at,ai_state,format,last_candidate_reply_at").eq("id", conversation.interview_id).eq("org_id", orgId).single() : Promise.resolve({ data: null }),
    allCandidateIds.length ? supabase.from("candidates").select("id,name").eq("org_id", orgId).in("id", allCandidateIds) : Promise.resolve({ data: [] as Array<{id:string;name:string}> }),
    conversationIds.length ? supabase.from("messages").select("conversation_id,text,created_at").eq("org_id", orgId).in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] as Array<{conversation_id:string;text:string;created_at:string}> }),
  ]);

  const candidate = candidateResult.data;
  const messages = [...(messagesResult.data ?? [])].reverse();
  const interview = interviewResult.data as { id:number; role_title:string|null; interviewer:string; scheduled_at:string|null; ai_state:string; format:string; last_candidate_reply_at:string|null } | null;
  const names = new Map((allCandidatesResult.data ?? []).map((c) => [c.id, c.name]));
  const latest = new Map<string, { text:string; created_at:string }>();
  for (const msg of listMessagesResult.data ?? []) if (!latest.has(msg.conversation_id)) latest.set(msg.conversation_id, msg);

  const lastReplyAt = interview?.last_candidate_reply_at ? new Date(interview.last_candidate_reply_at).getTime() : 0;
  const whatsappWindowOpen = Boolean(lastReplyAt) && Date.now() - lastReplyAt <= 24 * 60 * 60 * 1000;
  const latestInbound = [...messages].reverse().find((message) => message.from_role === "candidate");
  const manualChannel = latestInbound?.channel === "em" ? "em" : "wa";
  const manualComposerOpen = manualChannel === "em" || whatsappWindowOpen;
  const tone = statusTone(interview?.ai_state, interview?.scheduled_at);

  return <div className="workspace-page conversation-page">
    <ConversationRealtime conversationId={conversationId} interviewId={interview?.id ?? null}/>
    <WorkspaceHeader title="Conversations" subtitle="Every message Schela has sent or received, in one place"/>
    {query.outreach ? <div className="alert alert-success">{query.outreach === "email-sent" ? "Interview invitation sent by email." : "WhatsApp invitation accepted by Meta."}</div> : null}
    {query.sent ? <div className="alert alert-success">Message sent.</div> : null}
    {query.deliveryError ? <div className="alert alert-error">Delivery failed: {query.deliveryError}</div> : null}
    {query.error ? <div className="alert alert-error">{query.error}</div> : null}

    <section className="conversation-workspace">
      <aside className="conversation-list-pane">
        <div className="conversation-search"><Icons.search size={15}/><span>Search conversations...</span></div>
        <div className="conversation-list">{(conversations ?? []).map((row) => { const name = names.get(row.candidate_id) ?? row.candidate_id; const msg = latest.get(row.id); return <Link href={`/inbox/${row.id}`} key={row.id} className={`conversation-list-row ${row.id === conversationId ? "active" : ""}`}><span className="square-avatar">{initials(name)}</span><span className="conversation-list-copy"><b>{name}</b><small>{msg?.text ?? "Conversation ready"}</small></span><time>{formatRelativeTime(msg?.created_at ?? row.updated_at)}</time></Link>; })}</div>
      </aside>

      <div className="conversation-thread-pane">
        <header className="conversation-person-header"><div className="person-cell"><span className="square-avatar coral">{initials(candidate?.name ?? "Candidate")}</span><span><b>{candidate?.name ?? "Candidate"}</b><small>{interview?.role_title ?? "Interview"}{conversation.escalated ? " · Escalated" : ""}</small></span></div><span className={`status-chip ${tone}`}>{interviewStatusLabel(interview?.ai_state, interview?.scheduled_at)}</span></header>
        <div className="conversation-messages">{messages.length ? messages.map((message) => <div key={message.id} className={`chat-message ${message.from_role === "candidate" ? "incoming" : "outgoing"}`}><div className="chat-bubble">{message.from_role !== "candidate" ? <span className="ai-label">✦ {message.sender_kind === "human" ? profile.full_name : "SCHELA · AI"}</span> : null}<p>{message.text}</p><div className="chat-meta"><time>{formatRelativeTime(message.created_at)}</time>{message.from_role !== "candidate" ? <span className={message.delivery_error ? "delivery-failed" : ""}>{deliveryLabel(message.delivery_status, message.delivered, message.delivery_error)}</span> : null}</div>{message.delivery_error ? <small className="message-error">{message.delivery_error}</small> : null}</div></div>) : <div className="conversation-empty">No messages in this thread yet.</div>}</div>
        {manualComposerOpen ? <form action={sendManualMessage} className="conversation-composer"><input type="hidden" name="conversationId" value={conversationId}/><input type="hidden" name="channel" value={manualChannel}/><button type="button" className="composer-icon" disabled aria-label="Attach">＋</button><input name="text" required maxLength={3000} autoComplete="off" placeholder="Type a message..."/><button className="send-circle" type="submit" aria-label="Send"><Icons.arrow size={18}/></button></form> : <div className="conversation-composer disabled"><input disabled placeholder={interview?.last_candidate_reply_at ? "WhatsApp reply window is closed" : "Composer opens after the candidate replies"}/><button className="send-circle" disabled><Icons.arrow size={18}/></button></div>}
      </div>
    </section>
  </div>;
}
