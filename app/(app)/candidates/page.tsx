import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { interviewStatusLabel, statusTone } from "@/lib/ui";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Icons } from "@/components/ui-icons";
import { addCandidate } from "./actions";

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string; q?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;
  let candidateQuery = supabase.from("candidates").select("id,name,email,country_code,phone,time_zone,notes,created_at,ai_state,score,job_position").eq("org_id", orgId).order("created_at", { ascending: false });
  if (params.q?.trim()) candidateQuery = candidateQuery.or(`name.ilike.%${params.q.trim()}%,email.ilike.%${params.q.trim()}%`);
  const [{ data: candidates }, { data: interviews }] = await Promise.all([
    candidateQuery,
    supabase.from("interviews").select("candidate_id,role_title,ai_state,scheduled_at,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(500),
  ]);
  const latestInterview = new Map<string, { role_title:string|null; ai_state:string; scheduled_at:string|null }>();
  for (const item of interviews ?? []) if (!latestInterview.has(item.candidate_id)) latestInterview.set(item.candidate_id, item);
  const status = params.status ?? "all";
  const visible = (candidates ?? []).filter((candidate) => {
    const state = latestInterview.get(candidate.id)?.ai_state ?? candidate.ai_state;
    const scheduled = latestInterview.get(candidate.id)?.scheduled_at ?? null;
    if (status === "action") return state === "escalated" || state === "waiting_reply" || state === "rescheduling";
    if (status === "confirmed") return Boolean(scheduled) && state !== "escalated";
    return true;
  });

  return <div className="workspace-page">
    <WorkspaceHeader title="Candidates" subtitle={`${candidates?.length ?? 0} total · Managed across every open role`}>
      <details className="quick-add"><summary className="button button-secondary"><Icons.plus size={17}/> Add candidate</summary><div className="quick-add-popover"><form action={addCandidate} className="quick-candidate-form"><label><span>Name</span><input name="name" required placeholder="Candidate name"/></label><label><span>Email</span><input name="email" type="email" required placeholder="name@example.com"/></label><div className="phone-pair"><label><span>Code</span><input name="countryCode" required defaultValue="+1"/></label><label><span>WhatsApp / phone</span><input name="phone" required placeholder="5551234567"/></label></div><label><span>Timezone</span><input name="timeZone" placeholder="America/New_York"/></label><label><span>Notes</span><textarea name="notes" rows={2}/></label><button className="button button-primary" type="submit">Add candidate</button></form></div></details>
    </WorkspaceHeader>
    {params.error ? <div className="alert alert-error">{params.error}</div> : null}
    <div className="filter-tabs"><Link className={status === "all" ? "active" : ""} href="/candidates?status=all">All</Link><Link className={status === "action" ? "active" : ""} href="/candidates?status=action">Needs Action</Link><Link className={status === "confirmed" ? "active" : ""} href="/candidates?status=confirmed">Confirmed</Link></div>
    <section className="workspace-card table-card">
      {visible.length ? <div className="reference-table candidate-table"><div className="reference-tr reference-th"><span>NAME</span><span>ROLE</span><span>CONTACT</span><span>STATUS</span><span>FIT SCORE</span><span/></div>{visible.map((candidate) => { const interview = latestInterview.get(candidate.id); const role = interview?.role_title || candidate.job_position || "—"; const state = interview?.ai_state ?? candidate.ai_state; const scheduled = interview?.scheduled_at ?? null; const tone = statusTone(state, scheduled); const label = state === "completed" && !scheduled ? "Withdrawn" : interviewStatusLabel(state, scheduled); return <div className="reference-tr" key={candidate.id}>
        <span className="person-cell"><span className="square-avatar">{initials(candidate.name)}</span><span><b>{candidate.name}</b></span></span>
        <span className="muted-cell">{role}</span>
        <span className="contact-cell"><small>{candidate.country_code}{candidate.phone}</small><small>{candidate.email}</small></span>
        <span><span className={`status-chip ${label === "Withdrawn" ? "neutral" : tone}`}>{label}</span></span>
        <span className="score-cell"><span className="score-track"><i style={{ width: `${Math.max(0, Math.min(100, candidate.score ?? 0))}%` }}/></span><b>{candidate.score ?? 0}</b></span>
        <Link className="icon-link" href={`/interviews/new?candidate=${encodeURIComponent(candidate.id)}`} aria-label={`Create interview for ${candidate.name}`}><Icons.more size={18}/></Link>
      </div>})}</div> : <div className="empty-state"><h3>No candidates in this view</h3><p>Add a candidate or change the filter.</p></div>}
    </section>
  </div>;
}
