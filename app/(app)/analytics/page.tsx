import { requireAppUser } from "@/lib/auth";
import { WorkspaceHeader } from "@/components/workspace-header";
import { startOfWeek, endOfWeek } from "@/lib/ui";

export default async function AnalyticsPage() {
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const weekStart = startOfWeek(); const weekEnd = endOfWeek();
  const [{ data: interviews }, { data: conversations }, { data: decisions }, { data: weekInterviews }] = await Promise.all([
    supabase.from("interviews").select("id,ai_state,scheduled_at,initial_outreach_sent_at,last_candidate_reply_at,created_at").eq("org_id", orgId).gte("created_at", since).limit(2000),
    supabase.from("conversations").select("id,escalated,updated_at").eq("org_id", orgId).gte("updated_at", since).limit(2000),
    supabase.from("ai_decisions").select("tier,action_taken,created_at").eq("org_id", orgId).gte("created_at", since).limit(3000),
    supabase.from("interviews").select("scheduled_at").eq("org_id", orgId).gte("scheduled_at", weekStart.toISOString()).lt("scheduled_at", weekEnd.toISOString()).limit(1000),
  ]);
  const rows = interviews ?? [];
  const responseTimes = rows.filter((i) => i.initial_outreach_sent_at && i.last_candidate_reply_at).map((i) => (new Date(i.last_candidate_reply_at).getTime() - new Date(i.initial_outreach_sent_at).getTime()) / 3600000).filter((n) => n >= 0 && n < 24 * 30);
  const avgResponse = responseTimes.length ? responseTimes.reduce((a,b)=>a+b,0) / responseTimes.length : 0;
  const invited = rows.length;
  const replied = rows.filter((i) => i.last_candidate_reply_at).length;
  const confirmed = rows.filter((i) => i.scheduled_at).length;
  const completed = rows.filter((i) => i.ai_state === "completed").length;
  const confirmationRate = invited ? Math.round((confirmed / invited) * 100) : 0;
  const aiRows = decisions ?? [];
  const autoResolved = aiRows.length ? Math.round((aiRows.filter((d) => d.tier !== "human" && d.action_taken !== "escalate").length / aiRows.length) * 100) : 0;
  const convRows = conversations ?? [];
  const escalationRate = convRows.length ? Math.round((convRows.filter((c) => c.escalated).length / convRows.length) * 100) : 0;
  const funnel = [
    ["Invited", invited, "violet"], ["Replied", replied, "green"], ["Confirmed", confirmed, "blue"], ["Completed", completed, "amber"],
  ] as const;
  const maxFunnel = Math.max(invited, 1);
  const weekdayCounts = Array(7).fill(0) as number[];
  for (const item of weekInterviews ?? []) if (item.scheduled_at) { const day = new Date(item.scheduled_at).getDay(); weekdayCounts[day === 0 ? 6 : day - 1]++; }
  const maxDay = Math.max(...weekdayCounts, 1);

  return <div className="workspace-page">
    <WorkspaceHeader title="Analytics" subtitle="Last 30 days across every candidate and channel"/>
    <section className="analytics-metrics">
      <AnalyticsMetric label="Avg. Response Time" value={responseTimes.length ? `${avgResponse.toFixed(1)} hrs` : "—"} foot={responseTimes.length ? `${responseTimes.length} measured replies` : "No measured replies yet"}/>
      <AnalyticsMetric label="Confirmation Rate" value={`${confirmationRate}%`} foot={`${confirmed} of ${invited || 0} interviews`}/>
      <AnalyticsMetric label="AI Auto-Resolved" value={`${autoResolved}%`} foot="of recorded AI decisions" violet/>
      <AnalyticsMetric label="Escalation Rate" value={`${escalationRate}%`} foot={`${convRows.filter((c)=>c.escalated).length} escalated threads`}/>
    </section>
    <div className="analytics-grid">
      <section className="workspace-card analytics-panel"><h2>Hiring Funnel</h2><div className="funnel-list">{funnel.map(([label,count,tone]) => { const pct = Math.round((count / maxFunnel) * 100); return <div className="funnel-row" key={label}><div><span>{label}</span><b>{invited ? `${pct}%` : "0%"}</b></div><div className="funnel-track"><i className={tone} style={{ width: `${pct}%` }}/></div></div>; })}</div></section>
      <section className="workspace-card analytics-panel"><h2>Interviews This Week</h2><div className="bar-chart">{["M","T","W","T","F","S","S"].map((day,i)=><div className="bar-col" key={`${day}-${i}`}><div className="bar" style={{ height: `${Math.max(8, (weekdayCounts[i]/maxDay)*100)}%` }} title={`${weekdayCounts[i]} interviews`}/><span>{day}</span><small>{weekdayCounts[i]}</small></div>)}</div></section>
    </div>
  </div>;
}

function AnalyticsMetric({ label, value, foot, violet=false }: { label:string; value:string; foot:string; violet?:boolean }) { return <article className="dashboard-metric analytics-metric"><span>{label}</span><strong>{value}</strong><small className={violet ? "violet" : "green"}>{foot}</small></article>; }
