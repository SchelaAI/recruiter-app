"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "@/context/UIContext";
import { ASK_SCHELA_PROMPTS } from "@/lib/data";
import type { Candidate, Interview } from "@/lib/types";

interface ChatTurn {
  role: "user" | "ai";
  text: string;
  intent?: string;
  confidence?: number;
  executed?: boolean;
}

function useTypewriter(text: string, active: boolean) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!active) return;
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 14);
    return () => clearInterval(id);
  }, [text, active]);
  return shown;
}

const QUICK_ACTIONS = ASK_SCHELA_PROMPTS.filter((p) => p.type === "action");
const SUGGESTED_QUESTIONS = ASK_SCHELA_PROMPTS.filter((p) => p.type === "question");

export default function AskSchelaDrawer() {
  const ui = useUI();
  const { askSchelaExpanded, setAskSchelaExpanded, openWizardWithCandidate, openInterviewDrawer, openReschedule, askSchelaSeed, consumeAskSchelaSeed } = ui;
  const router = useRouter();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const lastAi = turns.length && turns[turns.length - 1].role === "ai" ? turns[turns.length - 1] : null;
  const typed = useTypewriter(lastAi?.text ?? "", typing);

  useEffect(() => {
    if (askSchelaExpanded) {
      setTimeout(() => inputRef.current?.focus(), 260);
      fetch("/api/candidates").then((r) => r.json()).then((d) => setCandidates(d.candidates ?? []));
      fetch("/api/interviews").then((r) => r.json()).then((d) => setInterviews(d.interviews ?? []));
    }
  }, [askSchelaExpanded]);

  // If the command bar handed us a query, run it once on open.
  useEffect(() => {
    if (askSchelaExpanded && askSchelaSeed) {
      const q = askSchelaSeed;
      consumeAskSchelaSeed();
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askSchelaExpanded, askSchelaSeed]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j" && askSchelaExpanded) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && askSchelaExpanded) setAskSchelaExpanded(false);
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [askSchelaExpanded, setAskSchelaExpanded]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [turns, thinking, typed]);

  if (!askSchelaExpanded) return null;

  function findCandidateByFirstName(name: string) {
    const q = name.toLowerCase();
    return candidates.find((c) => c.name.toLowerCase().split(" ")[0] === q) ?? candidates.find((c) => c.name.toLowerCase().includes(q));
  }

  /**
   * Ask Schela executes actions rather than just answering questions — this is
   * the core "AI assistant" behavior the product is built around. Recognized
   * patterns open the real modal/screen pre-filled; anything else falls back
   * to a canned Q&A response.
   */
  function tryExecute(raw: string): { text: string; executed: boolean } | null {
    const text = raw.trim();
    const lower = text.toLowerCase();

    const scheduleMatch = lower.match(/^schedule\s+([a-z]+)/);
    if (scheduleMatch) {
      const cand = findCandidateByFirstName(scheduleMatch[1]);
      if (cand) {
        setTimeout(() => { setAskSchelaExpanded(false); openWizardWithCandidate(cand.id, cand.name); }, 700);
        return { text: `Opening the scheduling flow for ${cand.name} — pick a slot and I'll take it from there.`, executed: true };
      }
      return { text: `I couldn't find a candidate named "${scheduleMatch[1]}". Add them first from the Candidates page and I can schedule right away next time.`, executed: false };
    }

    const moveMatch = lower.match(/^move\s+([a-z]+)\s+to\s+(\w+)/);
    if (moveMatch) {
      const cand = findCandidateByFirstName(moveMatch[1]);
      const interview = cand ? interviews.find((iv) => iv.candId === cand.id) : undefined;
      if (cand && interview) {
        setTimeout(() => { setAskSchelaExpanded(false); openInterviewDrawer(interview.id); openReschedule(); }, 700);
        return { text: `Pulling up reschedule options for ${cand.name}'s interview — pick the new slot for ${moveMatch[2]}.`, executed: true };
      }
      if (cand) return { text: `${cand.name} doesn't have an interview on the books yet — want me to schedule one instead?`, executed: false };
      return { text: `I couldn't find a candidate named "${moveMatch[1]}".`, executed: false };
    }

    if (/^send reminders?/.test(lower)) {
      return { text: "__REMINDERS__", executed: true };
    }

    if (/today'?s? escalations?/.test(lower) || /show.*escalat/.test(lower)) {
      const count = interviews.filter((iv) => iv.aiState === "escalated").length;
      setTimeout(() => { setAskSchelaExpanded(false); router.push("/interviews?filter=action"); }, 700);
      return { text: `${count} interview${count !== 1 ? "s" : ""} escalated right now. Opening the filtered list for you.`, executed: true };
    }

    return null;
  }

  async function ask(question: string) {
    setTurns((prev) => [...prev, { role: "user", text: question }]);
    setValue("");
    setTyping(false);
    setThinking(true);

    const executedResult = tryExecute(question);
    let nextTurn: ChatTurn;
    if (executedResult && executedResult.text === "__REMINDERS__") {
      try {
        const res = await fetch("/api/reminders", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "failed");
        const { sent = 0, failed = 0, names = [] } = data as { sent: number; failed: number; names: string[] };
        const text =
          sent === 0 && failed === 0
            ? "No candidates are waiting on a reply right now — nothing to nudge."
            : `Sent ${sent} reminder${sent === 1 ? "" : "s"}${names.length ? ` to ${names.join(", ")}` : ""}${failed ? `. ${failed} couldn't be delivered.` : "."}`;
        nextTurn = { role: "ai", text, executed: true };
      } catch {
        nextTurn = { role: "ai", text: "Couldn't send reminders just now — try again in a moment.", executed: false };
      }
    } else if (executedResult) {
      nextTurn = { role: "ai", text: executedResult.text, executed: executedResult.executed };
    } else {
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const data = await res.json();
        nextTurn = { role: "ai", text: data.answer ?? data.error ?? "Something went wrong.", intent: "general_query" };
      } catch {
        nextTurn = { role: "ai", text: "Couldn't reach the AI model just now — try again in a moment.", intent: "general_query" };
      }
    }
    setThinking(false);
    setTurns((prev) => [...prev, nextTurn]);
    setTyping(true);
  }

  function handleSend() {
    if (!value.trim()) return;
    ask(value.trim());
  }

  return (
    <div className="ask-drawer show">
      <div className="ask-drawer-head">
        <div className="ask-drawer-head-title">
          <span className="material-symbols-outlined">auto_awesome</span>Ask Schela
          <span className="ask-live-dot" title="Schela is active" />
        </div>
        <span className="close-x" onClick={() => setAskSchelaExpanded(false)}><span className="material-symbols-outlined">close</span></span>
      </div>
      <div className="ask-drawer-body" ref={bodyRef}>
        {turns.length === 0 ? (
          <>
            <div className="ask-section-label">Quick actions</div>
            <div className="ask-prompt-grid">
              {QUICK_ACTIONS.map((p, i) => (
                <div key={p.text} className="ask-prompt-card" onClick={() => ask(p.text)}>
                  <div className="ask-prompt-icon" style={{ background: `var(--${p.color}-tint)` }}>
                    <span className="material-symbols-outlined" style={{ color: `var(--${p.color})` }}>{p.icon}</span>
                  </div>
                  <div className="ask-prompt-text">{p.text}</div>
                  <span className="ask-prompt-kbd">{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="ask-section-label">Ask Schela</div>
            <div className="ask-prompt-grid">
              {SUGGESTED_QUESTIONS.map((p, i) => (
                <div key={p.text} className="ask-prompt-card" onClick={() => ask(p.text)}>
                  <div className="ask-prompt-icon" style={{ background: `var(--${p.color}-tint)` }}>
                    <span className="material-symbols-outlined" style={{ color: `var(--${p.color})` }}>{p.icon}</span>
                  </div>
                  <div className="ask-prompt-text">{p.text}</div>
                  <span className="ask-prompt-kbd">{QUICK_ACTIONS.length + i + 1}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="ask-chat">
            {turns.map((t, i) => {
              const isLastAi = t.role === "ai" && i === turns.length - 1;
              if (t.role === "user") return <div key={i} className="ask-chat-msg user">{t.text}</div>;

              // Executed actions render as a rich result card instead of a plain bubble —
              // the "operating system" feel comes from Schela visibly *doing* something.
              if (t.executed) {
                return (
                  <div key={i} className="ask-action-card">
                    <div className="ask-action-icon"><span className="material-symbols-outlined">bolt</span></div>
                    <div className="ask-action-body">
                      <div className="ask-action-title">Action executed</div>
                      <div className="ask-action-text">{isLastAi ? typed : t.text}</div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i}>
                  <div className="ask-chat-msg ai">
                    <div className="conv-msg-avatar"><span className="material-symbols-outlined">auto_awesome</span></div>
                    <div className="bubble">{isLastAi ? typed : t.text}</div>
                  </div>
                  {(!isLastAi || typed === t.text) && t.intent && (
                    <div className="ask-chat-meta">intent: {t.intent} · confidence: {t.confidence}</div>
                  )}
                </div>
              );
            })}
            {thinking && (
              <div className="ask-thinking">
                <div className="conv-msg-avatar"><span className="material-symbols-outlined">auto_awesome</span></div>
                <div className="ask-thinking-bubble">
                  <span className="typing-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="ask-drawer-input-row">
        <div className="omnisearch">
          <span className="material-symbols-outlined">auto_awesome</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask Schela to schedule, reschedule, or find something…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          />
        </div>
        <div className={`conv-send-btn ${value.trim() ? "" : "disabled"}`} onClick={handleSend}>
          <span className="material-symbols-outlined">arrow_upward</span>
        </div>
      </div>
    </div>
  );
}
