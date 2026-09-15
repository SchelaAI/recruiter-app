import type { Metadata } from "next";
import "./dashboard.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UIProvider } from "@/context/UIContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import MobileTopbar from "@/components/MobileTopbar";
import CommandBar from "@/components/CommandBar";
import PageTransition from "@/components/PageTransition";
import NewInterviewWizard from "@/components/modals/NewInterviewWizard";
import AddCandidateModal from "@/components/modals/AddCandidateModal";
import CandidateDrawer from "@/components/modals/CandidateDrawer";
import InterviewDrawer from "@/components/modals/InterviewDrawer";
import RescheduleModal from "@/components/modals/RescheduleModal";
import CancelModal from "@/components/modals/CancelModal";
import EscalationDetail from "@/components/modals/EscalationDetail";
import NotificationsPanel from "@/components/modals/NotificationsPanel";
import AskSchelaDrawer from "@/components/modals/AskSchelaDrawer";
import GlobalSearch from "@/components/modals/GlobalSearch";
import GlobalShortcuts from "@/components/GlobalShortcuts";

export const metadata: Metadata = {
  title: "Schela — Your AI Recruiting Coordinator",
  description: "Schela coordinates interviews over WhatsApp and Email so you can focus on hiring decisions.",
};

// This is the one place that enforces "onboarding must be complete before
// the dashboard is reachable." Deliberately NOT done in middleware — that
// runs on every single request including static assets, and we don't want
// a database round-trip on every request just to check one boolean.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_role, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/onboarding/step-1");

  const userName = profile.full_name || user.email?.split("@")[0] || "there";
  const userRole = profile.onboarding_role || "Recruiter";

  return (
    <UIProvider>
      <GlobalShortcuts />
      <div className="app">
        <Sidebar userName={userName} userRole={userRole} />
        <main className="main">
          <MobileTopbar />
          <Topbar />
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <CommandBar />

      <NewInterviewWizard />
      <AddCandidateModal />
      <CandidateDrawer />
      <InterviewDrawer />
      <RescheduleModal />
      <CancelModal />
      <EscalationDetail />
      <NotificationsPanel />
      <AskSchelaDrawer />
      <GlobalSearch />
    </UIProvider>
  );
}
