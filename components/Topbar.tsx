"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUI } from "@/context/UIContext";

interface Counts {
  interviews: number;
  candidates: number;
  unreadConversations: number;
  conversationsTotal: number;
  interviewsThisWeek: number;
  candidatesAddedThisWeek: number;
  integrationsConnected: number;
}

function formatToday(d: Date): string {
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Builds the title + subtitle for the current route from real, live data — no hardcoded numbers or dates. */
function resolveMeta(pathname: string, today: string, counts: Counts | null): { title: string; date: string } {
  const c = counts;
  switch (pathname) {
    case "/":
      return { title: "Dashboard", date: today };
    case "/candidates":
      return {
        title: "Candidates",
        date: c ? `${c.candidates} total${c.candidatesAddedThisWeek > 0 ? ` · ${c.candidatesAddedThisWeek} added this week` : ""}` : "…",
      };
    case "/interviews":
      return { title: "Interviews", date: c ? `${c.interviewsThisWeek} scheduled this week` : "…" };
    case "/conversations":
      return { title: "Conversations", date: c ? `${c.conversationsTotal} thread${c.conversationsTotal === 1 ? "" : "s"}` : "…" };
    case "/calendar":
      return { title: "Calendar", date: today };
    case "/analytics":
      return { title: "Analytics", date: "Last 30 days" };
    case "/settings":
      return { title: "Settings", date: "Manage your preferences" };
    case "/integrations":
      return { title: "Integrations", date: c ? `${c.integrationsConnected} connected` : "…" };
    default:
      return { title: "Schela", date: "" };
  }
}

export default function Topbar() {
  const pathname = usePathname();
  const { openWizard, toggleNotifications, openGlobalSearch } = useUI();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [today, setToday] = useState(() => formatToday(new Date()));

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      fetch("/api/counts")
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setCounts(d); })
        .catch(() => {});
    }
    refresh();
    // Real-time-ish: pick up new interviews/candidates/conversations without
    // a manual refresh, and roll the date over at midnight if the tab stays open.
    const id = setInterval(() => { refresh(); setToday(formatToday(new Date())); }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pathname]);

  const meta = resolveMeta(pathname, today, counts);

  return (
    <div className="topbar">
      <div>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-date">{meta.date}</div>
      </div>

      <div className="omnisearch">
        <span className="material-symbols-outlined">search</span>
        <input type="text" placeholder="Search candidates, interviews… (⌘K)" onClick={openGlobalSearch} readOnly />
      </div>

      <div className="topbar-icons">
        <button className="topbar-icon-btn tt" data-tooltip="Notifications" onClick={toggleNotifications}>
          <span className="material-symbols-outlined">notifications</span>
          <span className="dot-notify" />
        </button>
      </div>

      <div className="topbar-actions">
        <button className="btn btn-solid" onClick={openWizard}>
          <span className="material-symbols-outlined">add</span>New Interview
        </button>
      </div>
    </div>
  );
}
