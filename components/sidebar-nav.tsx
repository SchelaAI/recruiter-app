"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "./ui-icons";

const coordinate = [
  { href: "/dashboard", label: "Dashboard", icon: Icons.dashboard },
  { href: "/interviews", label: "Interviews", icon: Icons.interviews },
  { href: "/inbox", label: "Conversations", icon: Icons.chat },
  { href: "/candidates", label: "Candidates", icon: Icons.candidates },
  { href: "/calendar", label: "Calendar", icon: Icons.calendar },
] as const;

const manage = [
  { href: "/settings/integrations", label: "Integrations", icon: Icons.plug },
  { href: "/analytics", label: "Analytics", icon: Icons.analytics },
  { href: "/settings", label: "Settings", icon: Icons.settings },
] as const;

function activeFor(pathname: string, href: string) {
  if (href === "/inbox") return pathname.startsWith("/inbox");
  if (href === "/settings/integrations") return pathname.startsWith("/settings/integrations");
  if (href === "/settings") return pathname === "/settings" || pathname.startsWith("/settings/company");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Group({ title, items }: { title: string; items: readonly { href: string; label: string; icon: (props: { size?: number }) => React.ReactNode }[] }) {
  const pathname = usePathname();
  return (
    <div className="sidebar-group">
      <span className="sidebar-group-label">{title}</span>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeFor(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function SidebarNav() {
  return <><Group title="COORDINATE" items={coordinate} /><Group title="MANAGE" items={manage} /></>;
}
