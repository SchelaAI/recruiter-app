"use client";

import { useEffect, useState } from "react";
import type { SettingsRow } from "@/lib/store";
import type { Interviewer } from "@/lib/types";
import { useUI } from "@/context/UIContext";

type Category = "profile" | "company" | "notifications" | "ai" | "scheduling" | "channels" | "billing";

const CATS: { key: Category; label: string; icon: string }[] = [
  { key: "profile", label: "Profile", icon: "person" },
  { key: "company", label: "Company", icon: "business" },
  { key: "notifications", label: "Notifications", icon: "notifications" },
  { key: "ai", label: "AI Preferences", icon: "auto_awesome" },
  { key: "scheduling", label: "Scheduling", icon: "event" },
  { key: "channels", label: "Channels", icon: "forum" },
  { key: "billing", label: "Billing", icon: "credit_card" },
];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className={`ios-toggle ${on ? "on" : ""}`} onClick={onToggle}>
      <div className="ios-toggle-knob" />
    </div>
  );
}

function useSettingsSave() {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function save(patch: Partial<SettingsRow>): Promise<SettingsRow | null> {
    setState("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
      return data.settings;
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      return null;
    }
  }

  return { state, errorMsg, save };
}

function SaveButton({ state, errorMsg, onSave }: { state: string; errorMsg: string; onSave: () => void }) {
  return (
    <div className="settings-save-row">
      <button className="btn btn-solid" onClick={onSave} disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : state === "saved" ? "✓ Saved" : "Save changes"}
      </button>
      <span className={`saved-tick ${state === "saved" ? "show" : ""}`}>✓ Saved</span>
      {state === "error" && <span style={{ color: "var(--coral)", fontSize: 12.5, fontWeight: 600, marginLeft: 10 }}>{errorMsg}</span>}
    </div>
  );
}

function ProfilePanel({ settings, onUpdated }: { settings: SettingsRow; onUpdated: (s: SettingsRow) => void }) {
  const { state, errorMsg, save } = useSettingsSave();
  const [fullName, setFullName] = useState(settings.full_name);
  const [role, setRole] = useState(settings.onboarding_role ?? "");
  const [phone, setPhone] = useState(settings.phone ?? "");

  async function handleSave() {
    const updated = await save({ full_name: fullName, onboarding_role: role, phone });
    if (updated) onUpdated(updated);
  }

  return (
    <div className="card settings-panel-card">
      <div className="settings-panel-title">Profile</div>
      <div className="avatar-upload">
        {fullName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?"}
        <div className="avatar-upload-overlay"><span className="material-symbols-outlined">photo_camera</span></div>
      </div>
      <div className="settings-field-row">
        <div className="field-group">
          <label className="field-label">Full name</label>
          <input className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Role</label>
          <input className="field-input" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
      </div>
      <div className="settings-field-row">
        <div className="field-group">
          <label className="field-label">Email</label>
          <input className="field-input" value={settings.email} disabled title="Email is tied to your login and can't be changed here" />
        </div>
        <div className="field-group">
          <label className="field-label">Phone</label>
          <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98000 11223" />
        </div>
      </div>
      <div className="settings-divider" />
      <div className="settings-panel-title" style={{ fontSize: 12.5 }}>Password</div>
      <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 4 }}>
        Password changes aren&apos;t handled on this screen yet — use &quot;Forgot password&quot; on the login page to reset it via email.
      </div>
      <SaveButton state={state} errorMsg={errorMsg} onSave={handleSave} />
    </div>
  );
}

