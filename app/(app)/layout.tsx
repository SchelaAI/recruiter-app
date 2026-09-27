import { requireAppUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAppUser();

  return (
    <div className="app-shell">
      <Sidebar company={profile.company ?? "Company"} userName={profile.full_name || profile.email} />
      <main className="app-main">{children}</main>
    </div>
  );
}
