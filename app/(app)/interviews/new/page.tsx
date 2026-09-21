import Link from "next/link";
import { requireAppUser } from "@/lib/auth";
import { WorkspaceHeader } from "@/components/workspace-header";
import { createInterview } from "../actions";

export default async function NewInterviewPage({ searchParams }: { searchParams: Promise<{ candidate?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;
  const [{ data: candidates }, { data: interviewers }] = await Promise.all([
    supabase.from("candidates").select("id,name,email").eq("org_id", orgId).order("name"),
    supabase.from("interviewers").select("id,name,role").eq("org_id", orgId).order("name"),
  ]);
  const ready = Boolean(candidates?.length && interviewers?.length);
  return <div className="workspace-page form-workspace-page">
    <WorkspaceHeader title="New Interview" subtitle="Start a coordination flow. The candidate chooses the real time through your connected scheduling provider." showNewInterview={false}/>
    {params.error ? <div className="alert alert-error">{params.error}</div> : null}
    {!candidates?.length ? <div className="alert alert-info">Add a candidate before creating an interview. <Link href="/candidates">Go to candidates →</Link></div> : null}
    {!interviewers?.length ? <div className="alert alert-info">Add at least one interviewer in Company settings first. <Link href="/settings/company">Add interviewer →</Link></div> : null}
    <section className="workspace-card create-interview-card"><div className="step-rail"><div className="active"><span>01</span><b>Candidate</b><small>Who are we coordinating?</small></div><div className="active"><span>02</span><b>Interview</b><small>Who, how long, which role?</small></div><div className="active"><span>03</span><b>Outreach</b><small>Start on WhatsApp or email.</small></div></div><form action={createInterview} className="create-interview-form"><label><span>Candidate</span><select name="candidateId" required defaultValue={params.candidate ?? ""}><option value="" disabled>Select candidate</option>{candidates?.map((candidate)=><option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.email}</option>)}</select></label><label><span>Role / position</span><input name="roleTitle" required placeholder="Senior Software Engineer"/></label><div className="two-fields"><label><span>Interviewer</span><select name="interviewerId" required defaultValue=""><option value="" disabled>Select interviewer</option>{interviewers?.map((person)=><option key={person.id} value={person.id}>{person.name}{person.role ? ` · ${person.role}` : ""}</option>)}</select></label><label><span>Duration</span><select name="duration" defaultValue="45"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label></div><div className="two-fields"><label><span>Scheduling provider</span><select name="format" defaultValue="Calendly"><option>Calendly</option></select></label><label><span>First outreach channel</span><select name="channel" defaultValue={profile.channel_preference === "em" ? "em" : "wa"}><option value="wa">WhatsApp</option><option value="em">Email</option></select></label></div><button disabled={!ready} className="button button-primary create-submit" type="submit">Create interview & start coordination</button></form></section>
  </div>;
}
