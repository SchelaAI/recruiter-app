"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUI } from "@/context/UIContext";
import { signOut } from "@/app/(auth)/actions";

const NAV_GROUPS = [
  {
    label: "Coordinate",
    items: [
      { href: "/", label: "Dashboard", icon: "grid_view" },
      { href: "/interviews", label: "Interviews", icon: "event", countKey: "interviews" as const },
      { href: "/conversations", label: "Conversations", icon: "forum", countKey: "unreadConversations" as const, round: true },
      { href: "/candidates", label: "Candidates", icon: "group", countKey: "candidates" as const },
      { href: "/calendar", label: "Calendar", icon: "calendar_month" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/integrations", label: "Integrations", icon: "hub" },
      { href: "/analytics", label: "Analytics", icon: "monitoring" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function Sidebar({
  userName = "",
  userRole = "Recruiter",
}: {
  userName?: string;
  userRole?: string;
}) {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, organization } = useUI();
  const [counts, setCounts] = useState<{ interviews: number; candidates: number; unreadConversations: number } | null>(null);
  const [activity, setActivity] = useState<{ liveCount: number; recent: { icon: string; text: string; time: string }[] } | null>(null);
  const companyName = organization?.name?.trim() || "Schela";
  const poweredBySchela = organization?.poweredBySchela ?? true;

  useEffect(() => {
    fetch("/api/counts").then((r) => r.json()).then(setCounts).catch(() => {});
    fetch("/api/live-activity").then((r) => r.json()).then(setActivity).catch(() => {});
  }, []);

  return (
    <>
      <div className={`sidebar-overlay ${sidebarOpen ? "show" : ""}`} onClick={() => toggleSidebar(false)} />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
        <div className="sidebar-header">
          <div className="logo-row">
            <div className="logo-mark">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#fff" />
              </svg>
            </div>
            <div className="logo-text-col">
              <div className="logo-text">{companyName}</div>
              <div className="logo-sub">{poweredBySchela ? "Powered by Schela" : "AI Recruiting Coordinator"}</div>
            </div>
          </div>
        </div>

        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              const count = "countKey" in item && item.countKey && counts ? counts[item.countKey] : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? "active" : ""}`}
                  onClick={() => toggleSidebar(false)}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  {item.label}
                  <span className="spacer" />
                  {count !== undefined && count > 0 && (
                    <span className={"round" in item && item.round ? "badge-round" : "badge-square"}>{count}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="status-widget">
          <div className="status-widget-top">
            <div className="status-widget-title">
              <svg className="bolt-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2L4 14H11L10 22L20 9H13L13 2Z" fill="currentColor" />
              </svg>
              Schela is active
            </div>
            <span className="status-pill-live">{activity ? `${activity.liveCount} live` : "…"}</span>
          </div>
          <div className="feed-log">
            {!activity || activity.recent.length === 0 ? (
              <div className="feed-log-item" style={{ opacity: 0.6 }}>No activity yet</div>
            ) : (
              activity.recent.map((item, i) => (
                <div className="feed-log-item" key={i}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, marginRight: 4, verticalAlign: -2 }}>{item.icon}</span>
                  {item.text}
                  <span className="feed-log-time">{item.time}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="account-footer">
          <div className="avatar-circle">{initialsFrom(userName)}</div>
          <div>
            <div className="account-name">{userName}</div>
            <div className="account-role">{userRole}</div>
          </div>
          <span
            className="material-symbols-outlined"
            style={{ cursor: "pointer" }}
            onClick={() => signOut()}
            title="Sign out"
          >
            logout
          </span>
        </div>
      </aside>
    </>
  );
}
