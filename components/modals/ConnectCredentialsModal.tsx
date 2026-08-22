"use client";

import { useState } from "react";

interface Field {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "password";
  help?: string;
}

interface ConnectCredentialsModalProps {
  title: string;
  endpoint: string;
  fields: Field[];
  onClose: () => void;
  onConnected: () => void;
}

export default function ConnectCredentialsModal({ title, endpoint, fields, onClose, onConnected }: ConnectCredentialsModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    for (const f of fields) {
      if (!values[f.key]?.trim()) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overlay-bg show" onClick={onClose} />
      <div className="small-modal show">
        <div className="small-modal-head">
          <div className="wizard-title">{title}</div>
          <span className="close-x" onClick={onClose}><span className="material-symbols-outlined">close</span></span>
        </div>
        <div className="small-modal-body">
          {fields.map((f) => (
            <div className="field-group" key={f.key}>
              <label className="field-label">{f.label}</label>
              <input
                className="field-input"
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.help && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{f.help}</div>}
            </div>
          ))}
          {error && <div style={{ fontSize: 12.5, color: "var(--coral)", fontWeight: 600, marginTop: 4 }}>{error}</div>}
        </div>
        <div className="small-modal-foot">
          <button className="btn btn-outline" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Cancel</button>
          <button className="btn btn-solid" style={{ flex: 1, justifyContent: "center" }} onClick={submit} disabled={busy}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </>
  );
}
