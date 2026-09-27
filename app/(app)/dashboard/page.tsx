import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { formatRelativeTime, initials } from "@/lib/format";
import { endOfWeek, formatShortTime, interviewStatusLabel, startOfWeek, statusTone } from "@/lib/ui";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Icons } from "@/components/ui-icons";

export default async function DashboardPage() {
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [activeCandidatesResult, weekInterviewsResult, confirmedWeekResult, awaitingResult, overdueResult, escalatedResult, todayResult, actionsResult, conversationsResult] = await Promise.all([
    supabase.from("candidates").select("id", { count: "exact", head: true }).eq("org_id", orgId).neq("ai_state", "completed"),
    supabase.from("interviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("scheduled_at", weekStart.toISOString()).lt("scheduled_at", weekEnd.toISOString()),
    supabase.from("interviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("scheduled_at", weekStart.toISOString()).lt("scheduled_at", weekEnd.toISOString()).not("scheduled_at", "is", null),
    supabase.from("interviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("ai_state", "waiting_reply"),
    supabase.from("interviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("ai_state", "waiting_reply").lte("initial_outreach_sent_at", twentyFourHoursAgo),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("escalated", true),
    supabase.from("interviews").select("id,candidate_id,role_title,channel,ai_state,scheduled_at").eq("org_id", orgId).gte("scheduled_at", dayStart.toISOString()).lt("scheduled_at", dayEnd.toISOString()).order("scheduled_at").limit(8),
    supabase.from("action_items").select("id,candidate_id,conversation_id,summary,created_at,category").eq("org_id", orgId).eq("resolved", false).order("created_at", { ascending: false }).limit(4),
    supabase.from("conversations").select("id,candidate_id,updated_at,unread,escalated").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(5),
  ]);

  const today = todayResult.data ?? [];
  const actions = actionsResult.data ?? [];
  const conversations = conversationsResult.data ?? [];
  const candidateIds = [...new Set([...today.map((x) => x.candidate_id), ...actions.map((x) => x.candidate_id), ...conversations.map((x) => x.candidate_id)].filter(Boolean))];
  const conversationIds = conversations.map((x) => x.id);
  const [candidateResult, messageResult] = await Promise.all([
    candidateIds.length ? supabase.from("candidates").select("id,name").eq("org_id", orgId).in("id", candidateIds) : Promise.resolve({ data: [] as Array<{id:string;name:string}> }),
    conversationIds.length ? supabase.from("messages").select("conversation_id,text,created_at,from_role").eq("org_id", orgId).in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] as Array<{conversation_id:string;text:string;created_at:string;from_role:string}> }),
  ]);
  const candidateMap = new Map((candidateResult.data ?? []).map((c) => [c.id, c.name]));
  const latestMessage = new Map<string, { text: string; created_at: string; from_role: string }>();
  for (const msg of messageResult.data ?? []) if (!latestMessage.has(msg.conversation_id)) latestMessage.set(msg.conversation_id, msg);

  const dateLabel = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(now);

  return (
    <div className="workspace-page">
      <WorkspaceHeader title="Dashboard" subtitle={`${dateLabel} · Everything Schela is coordinating right now`} />

      <section className="dashboard-metrics">
        <Metric icon={<Icons.user size={21}/>} tone="violet" label="Active Candidates" value={activeCandidatesResult.count ?? 0} foot="currently in coordination" />
        <Metric icon={<Icons.calendar size={21}/>} tone="green" label="Interviews This Week" value={weekInterviewsResult.count ?? 0} foot={`${confirmedWeekResult.count ?? 0} confirmed`} />
        <Metric icon={<Icons.clock size={21}/>} tone="amber" label="Awaiting Reply" value={awaitingResult.count ?? 0} foot={`${overdueResult.count ?? 0} over 24h`} />
        <Metric icon={<Icons.warning size={21}/>} tone="red" label="Escalated" value={escalatedResult.count ?? 0} foot="needs you" />
      </section>

      <div className="dashboard-grid">
        <section className="workspace-card wide-card">
          <div className="card-title-row"><h2>Today&apos;s Interviews</h2><Link href="/interviews">View all</Link></div>
          {today.length ? <div className="reference-table"><div className="reference-tr reference-th"><span>TIME</span><span>CANDIDATE</span><span>CHANNEL</span><span>STATUS</span></div>{today.map((item) => {
            const name = candidateMap.get(item.candidate_id) ?? item.candidate_id;
            const tone = statusTone(item.ai_state, item.scheduled_at);
            return <Link href={`/interviews?candidate=${encodeURIComponent(item.candidate_id)}`} className="reference-tr" key={item.id}><strong>{formatShortTime(item.scheduled_at)}</strong><span className="person-cell"><span className="square-avatar">{initials(name)}</span><span><b>{name}</b><small>{item.role_title ?? "Interview"}</small></span></span><span className={`channel-text ${item.channel === "wa" ? "wa" : "em"}`}>{item.channel === "wa" ? <Icons.whatsapp size={17}/> : <Icons.mail size={17}/>} {item.channel === "wa" ? "WhatsApp" : "Email"}</span><span><span className={`status-chip ${tone}`}>{interviewStatusLabel(item.ai_state, item.scheduled_at)}</span></span></Link>;
          })}</div> : <EmptyMini text="No interviews scheduled for today."/>}
        </section>

        <div className="dashboard-side">
          <section className="workspace-card" id="attention">
            <div className="card-title-row"><h2>Needs Your Attention</h2></div>
            {actions.length ? <div className="attention-list">{actions.map((item) => <Link href={item.conversation_id ? `/inbox/${item.conversation_id}` : "/inbox"} className="attention-item" key={item.id}><span className={`attention-dot ${item.category === "compensation" || item.category === "visa" ? "red" : "amber"}`}/><span><b>{candidateMap.get(item.candidate_id ?? "") ?? "Candidate"}</b><small>{formatRelativeTime(item.created_at)}</small><p>{item.summary}</p></span></Link>)}</div> : <EmptyMini text="Nothing needs your attention right now."/>}
          </section>
          <section className="workspace-card live-card">
            <div className="card-title-row"><h2><span className="live-dot"/>Live Conversations</h2><Link href="/inbox">Open</Link></div>
            {conversations.length ? <div className="live-list">{conversations.slice(0, 3).map((conversation) => { const name = candidateMap.get(conversation.candidate_id) ?? conversation.candidate_id; const msg = latestMessage.get(conversation.id); return <Link href={`/inbox/${conversation.id}`} key={conversation.id} className="live-row"><span className="square-avatar greenish">{initials(name)}</span><span className="live-copy"><b>{name}</b><small>{msg?.text ?? "Conversation ready"}</small></span><time>{formatRelativeTime(msg?.created_at ?? conversation.updated_at)}</time></Link>; })}</div> : <EmptyMini text="No live conversations yet."/>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, tone, label, value, foot }: { icon: React.ReactNode; tone: string; label: string; value: number; foot: string }) {
  return <article className="dashboard-metric"><span className={`metric-icon ${tone}`}>{icon}</span><span>{label}</span><strong>{value}</strong><small className={tone}>{foot}</small></article>;
}

function EmptyMini({ text }: { text: string }) { return <div className="empty-mini">{text}</div>; }
