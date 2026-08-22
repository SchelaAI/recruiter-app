"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/context/UIContext";
import type { NotificationType, AppNotification } from "@/lib/types";

const FILTERS: { key: "all" | NotificationType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "escalated", label: "Escalations" },
  { key: "calendar_updated", label: "Calendar updated" },
  { key: "reminder_sent", label: "Reminders" },
];

const ICON: Record<NotificationType, { icon: string; color: string }> = {
  escalated: { icon: "priority_high", color: "coral" },
  calendar_updated: { icon: "check", color: "green" },
  rescheduling: { icon: "history", color: "orange" },
  reminder_sent: { icon: "schedule", color: "blue" },
};

export default function NotificationsPanel() {
  const { notificationsOpen, closeNotifications, openEscalation, openInterviewDrawer, openCandidateDrawer } = useUI();
  const [filter, setFilter] = useState<"all" | NotificationType>("all");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    setNotifications(data.notifications ?? []);
  }, []);

  useEffect(() => {
    if (notificationsOpen) refresh();
  }, [notificationsOpen, refresh]);

  useEffect(() => {
    if (!notificationsOpen) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closeNotifications();
      }
    }
    const t = setTimeout(() => document.addEventListener("click", onClick), 0);
    return () => { clearTimeout(t); document.removeEventListener("click", onClick); };
  }, [notificationsOpen, closeNotifications]);

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
  }

  function openNotification(n: AppNotification) {
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
    fetch(`/api/notifications/${n.id}/read`, { method: "POST" });

    if (n.type === "escalated" && n.linkConvId) {
      openEscalation(n.linkConvId);
    } else if (n.linkInterviewId) {
      closeNotifications();
      openInterviewDrawer(n.linkInterviewId);
    } else if (n.linkConvId) {
      closeNotifications();
      router.push(`/conversations?open=${n.linkConvId}`);
    } else if (n.linkCandId) {
      closeNotifications();
      openCandidateDrawer(n.linkCandId);
    }
  }

  const list = notifications.filter((n) => filter === "all" || n.type === filter);

  return (
    <div className={`notif-panel ${notificationsOpen ? "show" : ""}`} ref={panelRef}>
      <div className="notif-header">
        <div className="notif-header-title">Notifications</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a className="link-arrow" onClick={markAllRead} style={{ cursor: "pointer" }}>Mark all read</a>
          <span className="close-x" onClick={closeNotifications}><span className="material-symbols-outlined">close</span></span>
        </div>
      </div>
      <div className="notif-filter-pills">
        {FILTERS.map((f) => (
          <span key={f.key} className={`filter-pill ${filter === f.key ? "active" : ""}`} style={{ whiteSpace: "nowrap" }} onClick={() => setFilter(f.key)}>
            {f.label}
          </span>
        ))}
      </div>
      <div className="notif-list">
        {list.length === 0 && (
          <div className="empty-state" style={{ padding: "40px 20px" }}>
            <span className="material-symbols-outlined">notifications</span>
            <div className="empty-state-title">Nothing here yet</div>
          </div>
        )}
        {list.map((n) => {
          const meta = ICON[n.type];
          return (
            <div key={n.id} className={`notif-row ${n.unread ? "unread" : ""}`} onClick={() => openNotification(n)}>
              <div className={`activity-circle ${meta.color}`}><span className="material-symbols-outlined">{meta.icon}</span></div>
              <div>
                <div className="notif-row-title">{n.title}</div>
                <div className="notif-row-desc">{n.desc}</div>
                <div className="notif-row-time">{n.time} ago</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="notif-see-all" onClick={() => { closeNotifications(); router.push("/interviews"); }} style={{ cursor: "pointer" }}>See all →</div>
    </div>
  );
}
