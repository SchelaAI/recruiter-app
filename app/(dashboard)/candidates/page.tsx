"use client";

import { useEffect, useState } from "react";
import { useUI } from "@/context/UIContext";
import { getAvatarColorClass } from "@/lib/avatarColor";
import StatusBadge from "@/components/StatusBadge";
import type { Candidate, AiState } from "@/lib/types";

const FILTERS: { key: "all" | "action" | AiState; label: string }[] = [
  { key: "all", label: "All" },
  { key: "action", label: "Needs you" },
  { key: "calendar_updated", label: "Calendar updated" },
  { key: "waiting_reply", label: "Waiting for reply" },
];

export default function CandidatesPage() {
  const { openCandidateDrawer, openAddCandidate, candidatesVersion, bumpCandidatesVersion } = useUI();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [filter, setFilter] = useState<"all" | "action" | AiState>("all");
  const [search, setSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/candidates")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setCandidates(data.candidates); });
    return () => { cancelled = true; };
  }, [candidatesVersion]);

  useEffect(() => {
    function onClickAway() { setOpenDropdown(null); }
    document.addEventListener("click", onClickAway);
    return () => document.removeEventListener("click", onClickAway);
  }, []);

  async function deleteCandidate(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    setConfirmDeleteId(null);
    setOpenDropdown(null);
    try {
      await fetch(`/api/candidates/${id}`, { method: "DELETE" });
      bumpCandidatesVersion();
    } catch {
      // Non-fatal — the row-menu simply closes; the list stays accurate on next load.
    }
  }

  const loaded = candidates !== null;
  const q = search.trim().toLowerCase();
  const list = (candidates ?? []).filter((c) => {
    if (filter === "all") { /* no-op */ }
    else if (filter === "action") { if (c.aiState !== "escalated") return false; }
    else if (c.aiState !== filter) return false;
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.jobPosition.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  return (
    <div className="card panel">
      <div className="section-header">
        <div className="section-title">All candidates <span className="section-badge">{candidates?.length ?? "…"}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="omnisearch" style={{ flex: 1, maxWidth: 260 }}>
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Search candidates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-pills">
            {FILTERS.map((f) => (
              <span key={f.key} className={`filter-pill ${filter === f.key ? "active" : ""}`} onClick={() => setFilter(f.key)}>
                {f.label}
              </span>
            ))}
          </div>
          <button className="btn btn-solid" onClick={openAddCandidate}>
            <span className="material-symbols-outlined">add</span>Add Candidate
          </button>
        </div>
      </div>

      {!loaded && (
        <div>
          <div className="skel-row" /><div className="skel-row" /><div className="skel-row" />
          <div className="skel-row" /><div className="skel-row" /><div className="skel-row" />
        </div>
      )}

      {loaded && list.length > 0 && (
        <table className="data-table">
          <thead>
            <tr><th>Candidate</th><th>Contact</th><th>AI State</th><th>Channel</th><th>Last active</th><th>AI score</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} onClick={() => openCandidateDrawer(c.id)}>
                <td>
                  <div className="cell-candidate">
                    <div className={`mini-avatar ${getAvatarColorClass(c.id)}`}>{c.id}</div>
                    <div><div className="cand-name">{c.name}</div><div className="cand-role">{c.jobPosition}</div></div>
                  </div>
                </td>
                <td><div className="contact-cell">{c.countryCode} {c.phone}<br />{c.email}</div></td>
                <td><StatusBadge state={c.aiState} /></td>
                <td>
                  <span className={`chan-pill ${c.preferredChannel}`}>
                    <span className="material-symbols-outlined">{c.preferredChannel === "wa" ? "chat" : "mail"}</span>
                    {c.preferredChannel === "wa" ? "WhatsApp" : "Email"}
                  </span>
                </td>
                <td className="cell-time" style={{ fontWeight: 600, color: "var(--slate)" }}>{c.active}</td>
                <td>
                  <div className="score-cell">
                    <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${c.score}%` }} /></div>
                    <span className="score-num">{c.score}</span>
                  </div>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="row-actions">
                    <button className="dots-btn" onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === c.id ? null : c.id); }}>
                      <span className="material-symbols-outlined">more_horiz</span>
                    </button>
                    <div className={`row-dropdown ${openDropdown === c.id ? "show" : ""}`}>
                      <a onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); openCandidateDrawer(c.id); }}>
                        <span className="material-symbols-outlined">visibility</span>View
                      </a>
                      <a
                        className="danger"
                        onClick={(e) => { e.stopPropagation(); deleteCandidate(c.id); }}
                      >
                        <span className="material-symbols-outlined">delete</span>
                        {confirmDeleteId === c.id ? "Confirm delete?" : "Delete"}
                      </a>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {loaded && list.length === 0 && (candidates?.length ?? 0) === 0 && (
        <div className="empty-state">
          <span className="material-symbols-outlined">group</span>
          <div className="empty-state-title">No candidates yet</div>
          <div className="empty-state-sub">Add your first candidate to start scheduling interviews through Schela.</div>
          <button className="btn btn-solid" onClick={openAddCandidate}>
            <span className="material-symbols-outlined">add</span>Add your first
          </button>
        </div>
      )}

      {loaded && list.length === 0 && (candidates?.length ?? 0) > 0 && (
        <div className="empty-state">
          <span className="material-symbols-outlined">search_off</span>
          <div className="empty-state-title">No matches</div>
          <div className="empty-state-sub">
            {search ? `Nothing matches "${search}"` : "No candidates match this filter"} — try a different search or filter.
          </div>
        </div>
      )}
    </div>
  );
}
