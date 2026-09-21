import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { WorkspaceHeader } from "@/components/workspace-header";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ interview?: string }> }) {
  const params = await searchParams;
  const { supabase, profile } = await requireAppUser();
  let query = supabase.from("conversations").select("id").eq("org_id", profile.org_id!);
  if (params.interview && /^\d+$/.test(params.interview)) query = query.eq("interview_id", Number(params.interview));
  const { data } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.id) redirect(`/inbox/${data.id}`);
  return <div className="workspace-page"><WorkspaceHeader title="Conversations" subtitle="Every message Schela has sent or received, in one place"/><section className="workspace-card empty-conversation-card"><div className="empty-state"><h3>No conversations yet</h3><p>Create an interview and Schela will open a unified WhatsApp/email thread here.</p></div></section></div>;
}
