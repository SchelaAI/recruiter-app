"use client";

import { computeTimeline } from "@/lib/timeline";
import StatusBadge from "@/components/StatusBadge";
import type { AiState } from "@/lib/types";

export function AiTimelineVertical({ aiState }: { aiState: AiState }) {
  const { steps, escalated, withdrawn } = computeTimeline(aiState);
  return (
    <div className="ai-timeline-v">
      {steps.map((s, i) => (
        <div className="ait-v-item" key={s.key}>
          <span className={`ait-v-node ${s.state}`} />
          <div>
            <div className={`ait-v-label ${s.state}`}>{s.label}</div>
            {escalated && i === 2 && <div className="ait-v-sub">Schela paused here — waiting on you</div>}
            {withdrawn && i === 2 && <div className="ait-v-sub">Candidate withdrew their application</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AiTimelineCompact({ aiState, candName }: { aiState: AiState; candName: string }) {
  const { steps, escalated, withdrawn } = computeTimeline(aiState);
  const currentStep = steps.find((s) => s.state === "current");
  return (
    <div className="ai-timeline-h">
      <div className="ait-h-header">
        <span className="ait-h-name">{candName}</span>
        {escalated ? (
          <StatusBadge state="escalated" />
        ) : withdrawn ? (
          <StatusBadge state="withdrawn" />
        ) : currentStep ? (
          <span className="ait-h-current">{currentStep.label}</span>
        ) : (
          <StatusBadge state="completed" />
        )}
      </div>
      <div className="ait-h-track">
        {steps.map((s) => (
          <div className={`ait-h-node ${s.state}`} key={s.key} title={s.label} />
        ))}
      </div>
    </div>
  );
}
