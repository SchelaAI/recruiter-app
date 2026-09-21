import { requireAppUser } from "@/lib/auth";
import { WorkspaceHeader } from "@/components/workspace-header";
import { SettingsNav } from "@/components/settings-nav";
import { initials } from "@/lib/format";
import { addInterviewer, removeInterviewer, updateCompany } from "./actions";

export default async function CompanySettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; welcome?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireAppUser();
  const orgId = profile.org_id!;
  const [{ data: org }, { data: interviewers }] = await Promise.all([
    supabase.from("organizations").select("name,website").eq("id", orgId).single(),
    supabase.from("interviewers").select("id,name,role,email,availability,created_at").eq("org_id", orgId).order("created_at"),
  ]);
  return <div className="workspace-page">
    <WorkspaceHeader title="Settings" subtitle="Configure how Schela sounds, schedules, and escalates"/>
    {params.error ? <div className="alert alert-error">{params.error}</div> : null}
    {params.welcome ? <div className="alert alert-success">Workspace created. Add the interviewers Schela is allowed to schedule candidates with.</div> : null}
    <div className="settings-workspace">
      <SettingsNav active="company"/>
      <section className="workspace-card settings-content company-settings-content">
        <div className="settings-title"><h2>Company</h2><p>Your hiring brand and the interviewers Schela can coordinate with.</p></div>
        <form action={updateCompany} className="settings-form compact-settings-form"><div className="settings-grid"><label className="settings-field"><span>Company name</span><input name="name" required defaultValue={org?.name ?? ""}/></label><label className="settings-field"><span>Website</span><input name="website" type="url" defaultValue={org?.website ?? ""} placeholder="https://company.com"/></label></div><button className="button button-primary settings-save" type="submit">Save company</button></form>
        <div className="settings-divider"/>
        <div className="settings-title"><h2>Interviewers</h2><p>Add the hiring managers or panel members available when creating interviews.</p></div>
        <form action={addInterviewer} className="interviewer-add-row"><input name="name" required placeholder="Name"/><input name="role" placeholder="Role, e.g. Engineering Lead"/><input name="email" type="email" placeholder="Email"/><button className="button button-primary" type="submit">Add interviewer</button></form>
        <div className="interviewer-list">{interviewers?.length ? interviewers.map((member) => <div className="interviewer-row" key={member.id}><span className="square-avatar">{initials(member.name)}</span><span className="interviewer-copy"><b>{member.name}</b><small>{member.role || "Interviewer"}{member.email ? ` · ${member.email}` : ""}</small></span><span className="status-chip green">{member.availability || "Available"}</span><form action={removeInterviewer}><input type="hidden" name="id" value={member.id}/><button className="text-button danger" type="submit">Remove</button></form></div>) : <div className="empty-mini">No interviewers added yet.</div>}</div>
      </section>
    </div>
  </div>;
}
