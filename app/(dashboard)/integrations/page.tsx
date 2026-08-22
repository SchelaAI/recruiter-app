"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { COMING_SOON_INTEGRATIONS } from "@/lib/data";
import type { Integration } from "@/lib/types";
import ConnectCredentialsModal from "@/components/modals/ConnectCredentialsModal";

const OAUTH_IDS = new Set(["outlook", "zoom", "calendly"]);

const CREDENTIAL_FORMS: Record<string, { title: string; endpoint: string; fields: { key: string; label: string; placeholder: string; type?: "text" | "password"; help?: string }[] }> = {
  whatsapp: {
    title: "Connect WhatsApp Business API",
    endpoint: "/api/integrations/whatsapp/connect",
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "123456789012345", help: "From your Meta App → WhatsApp → API Setup." },
      { key: "accessToken", label: "Access Token", placeholder: "EAAG...", type: "password", help: "A permanent token, not the 24h test token — see SETUP.md." },
    ],
  },
  resend: {
    title: "Connect Resend",
    endpoint: "/api/integrations/resend/connect",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "re_...", type: "password", help: "Create one at Resend → API Keys. Needs send access; inbound replies use the same key." },
    ],
  },
};

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "This deployment hasn't set up that provider yet — add its client id/secret to your environment (see SETUP.md).",
  denied: "Connection cancelled.",
  state_mismatch: "That connection attempt expired or looked suspicious — try again.",
  exchange_failed: "The provider rejected the connection. Try again.",
  store_failed: "Connected, but saving it failed — try again.",
  unknown_provider: "Unknown integration.",
};

function IntegrationsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/integrations").then((r) => r.json()).then((d) => setIntegrations(d.integrations ?? []));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Surface the result of an OAuth redirect (?connected=outlook or ?error=...) once, then clean the URL.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      setBanner({ kind: "success", text: "Connected." });
      refresh();
      router.replace("/integrations");
    } else if (error) {
      setBanner({ kind: "error", text: ERROR_MESSAGES[error] ?? "Something went wrong." });
      router.replace("/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  async function disconnect(id: string) {
    setDisconnecting(id);
    try {
      await fetch(`/api/integrations/${id}/disconnect`, { method: "POST" });
      refresh();
    } finally {
      setDisconnecting(null);
    }
  }

  if (!integrations) return null;

  const connected = integrations.filter((i) => i.connected);
  const notConnected = integrations.filter((i) => !i.connected);
  const openFormDef = openForm ? CREDENTIAL_FORMS[openForm] : null;

  return (
    <>
      {banner && (
        <div
          className="card"
          style={{
            padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
            borderColor: banner.kind === "success" ? "var(--mint)" : "var(--coral)",
            color: banner.kind === "success" ? "var(--mint)" : "var(--coral)",
            fontSize: 12.5, fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            {banner.kind === "success" ? "check_circle" : "error"}
          </span>
          {banner.text}
        </div>
      )}

      <div className="integ-section-label connected">Connected</div>
      <div className="integ-grid">
        {connected.length === 0 && (
          <div className="empty-state" style={{ padding: "24px", gridColumn: "1 / -1" }}>
            <span className="material-symbols-outlined">hub</span>
            <div className="empty-state-title">Nothing connected yet</div>
          </div>
        )}
        {connected.map((i) => (
          <div className="card integ-card" key={i.id}>
            <div className="integ-card-top">
              <div className="integ-logo" style={{ background: "var(--mint-tint)", color: "var(--mint)" }}>
                <span className="material-symbols-outlined">{i.icon}</span>
              </div>
              <div>
                <div className="integ-name">{i.name}</div>
                <span className="pill-mini mint">Connected</span>
              </div>
            </div>
            <div className="integ-account">{i.account ?? "—"}</div>
            <div className="integ-synced">{i.lastSynced ? `Last synced ${i.lastSynced}` : "Configured via environment variables"}</div>
            {i.id === "calendly" && <CalendlyEventTypePicker />}
            <div className="integ-footer">
              <button
                className="btn btn-sm btn-coral-outline"
                onClick={() => disconnect(i.id)}
                disabled={disconnecting === i.id}
              >
                {disconnecting === i.id ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="integ-section-label available">Available</div>
      <div className="integ-grid">
        {notConnected.map((i) => {
          const isOAuth = OAUTH_IDS.has(i.id);
          const hasCredentialForm = Boolean(CREDENTIAL_FORMS[i.id]);
          const oauthReady = isOAuth && i.envConfigured;

          return (
            <div className="card integ-card" key={i.id}>
              <div className="integ-card-top">
                <div className="integ-logo" style={{ background: "var(--bg-canvas)", color: "var(--slate)" }}>
                  <span className="material-symbols-outlined">{i.icon}</span>
                </div>
                <div>
                  <div className="integ-name">{i.name}</div>
                  <span className="pill-mini slate">Not connected</span>
                </div>
              </div>
              <div className="integ-synced" style={{ marginBottom: 13 }}>
                {isOAuth && !i.envConfigured
                  ? `This deployment hasn't set up ${i.name} yet — see SETUP.md for the required environment variables.`
                  : hasCredentialForm
                    ? `Connect your ${i.name} credentials to start sending for real.`
                    : "Connect your account to get started."}
              </div>
              <div className="integ-footer" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
                <span />
                {hasCredentialForm ? (
                  <button className="btn btn-outline" onClick={() => setOpenForm(i.id)}>Connect</button>
                ) : isOAuth ? (
                  oauthReady ? (
                    <a className="btn btn-outline" href={`/api/integrations/oauth/${i.id}/connect`}>Connect</a>
                  ) : (
                    <button className="btn btn-outline" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                      Not configured
                    </button>
                  )
                ) : (
                  <button className="btn btn-outline" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                    Not yet available
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="integ-section-label available" style={{ marginTop: 24 }}>Coming soon</div>
      <div className="coming-soon-strip">
        {COMING_SOON_INTEGRATIONS.map((i) => (
          <div className="coming-soon-chip" key={i.id}>
            <span className="material-symbols-outlined">{i.icon}</span>{i.name}
          </div>
        ))}
      </div>

      {openFormDef && (
        <ConnectCredentialsModal
          title={openFormDef.title}
          endpoint={openFormDef.endpoint}
          fields={openFormDef.fields}
          onClose={() => setOpenForm(null)}
          onConnected={() => {
            setOpenForm(null);
            setBanner({ kind: "success", text: "Connected." });
            refresh();
          }}
        />
      )}
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsInner />
    </Suspense>
  );
}

/**
 * Booking links can't be generated until the recruiter picks which Calendly
 * event type Schela books interviews through — this is that picker, shown
 * inline on the connected Calendly card.
 */
function CalendlyEventTypePicker() {
  const [eventTypes, setEventTypes] = useState<{ uri: string; name: string; durationMinutes: number }[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/calendly/event-types")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setEventTypes(d.eventTypes ?? []);
        if (d.selectedUri) setSelected(d.selectedUri);
      })
      .catch(() => setError("Couldn't load event types"));
  }, []);

  async function save(uri: string) {
    setSelected(uri);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/integrations/calendly/event-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventTypeUri: uri }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <div style={{ fontSize: 11.5, color: "var(--coral)", marginBottom: 10 }}>{error}</div>;
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 }}>
        Event type Schela books interviews through
      </label>
      {eventTypes === null ? (
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Loading…</div>
      ) : eventTypes.length === 0 ? (
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>No active event types found in this Calendly account.</div>
      ) : (
        <select className="field-input" value={selected} onChange={(e) => save(e.target.value)} disabled={saving}>
          <option value="" disabled>Choose an event type…</option>
          {eventTypes.map((et) => (
            <option key={et.uri} value={et.uri}>{et.name} ({et.durationMinutes} min)</option>
          ))}
        </select>
      )}
      {saved && <div style={{ fontSize: 11, color: "var(--mint)", marginTop: 4 }}>✓ Saved</div>}
    </div>
  );
}