function AiPreferencesPanel({ settings, onUpdated }: { settings: SettingsRow; onUpdated: (s: SettingsRow) => void }) {
  const { state, errorMsg, save } = useSettingsSave();
  const [threshold, setThreshold] = useState(settings.ai_confidence_threshold);
  const [autoExecute, setAutoExecute] = useState(settings.ai_auto_execute);
  const [logDecisions, setLogDecisions] = useState(settings.ai_log_decisions);

  async function handleSave() {
    const updated = await save({ ai_confidence_threshold: threshold, ai_auto_execute: autoExecute, ai_log_decisions: logDecisions });
    if (updated) onUpdated(updated);
  }

  return (
    <div className="card settings-panel-card">
      <div className="settings-panel-title">AI Preferences</div>
      <div className="range-slider-wrap">
        <div className="range-value-label">Escalate below {(threshold / 100).toFixed(2)}</div>
        <input className="range-slider" type="range" min={30} max={90} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
      </div>
      <div className="toggle-row">
        <div><div className="toggle-row-label">Auto-execute above threshold</div><div className="toggle-row-sub">Let Schela act without confirmation when confident</div></div>
        <Toggle on={autoExecute} onToggle={() => setAutoExecute((v) => !v)} />
      </div>
      <div className="toggle-row">
        <div><div className="toggle-row-label">Log all AI decisions</div><div className="toggle-row-sub">Keep a full audit trail of every action Schela takes</div></div>
        <Toggle on={logDecisions} onToggle={() => setLogDecisions((v) => !v)} />
      </div>
      <div className="toggle-row">
        <div>
          <div className="toggle-row-label">Notify on every escalation</div>
          <div className="toggle-row-sub settings-locked-note"><span className="material-symbols-outlined">lock</span>Required — cannot be disabled</div>
        </div>
        <div className="ios-toggle on locked"><div className="ios-toggle-knob" /></div>
      </div>
      <SaveButton state={state} errorMsg={errorMsg} onSave={handleSave} />
    </div>
  );
}

function SchedulingPanel({ settings, onUpdated }: { settings: SettingsRow; onUpdated: (s: SettingsRow) => void }) {
  const { state, errorMsg, save } = useSettingsSave();
  const [duration, setDuration] = useState(settings.scheduling_duration);
  const [buffer, setBuffer] = useState(settings.scheduling_buffer_min);
  const [limit, setLimit] = useState(settings.scheduling_reschedule_limit);
  const [hoursStart, setHoursStart] = useState(settings.working_hours_start);
  const [hoursEnd, setHoursEnd] = useState(settings.working_hours_end);

  async function handleSave() {
    const updated = await save({
      scheduling_duration: duration, scheduling_buffer_min: buffer, scheduling_reschedule_limit: limit,
      working_hours_start: hoursStart, working_hours_end: hoursEnd,
    });
    if (updated) onUpdated(updated);
  }

  return (
    <div className="card settings-panel-card">
      <div className="settings-panel-title">Scheduling</div>
      <label className="field-label">Default duration</label>
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {["30m", "45m", "60m"].map((d) => (
          <span key={d} className={`pill-chip ${duration === d ? "selected" : ""}`} onClick={() => setDuration(d)}>{d}</span>
        ))}
      </div>
      <div className="settings-field-row">
        <div className="field-group"><label className="field-label">Working hours — from</label><input className="field-input" type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} /></div>
        <div className="field-group"><label className="field-label">Working hours — to</label><input className="field-input" type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} /></div>
      </div>
      <label className="field-label">Buffer between interviews</label>
      <div className="chip-row" style={{ marginBottom: 16 }}>
        {[0, 15, 30].map((b) => (
          <span key={b} className={`pill-chip ${buffer === b ? "selected" : ""}`} onClick={() => setBuffer(b)}>{b} min</span>
        ))}
      </div>
      <label className="field-label">Reschedule limit</label>
      <div className="stepper-input" style={{ marginBottom: 16 }}>
        <div className="stepper-btn" onClick={() => setLimit((v) => Math.max(1, v - 1))}><span className="material-symbols-outlined" style={{ fontSize: 15 }}>remove</span></div>
        <span className="stepper-value">{limit}</span>
        <div className="stepper-btn" onClick={() => setLimit((v) => Math.min(10, v + 1))}><span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span></div>
      </div>
      <SaveButton state={state} errorMsg={errorMsg} onSave={handleSave} />
    </div>
  );
}

