"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/context/UIContext";
import { STATUS_LABEL } from "@/lib/data";
import type { Candidate, Interview, Conversation } from "@/lib/types";

interface ResultRow {
  key: string;
  section: "Candidates" | "Interviews" | "Conversations";
  title: string;
  sub: string;
  icon: string;
  action: () => void;
}

export default function GlobalSearch() {
  const ui = useUI();
  const { globalSearchOpen, closeGlobalSearch } = ui;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.openGlobalSearch();
      }
      if (e.key === "Escape" && globalSearchOpen) closeGlobalSearch();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearchOpen]);

  useEffect(() => {
    if (globalSearchOpen) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 100);
      Promise.all([
        fetch("/api/candidates").then((r) => r.json()),
        fetch("/api/interviews").then((r) => r.json()),
        fetch("/api/conversations").then((r) => r.json()),
      ]).then(([c, i, v]) => {
        setCandidates(c.candidates ?? []);
        setInterviews(i.interviews ?? []);
        setConversations(v.conversations ?? []);
      });
    }
  }, [globalSearchOpen]);

  const results: ResultRow[] = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const rows: ResultRow[] = [];

    candidates.filter((c) => c.name.toLowerCase().includes(q) || (c.jobPosition || "").toLowerCase().includes(q)).forEach((c) => {
      rows.push({ key: `c-${c.id}`, section: "Candidates", title: c.name, sub: c.jobPosition || "No role yet", icon: "person", action: () => ui.openCandidateDrawer(c.id) });
    });

    interviews.filter((iv) => iv.cand.toLowerCase().includes(q) || iv.jobPosition.toLowerCase().includes(q)).forEach((iv) => {
      rows.push({ key: `i-${iv.id}`, section: "Interviews", title: `${iv.cand} — ${iv.jobPosition}`, sub: `${iv.time} · ${STATUS_LABEL[iv.aiState]}`, icon: "event", action: () => ui.openInterviewDrawer(iv.id) });
    });

    conversations.filter((c) => c.candName.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)).forEach((c) => {
      rows.push({ key: `v-${c.id}`, section: "Conversations", title: c.candName, sub: c.preview, icon: "forum", action: () => router.push(`/conversations?open=${c.id}`) });
    });

    return rows;
  }, [query, candidates, interviews, conversations, ui, router]);

  useEffect(() => setActiveIdx(0), [query]);

  function runActive() {
    if (query.trim() && results[activeIdx]) {
      results[activeIdx].action();
      closeGlobalSearch();
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const total = results.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, total - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); runActive(); }
    if (e.key === "Tab" && total > 0) { e.preventDefault(); setActiveIdx(0); }
    if (e.key === "Backspace" && query === "") { closeGlobalSearch(); }
  }

  if (!globalSearchOpen) return null;

  const sections = ["Candidates", "Interviews", "Conversations"] as const;
  let runningIdx = -1;

  return (
    <>
      <div className="overlay-bg show" onClick={closeGlobalSearch} />
      <div className={`gsearch-overlay-wrap ${globalSearchOpen ? "show" : ""}`}>
        <div className="gsearch-box">
          <div className="gsearch-input-row">
            <span className="material-symbols-outlined">search</span>
            <input
              ref={inputRef}
              placeholder="Search candidates, interviews, conversations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {query && <span className="material-symbols-outlined gsearch-clear" onClick={() => setQuery("")}>close</span>}
          </div>

          <div className="gsearch-body">
            {!query.trim() && (
              <div className="gsearch-empty">
                <span className="material-symbols-outlined">search</span>
                <div className="gsearch-empty-text">Start typing to search</div>
              </div>
            )}

            {query.trim() && results.length === 0 && (
              <div className="gsearch-empty">
                <span className="material-symbols-outlined">search_off</span>
                <div className="gsearch-empty-text">No results for &quot;{query}&quot;</div>
              </div>
            )}

            {query.trim() && results.length > 0 && sections.map((section) => {
              const sectionRows = results.filter((r) => r.section === section);
              if (sectionRows.length === 0) return null;
              return (
                <div key={section}>
                  <div className="gsearch-section-label">{section}</div>
                  {sectionRows.map((r) => {
                    runningIdx++;
                    const idx = runningIdx;
                    return (
                      <div key={r.key} className={`gsearch-row ${activeIdx === idx ? "active" : ""}`} onMouseEnter={() => setActiveIdx(idx)} onClick={() => { r.action(); closeGlobalSearch(); }}>
                        <span className="material-symbols-outlined">{r.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div className="gsearch-row-title">{r.title}</div>
                          <div className="gsearch-row-sub">{r.sub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
