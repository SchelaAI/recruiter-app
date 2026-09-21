import Image from "next/image";
import { signOut } from "@/app/(auth)/actions";
import { initials } from "@/lib/format";
import { SidebarNav } from "./sidebar-nav";
import { Icons } from "./ui-icons";

type Props = { company: string; userName: string };

export function Sidebar({ company, userName }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Image src="/schela-mark.png" width={40} height={40} alt="Schela" priority />
        <div><strong>Schela</strong><span>RECRUITING<br/>WORKSPACE</span></div>
      </div>
      <SidebarNav />
      <div className="sidebar-bottom">
        <div className="schela-state"><span className="state-dot"/><div><b>Schela is active</b><small>{company}</small></div></div>
        <div className="sidebar-user">
          <span className="avatar avatar-neutral">{initials(userName)}</span>
          <div><b>{userName}</b><small>Recruiter</small></div>
          <form action={signOut}><button type="submit" className="sidebar-signout" aria-label="Sign out"><Icons.logout size={19}/></button></form>
        </div>
      </div>
    </aside>
  );
}
