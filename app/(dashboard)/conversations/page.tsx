"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useUI } from "@/context/UIContext";
import { getAvatarColorClass } from "@/lib/avatarColor";
import type { Conversation, Message } from "@/lib/types";

/** Small curated palette — avoids pulling in a heavyweight emoji-picker dependency. */
const EMOJI_SET = [
  "👋","😊","🙏","👍","🎉","✅","❌","⏰","📅","📌",
  "😀","😅","🤝","💼","📞","✉️","🔗","⭐","🔥","💡",
  "🙌","👏","😉","🤔","😌","🚀","📎","📄","🗓️","☑️",
];

function formatBytes(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Renders an attached file: inline preview for images, a download row for everything else. */
function Attachment({ m }: { m: Message }) {
  if (!m.attachmentUrl) return null;
  const isImage = (m.attachmentType ?? "").startsWith("image/");
  if (isImage) {
    return (
      <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" className="msg-attach-img-link">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.attachmentUrl} alt={m.attachmentName ?? "attachment"} className="msg-attach-img" />
      </a>
    );
  }
  return (
    <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" className="msg-attach-file">
      <span className="material-symbols-outlined">description</span>
      <span className="msg-attach-meta">
        <span className="msg-attach-name">{m.attachmentName ?? "File"}</span>
        <span className="msg-attach-size">{formatBytes(m.attachmentSize)}</span>
      </span>
      <span className="material-symbols-outlined">download</span>
    </a>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "wa", label: "WhatsApp" },
  { key: "em", label: "Email" },
  { key: "escalated", label: "Escalated" },
  { key: "unread", label: "Unread" },
];

function ConversationsInner() {
  const { openEscalation } = useUI();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("open");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [convSearch, setConvSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [dismissedSuggest, setDismissedSuggest] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    setConversations(data.conversations ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep the newest message in view as the thread grows or the user switches
  // conversations — the message list scrolls internally, so without this the
  // latest message can sit below the fold.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeId, conversations]);

  // Close the emoji popover when clicking anywhere else.
  useEffect(() => {
    if (!emojiOpen) return;
    const close = () => setEmojiOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [emojiOpen]);

  useEffect(() => {
    if (deepLinkId) {
      setActiveId(deepLinkId);
    } else if (conversations.length && !activeId) {
      setActiveId(conversations[0].id);
    }
  }, [deepLinkId, conversations, activeId]);

  const list = useMemo(() => {
    const q = convSearch.trim().toLowerCase();
    return conversations.filter((c) => {
      if (q && !(`${c.candName} ${c.preview}`.toLowerCase().includes(q))) return false;
      if (filter === "all") return true;
      if (filter === "unread") return c.unread;
      if (filter === "escalated") return c.escalated;
      return c.channel === filter;
    });
  }, [conversations, filter, convSearch]);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  async function sendDraft(text?: string) {
    const value = (text ?? draft).trim();
    if (!value || !active || sending) return;
    setSending(true);
    setDraft("");
    setDismissedSuggest((prev) => ({ ...prev, [active.id]: true }));
    try {
      await fetch(`/api/conversations/${active.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      await refresh();
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    if (!active || uploading) return;
    if (file.size > 16 * 1024 * 1024) {
      setUploadError("File is too large — 16MB maximum");
      setTimeout(() => setUploadError(null), 4000);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      // Anything already typed becomes the caption sent alongside the file.
      if (draft.trim()) form.append("caption", draft.trim());

      const res = await fetch(`/api/conversations/${active.id}/attachments`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setDraft("");
      await refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setTimeout(() => setUploadError(null), 5000);
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <div className="card conv-split" />;
  }

  return (
    <div className="card conv-split">
      <div className="conv-left">
        <div className="omnisearch conv-search">
          <span className="material-symbols-outlined">search</span>
          <input type="text" placeholder="Search conversations…" value={convSearch} onChange={(e) => setConvSearch(e.target.value)} />
        </div>
        <div className="conv-filter-tabs">
          {FILTERS.map((f) => (
            <span key={f.key} className={`filter-pill ${filter === f.key ? "active" : ""}`} style={{ whiteSpace: "nowrap" }} onClick={() => setFilter(f.key)}>
              {f.label}
            </span>
          ))}
        </div>
        <div className="conv-list">
          {list.length === 0 && (
            <div className="empty-state" style={{ padding: "40px 20px" }}>
              <span className="material-symbols-outlined">forum</span>
              <div className="empty-state-title">No conversations yet</div>
              <div className="empty-state-sub">They&apos;ll show up here once candidates start replying.</div>
            </div>
          )}
          {list.map((c) => (
            <div
              key={c.id}
              className={`conv-item ${c.unread ? "unread" : ""} ${activeId === c.id ? "active" : ""} ${c.escalated ? "escalated" : ""}`}
              onClick={() => setActiveId(c.id)}
            >
              <div className={`mini-avatar ${getAvatarColorClass(c.candId)}`}>{c.candId}</div>
              <div className="conv-item-body">
                <div className="conv-item-top">
                  <span className="conv-item-name">{c.candName}</span>
                  <span className="conv-item-time">{c.time}</span>
                </div>
                <div className="conv-item-preview">{c.preview}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card conv-right" style={{ boxShadow: "none", border: "none", borderLeft: "1px solid var(--border-soft)", borderRadius: 0 }}>
        {!active ? (
          <div className="empty-state" style={{ margin: "auto" }}>
            <span className="material-symbols-outlined">auto_awesome</span>
            <div className="empty-state-title">Select a conversation</div>
            <div className="empty-state-sub">Schela is handling {conversations.length} active thread{conversations.length === 1 ? "" : "s"}</div>
          </div>
        ) : (
          <>
            <div className="conv-thread-header">
              <div className="conv-thread-title">
                <div className={`mini-avatar ${getAvatarColorClass(active.candId)}`}>{active.candId}</div>
                <div>
                  <div className="conv-thread-name">{active.candName}</div>
                  <span className={`chan-pill ${active.channel}`} style={{ marginTop: 2 }}>
                    <span className="material-symbols-outlined">{active.channel === "wa" ? "chat" : "mail"}</span>
                    {active.channel === "wa" ? "WhatsApp" : "Email"}
                  </span>
                </div>
              </div>
              <div className="conv-thread-actions">
                {active.escalated && (
                  <button className="btn btn-sm btn-coral-outline" onClick={() => openEscalation(active.id)}>
                    <span className="material-symbols-outlined">priority_high</span>Escalation
                  </button>
                )}
              </div>
            </div>

            <div className="conv-messages">
              {active.messages.map((m, i) => (
                <div key={i} className={`conv-msg ${m.from} ${m.channel ?? ""}`}>
                  {m.from === "schela" && (
                    <div className="conv-msg-sender">
                      <span className="material-symbols-outlined">{m.senderKind === "ai" ? "auto_awesome" : "person"}</span>
                      {m.senderKind === "ai" ? "Schela · AI" : m.senderName || "Admin"}
                    </div>
                  )}
                  <div>
                    <Attachment m={m} />
                    {m.text}
                    {m.delivered === false && (
                      <span className="not-delivered-tag" title={m.deliveryError ?? "Delivery failed"}>
                        <span className="material-symbols-outlined">error</span>Not delivered
                      </span>
                    )}
                    <span className="conv-msg-time">{m.time}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {active.suggestedReply && !dismissedSuggest[active.id] && (
              <div className="ai-suggest-banner">
                <div className="ai-suggest-head"><span className="material-symbols-outlined">auto_awesome</span>Schela suggests:</div>
                <div className="ai-suggest-text">{active.suggestedReply}</div>
                <div className="ai-suggest-actions">
                  <button className="btn btn-sm btn-solid" onClick={() => sendDraft(active.suggestedReply)}>Use</button>
                  <button className="btn btn-sm btn-outline" onClick={() => setDraft(active.suggestedReply ?? "")}>Edit</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDismissedSuggest((p) => ({ ...p, [active.id]: true }))}>Dismiss</button>
                </div>
              </div>
            )}

            <div className="conv-input-row">
              {emojiOpen && (
                <div className="emoji-popover" onClick={(e) => e.stopPropagation()}>
                  {EMOJI_SET.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="emoji-cell"
                      onClick={() => { setDraft((d) => d + e); setEmojiOpen(false); }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {uploadError && <div className="upload-error-toast">{uploadError}</div>}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }}
              />
              <span
                className="material-symbols-outlined conv-icon-btn"
                title="Attach a file"
                style={uploading ? { opacity: 0.4, pointerEvents: "none" } : undefined}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "hourglass_top" : "attach_file"}
              </span>
              <span
                className={`material-symbols-outlined conv-icon-btn ${emojiOpen ? "active" : ""}`}
                title="Insert emoji"
                onClick={(e) => { e.stopPropagation(); setEmojiOpen((v) => !v); }}
              >
                mood
              </span>
              <div className="omnisearch">
                <input
                  type="text"
                  placeholder="Type a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendDraft(); }}
                />
              </div>
              <div className="conv-send-btn" onClick={() => sendDraft()}>
                <span className="material-symbols-outlined">send</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<div className="card conv-split" />}>
      <ConversationsInner />
    </Suspense>
  );
}
