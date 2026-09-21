import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { WorkspaceHeader } from "@/components/workspace-header";
import { initials } from "@/lib/format";
import { interviewStatusLabel, statusTone } from "@/lib/ui";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;
  const [{ data: candidates }, { data: interviews }] = await Promise.all([
    supabase.from("candidates").select("id,name,email,phone,country_code").eq("org_id", orgId).order("created_at", { ascending:false }).limit(200),
    supabase.from("interviews").select("id,candidate_id,role_title,interviewer,ai_state,scheduled_at").eq("org_id", orgId).order("created_at", { ascending:false }).limit(200),
  ]);
  const candidateMap = new Map((candidates ?? []).map((c) => [c.id, c]));
  const matchedCandidates = q ? (candidates ?? []).filter((c) => `${c.name} ${c.email} ${c.country_code}${c.phone}`.toLowerCase().includes(q)).slice(0,20) : [];
  const matchedInterviews = q ? (interviews ?? []).filter((i) => `${i.role_title ?? ""} ${i.interviewer} ${candidateMap.get(i.candidate_id)?.name ?? ""}`.toLowerCase().includes(q)).slice(0,20) : [];
  return <div className="workspace-page"><WorkspaceHeader title="Search" subtitle={q ? `Results for “${params.q}”` : "Search candidates and interviews across your workspace"} showNewInterview={false}/>{!q ? <section className="workspace-card"><div className="empty-state"><h3>Start with the search box above</h3><p>Search by candidate name, email, role, or interviewer.</p></div></section> : <div className="search-results-grid"><section className="workspace-card search-results"><div className="card-title-row"><h2>Candidates</h2><span>{matchedCandidates.length}</span></div>{matchedCandidates.length ? matchedCandidates.map((c)=><Link className="search-result-row" key={c.id} href={`/interviews/new?candidate=${encodeURIComponent(c.id)}`}><span className="square-avatar">{initials(c.name)}</span><span><b>{c.name}</b><small>{c.email}</small></span></Link>) : <div className="empty-mini">No candidate matches.</div>}</section><section className="workspace-card search-results"><div className="card-title-row"><h2>Interviews</h2><span>{matchedInterviews.length}</span></div>{matchedInterviews.length ? matchedInterviews.map((i)=>{const c=candidateMap.get(i.candidate_id); return <Link className="search-result-row" key={i.id} href={`/inbox?interview=${i.id}`}><span className="square-avatar">{initials(c?.name ?? i.candidate_id)}</span><span><b>{c?.name ?? i.candidate_id}</b><small>{i.role_title ?? "Interview"} · {i.interviewer}</small></span><span className={`status-chip ${statusTone(i.ai_state,i.scheduled_at)}`}>{interviewStatusLabel(i.ai_state,i.scheduled_at)}</span></Link>}) : <div className="empty-mini">No interview matches.</div>}</section></div>}</div>;
}
