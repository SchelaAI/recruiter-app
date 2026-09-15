import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const name = profile?.full_name?.split(" ")[0] || "there";

  return (
    <div className="welcome-wrap">
      <div className="welcome-card">
        <div className="welcome-circle">
          <span className="material-symbols-outlined" style={{ fontSize: 30 }}>auto_awesome</span>
        </div>
        <div className="welcome-headline">You&apos;re all set, {name}.</div>
        <div className="welcome-sub">
          Schela is ready to start coordinating interviews over WhatsApp and Email. Add your first candidate to see it in action.
        </div>
        <Link href="/" className="btn-primary" style={{ textDecoration: "none" }}>
          Go to dashboard →
        </Link>
      </div>
    </div>
  );
}
