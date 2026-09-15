import { AI_STATE_ICON, AI_STATE_LABEL } from "@/lib/data";
import type { AiState } from "@/lib/types";

/**
 * The single source of truth for rendering an AI-state badge. Every screen
 * that shows a candidate/interview status should use this instead of hand-
 * rolling a `<span className="status-badge X">` — that's what let emoji
 * prefixes and Material icons drift out of sync across the app in the first
 * place.
 */
export default function StatusBadge({ state, className = "" }: { state: AiState; className?: string }) {
  return (
    <span className={`status-badge ${state} ${className}`}>
      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{AI_STATE_ICON[state]}</span>
      {AI_STATE_LABEL[state]}
    </span>
  );
}
