import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { formatShortDate, formatShortTime, interviewStatusLabel, statusTone } from "@/lib/ui";
import { initials } from "@/lib/format";
import { WorkspaceHeader } from "@/components/workspace-header";

const filters = [
  ["all", "All"],
  ["confirmed", "Confirmed"],
  ["awaiting", "Awaiting Reply"],
  ["escalated", "Escalated"],
] as const;

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string; candidate?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;
  const { data: interviews } = await supabase.from("interviews").select("id,candidate_id,role_title,interviewer,scheduled_at,duration_minutes,format,channel,ai_state,created_at").eq("org_id", orgId).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(150);
  const candidateIds = [...new Set((interviews ?? []).map((item) => item.candidate_id).filter(Boolean))];
  const { data: candidates } = candidateIds.length ? await supabase.from("candidates").select("id,name").eq("org_id", orgId).in("id", candidateIds) : { data: [] as Array<{id:string;name:string}> };
  const names = new Map((candidates ?? []).map((item) => [item.id, item.name]));
  const status = params.status ?? "all";
  const visible = (interviews ?? []).filter((item) => {
    if (params.candidate && item.candidate_id !== params.candidate) return false;
    if (status === "confirmed") return Boolean(item.scheduled_at) && item.ai_state !== "escalated" && item.ai_state !== "rescheduling";
    if (status === "awaiting") return item.ai_state === "waiting_reply" || item.ai_state === "sending_invitation" || item.ai_state === "scheduling";
    if (status === "escalated") return item.ai_state === "escalated";
    return true;
  });
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate()+1);
  const todayCount = (interviews ?? []).filter((i) => i.scheduled_at && new Date(i.scheduled_at) >= todayStart && new Date(i.scheduled_at) < todayEnd).length;
  const attentionCount = (interviews ?? []).filter((i) => i.ai_state === "escalated").length;

  return <div className="workspace-page">
    <WorkspaceHeader title="Interviews" subtitle={`${interviews?.length ?? 0} total · ${todayCount} today · ${attentionCount} need your attention`} />
    {params.error ? <div className="alert alert-error">{params.error}</div> : null}
    <div className="filter-tabs">{filters.map(([key,label]) => <Link key={key} href={`/interviews?status=${key}`} className={status === key ? "active" : undefined}>{label}</Link>)}</div>
    <section className="workspace-card table-card">
      {visible.length ? <div className="reference-table interview-table">
        <div className="reference-tr reference-th"><span>DAY</span><span>TIME</span><span>CANDIDATE</span><span>INTERVIEWER</span><span>FORMAT</span><span>STATUS</span><span/></div>
        {visible.map((item) => { const name = names.get(item.candidate_id) ?? item.candidate_id; const tone = statusTone(item.ai_state, item.scheduled_at); return <div className="reference-tr" key={item.id}>
          <span className="muted-cell">{formatShortDate(item.scheduled_at)}</span>
          <strong>{formatShortTime(item.scheduled_at)}</strong>
          <span className="person-cell"><span className="square-avatar">{initials(name)}</span><span><b>{name}</b><small>{item.role_title ?? "Interview"}</small></span></span>
          <span className="muted-cell">{item.interviewer}</span>
          <span className="muted-cell">{item.format}</span>
          <span><span className={`status-chip ${tone}`}>{interviewStatusLabel(item.ai_state, item.scheduled_at)}</span></span>
          <Link className="open-link" href={`/inbox?interview=${item.id}`}>Open →</Link>
        </div>})}
      </div> : <div className="empty-state"><h3>No interviews in this view</h3><p>Try another filter or create a new interview.</p><Link className="button button-primary" href="/interviews/new">New interview</Link></div>}
    </section>
  </div>;
}