function NotificationsPanelSettings({ settings, onUpdated }: { settings: SettingsRow; onUpdated: (s: SettingsRow) => void }) {
  const { state, errorMsg, save } = useSettingsSave();
  const [rows, setRows] = useState({
    newReply: settings.notif_new_reply, confirmed: settings.notif_confirmed,
    reminders: settings.notif_reminders, weeklyDigest: settings.notif_weekly_digest,
  });

  async function handleSave() {
    const updated = await save({
      notif_new_reply: rows.newReply, notif_confirmed: rows.confirmed,
      notif_reminders: rows.reminders, notif_weekly_digest: rows.weeklyDigest,
    });
    if (updated) onUpdated(updated);
  }

  return (
    <div className="card settings-panel-card">
      <div className="settings-panel-title">Notifications</div>
      <div className="toggle-row"><div><div className="toggle-row-label">New candidate reply</div><div className="toggle-row-sub">Notify when a candidate responds</div></div><Toggle on={rows.newReply} onToggle={() => setRows((r) => ({ ...r, newReply: !r.newReply }))} /></div>
      <div className="toggle-row"><div><div className="toggle-row-label">Interview confirmed</div><div className="toggle-row-sub">Notify when Schela confirms a slot</div></div><Toggle on={rows.confirmed} onToggle={() => setRows((r) => ({ ...r, confirmed: !r.confirmed }))} /></div>
      <div className="toggle-row"><div><div className="toggle-row-label">Reminders sent</div><div className="toggle-row-sub">Notify when a T-24h reminder goes out</div></div><Toggle on={rows.reminders} onToggle={() => setRows((r) => ({ ...r, reminders: !r.reminders }))} /></div>
      <div className="toggle-row"><div><div className="toggle-row-label">Weekly digest</div><div className="toggle-row-sub">Summary email every Monday morning — not sent yet, no email provider configured (see SETUP.md)</div></div><Toggle on={rows.weeklyDigest} onToggle={() => setRows((r) => ({ ...r, weeklyDigest: !r.weeklyDigest }))} /></div>
      <div className="toggle-row">
        <div>
          <div className="toggle-row-label">AI escalation alerts</div>
          <div className="toggle-row-sub settings-locked-note"><span className="material-symbols-outlined">lock</span>Required — cannot be disabled</div>
        </div>
        <div className="ios-toggle on locked"><div className="ios-toggle-knob" /></div>
      </div>
      <SaveButton state={state} errorMsg={errorMsg} onSave={handleSave} />
    </div>
  );
}

function ChannelsPanel({ settings, onUpdated }: { settings: SettingsRow; onUpdated: (s: SettingsRow) => void }) {
  const { organization } = useUI();
  const companyName = organization?.name?.trim() || "your company";
  const { state, errorMsg, save } = useSettingsSave();
  const [fromName, setFromName] = useState(settings.email_from_name ?? "");
  const [fromAddress, setFromAddress] = useState(settings.email_from_address ?? "");
  const [replyTo, setReplyTo] = useState(settings.email_reply_to ?? "");
  const [signature, setSignature] = useState(settings.email_signature ?? "");

  async function handleSave() {
    const updated = await save({ email_from_name: fromName, email_from_address: fromAddress, email_reply_to: replyTo, email_signature: signature });
    if (updated) onUpdated(updated);
  }

  return (
    <div className="card settings-panel-card">
      <div className="settings-panel-title">Channels</div>
      <label className="field-label">Your contact number</label>
      <input
        className="field-input"
        value={settings.phone || "Not set"}
        style={{ marginBottom: 4 }}
        disabled
        title="Set this from the Profile tab — it's your own number, separate from the connected WhatsApp Business number below."
      />
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 14 }}>
        This is your own contact number, not the WhatsApp Business number Schela sends from. Connect or check that
        number under <b>Settings → Integrations</b>.
      </div>
      <label className="field-label">Message template preview</label>
      <div className="template-preview-dark">
        Hi {"{candidate_name}"} 👋<br /><br />
        I&apos;m Schela, the AI Recruiting Coordinator assisting with the hiring process for the {"{role}"} position at {companyName}.<br /><br />
        We&apos;d like to schedule your interview.<br /><br />
        Available slots:<br /><br />
        • {"{slot}"}<br /><br />
        Reply with your preferred option.
      </div>
      <div style={{ fontSize: 11.5, color: "var(--coral)", margin: "10px 0 14px 0", fontWeight: 600 }}>
        Email sending isn&apos;t connected to a real provider yet — these fields are saved, but no email will actually go out until that&apos;s configured.
      </div>
      <div className="settings-field-row">
        <div className="field-group"><label className="field-label">From name (Email)</label><input className="field-input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Schela · Your Name" /></div>
        <div className="field-group"><label className="field-label">From address</label><input className="field-input" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="you@yourcompany.com" /></div>
      </div>
      <div className="field-group"><label className="field-label">Reply-to</label><input className="field-input" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="you@yourcompany.com" /></div>
      <label className="field-label">Signature</label>
      <textarea className="notes-textarea" style={{ minHeight: 70 }} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={"Best,\nYour name"} />
      <SaveButton state={state} errorMsg={errorMsg} onSave={handleSave} />
    </div>
  );
}

function CompanyPanel() {
  const { organization, refreshOrganization, interviewers, refreshInterviewers } = useUI();
  const [name, setName] = useState(organization?.name ?? "");
  const [website, setWebsite] = useState(organization?.website ?? "");
  const [poweredBy, setPoweredBy] = useState(organization?.poweredBySchela ?? true);
  const [waTemplate, setWaTemplate] = useState(organization?.waTemplateName ?? "");
  const [waLang, setWaLang] = useState(organization?.waTemplateLanguage ?? "en_US");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // New-interviewer form
  const [ivName, setIvName] = useState("");
  const [ivRole, setIvRole] = useState("");
  const [ivEmail, setIvEmail] = useState("");
  const [ivBusy, setIvBusy] = useState(false);
  const [ivError, setIvError] = useState("");

  useEffect(() => {
    if (organization) {
      setName(organization.name);
      setWebsite(organization.website ?? "");
      setPoweredBy(organization.poweredBySchela);
      setWaTemplate(organization.waTemplateName ?? "");
      setWaLang(organization.waTemplateLanguage ?? "en_US");
    }
  }, [organization]);

  async function saveOrg() {
    if (!name.trim()) { setState("error"); setErrorMsg("Company name can't be empty"); return; }
    setState("saving");
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, website, poweredBySchela: poweredBy, waTemplateName: waTemplate, waTemplateLanguage: waLang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      await refreshOrganization();
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function addInterviewer() {
    if (!ivName.trim()) { setIvError("Name is required"); return; }
    setIvBusy(true);
    setIvError("");
    try {
      const res = await fetch("/api/interviewers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ivName, role: ivRole, email: ivEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add interviewer");
      setIvName(""); setIvRole(""); setIvEmail("");
      await refreshInterviewers();
    } catch (err) {
      setIvError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIvBusy(false);
    }
  }

  async function removeInterviewer(id: string) {
    try {
      await fetch(`/api/interviewers/${id}`, { method: "DELETE" });
      await refreshInterviewers();
    } catch {
      // Non-fatal — the list just won't update until the next refresh.
    }
  }

  return (
    <div className="card settings-panel-card">
      <div className="settings-panel-title">Company</div>
      <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 14 }}>
        This is the name candidates see. Every WhatsApp and email invitation goes out as <b>{name.trim() || "your company"}</b>&apos;s recruiting team — never as &quot;Schela&quot;.
      </div>
      <div className="settings-field-row">
        <div className="field-group">
          <label className="field-label">Company name</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
        </div>
        <div className="field-group">
          <label className="field-label">Website <span style={{ color: "var(--muted)", fontWeight: 600 }}>(optional)</span></label>
          <input className="field-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" />
        </div>
      </div>
      <div className="settings-field-row">
        <div className="field-group">
          <label className="field-label">WhatsApp template name <span style={{ color: "var(--muted)", fontWeight: 600 }}>(optional)</span></label>
          <input className="field-input" value={waTemplate} onChange={(e) => setWaTemplate(e.target.value)} placeholder="interview_invitation" />
        </div>
        <div className="field-group">
          <label className="field-label">Template language</label>
          <input className="field-input" value={waLang} onChange={(e) => setWaLang(e.target.value)} placeholder="en_US" />
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
        WhatsApp only allows free-form messages within 24 hours of a candidate&apos;s last reply. To reach candidates
        outside that window (first contact, reminders, follow-ups), Schela needs the name of a template you&apos;ve had
        approved in WhatsApp Manager. Without one, those messages will fail with a clear error rather than sending.
      </div>

      <div className="toggle-row">
        <div>
          <div className="toggle-row-label">Show &quot;Powered by Schela&quot;</div>
          <div className="toggle-row-sub">Displays a small Schela credit in your dashboard sidebar</div>
        </div>
        <Toggle on={poweredBy} onToggle={() => setPoweredBy((v) => !v)} />
      </div>
      <SaveButton state={state} errorMsg={errorMsg} onSave={saveOrg} />

      <div className="settings-divider" />
      <div className="settings-panel-title" style={{ fontSize: 13 }}>Interviewers</div>
      <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
        Your hiring team. These are the people you can assign interviews to in the New Interview flow.
      </div>

      {interviewers.length === 0 ? (
        <div className="empty-state" style={{ padding: "18px 0" }}>
          <span className="material-symbols-outlined">group_add</span>
          <div className="empty-state-title">No interviewers yet</div>
          <div className="empty-state-sub">Add your first team member below.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {interviewers.map((iv: Interviewer) => (
            <div key={iv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border-soft)", borderRadius: "var(--r-sm)", background: "var(--bg-canvas)" }}>
              <div className="mini-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                {iv.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{iv.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{[iv.role, iv.email].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <span
                className="material-symbols-outlined"
                style={{ cursor: "pointer", color: "var(--coral)", fontSize: 18 }}
                title="Remove"
                onClick={() => removeInterviewer(iv.id)}
              >
                delete
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ border: "1px solid var(--border-soft)", borderRadius: "var(--r-sm)", padding: 12, background: "var(--bg-canvas)" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--purple)", marginBottom: 10 }}>Add interviewer</div>
        <input className="field-input" placeholder="Full name" value={ivName} onChange={(e) => setIvName(e.target.value)} style={{ marginBottom: 8 }} />
        <div className="settings-field-row" style={{ marginBottom: 0 }}>
          <div className="field-group"><input className="field-input" placeholder="Role (e.g. Engineering Lead)" value={ivRole} onChange={(e) => setIvRole(e.target.value)} /></div>
          <div className="field-group"><input className="field-input" placeholder="Email (optional)" value={ivEmail} onChange={(e) => setIvEmail(e.target.value)} /></div>
        </div>
        {ivError && <div className="field-error-text" style={{ marginTop: 6 }}>{ivError}</div>}
        <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={addInterviewer} disabled={ivBusy}>
          <span className="material-symbols-outlined">add</span>{ivBusy ? "Adding…" : "Add interviewer"}
        </button>
      </div>
    </div>
  );
}

function SimplePanel({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="card settings-panel-card">
      <div className="empty-state">
        <span className="material-symbols-outlined">credit_card</span>
        <div className="empty-state-title">{title}</div>
        <div className="empty-state-sub">{sub}</div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [cat, setCat] = useState<Category>("profile");
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setLoadError(d.error); return; }
        setSettings(d.settings);
      })
      .catch(() => setLoadError("Could not reach the server."));
  }, []);

  if (loadError) {
    return (
      <div className="card settings-panel-card">
        <div className="empty-state">
          <span className="material-symbols-outlined">error</span>
          <div className="empty-state-title">Couldn&apos;t load settings</div>
          <div className="empty-state-sub">{loadError}</div>
        </div>
      </div>
    );
  }
  if (!settings) return null;

  return (
    <div className="settings-layout">
      <div className="card settings-nav">
        {CATS.map((c) => (
          <div key={c.key} className={`settings-nav-item ${cat === c.key ? "active" : ""}`} onClick={() => setCat(c.key)}>
            <span className="material-symbols-outlined">{c.icon}</span>{c.label}
          </div>
        ))}
      </div>

      {cat === "profile" && <ProfilePanel settings={settings} onUpdated={setSettings} />}
      {cat === "company" && <CompanyPanel />}
      {cat === "ai" && <AiPreferencesPanel settings={settings} onUpdated={setSettings} />}
      {cat === "scheduling" && <SchedulingPanel settings={settings} onUpdated={setSettings} />}
      {cat === "notifications" && <NotificationsPanelSettings settings={settings} onUpdated={setSettings} />}
      {cat === "channels" && <ChannelsPanel settings={settings} onUpdated={setSettings} />}
      {cat === "billing" && <SimplePanel title="Billing" sub="Plan details and invoices will live here soon." />}
    </div>
  );
}
