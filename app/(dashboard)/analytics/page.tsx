"use client";

import { useEffect, useState } from "react";
import type { AnalyticsSummary } from "@/lib/store";

const ZONE_COLOR: Record<string, string> = { mint: "#0EA371", amber: "#D97B0A", coral: "#E0403A" };
const STAGE_COLOR: Record<string, string> = { mint: "#0EA371", purple: "#6320EE", amber: "#D97B0A", coral: "#E0403A" };

function BarChart({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 100 / values.length;
  return (
    <svg className="chart-svg" viewBox="0 0 100 60" preserveAspectRatio="none">
      {values.map((v, i) => {
        const h = (v / max) * 46;
        return <rect key={i} x={i * w + w * 0.25} y={50 - h} width={w * 0.5} height={h} rx={1.5} fill={color} opacity={0.9} />;
      })}
      <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border-soft)" strokeWidth="0.5" />
    </svg>
  );
}

function TrendChart({ values }: { values: number[] }) {
  const min = 0, max = 100;
  const points = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * 100 : 50;
    const y = 50 - ((v - min) / (max - min)) * 46;
    return `${x},${y}`;
  });
  const targetY = 50 - ((90 - min) / (max - min)) * 46;
  return (
    <svg className="chart-svg" viewBox="0 0 100 60" preserveAspectRatio="none">
      <line x1="0" y1={targetY} x2="100" y2={targetY} stroke="var(--slate-faint)" strokeWidth="0.6" strokeDasharray="3,2" />
      <polyline points={points.join(" ")} fill="none" stroke="#0EA371" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * 100 : 50;
        const y = 50 - ((v - min) / (max - min)) * 46;
        return <circle key={i} cx={x} cy={y} r="1.6" fill="#0EA371" />;
      })}
    </svg>
  );
}

function ChannelPerfChart({ data }: { data: AnalyticsSummary["weeklyChannel"] }) {
  const groupW = 100 / data.length;
  return (
    <svg className="chart-svg" viewBox="0 0 100 60" preserveAspectRatio="none">
      {data.map((c, i) => {
        const gx = i * groupW;
        const waH = (c.wa / 100) * 46;
        const emH = (c.em / 100) * 46;
        return (
          <g key={c.week}>
            <rect x={gx + groupW * 0.18} y={50 - waH} width={groupW * 0.28} height={waH} rx={1} fill="#0EA371" />
            <rect x={gx + groupW * 0.54} y={50 - emH} width={groupW * 0.28} height={emH} rx={1} fill="#2F6FE4" />
          </g>
        );
      })}
      <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border-soft)" strokeWidth="0.5" />
    </svg>
  );
}

function ConfidenceHistogram({ buckets }: { buckets: AnalyticsSummary["confidenceBuckets"] }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const w = 100 / buckets.length;
  return (
    <svg className="chart-svg" viewBox="0 0 100 60" preserveAspectRatio="none">
      {buckets.map((b, i) => {
        const h = (b.count / max) * 46;
        return <rect key={b.label} x={i * w + w * 0.15} y={50 - h} width={w * 0.7} height={h} rx={1.5} fill={ZONE_COLOR[b.zone]} opacity={0.9} />;
      })}
      <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border-soft)" strokeWidth="0.5" />
    </svg>
  );
}

function TimeToConfirmScatter({ data }: { data: AnalyticsSummary["timeToConfirm"] }) {
  if (data.length === 0) return <div className="empty-state" style={{ padding: 20 }}><span className="material-symbols-outlined">show_chart</span><div className="empty-state-title">No confirmations yet</div></div>;
  const maxHour = Math.max(...data.map((t) => t.hours), 1);
  const benchY = 50 - (6 / maxHour) * 46;
  return (
    <svg className="chart-svg" viewBox="0 0 100 60" preserveAspectRatio="none">
      <line x1="0" y1={benchY} x2="100" y2={benchY} stroke="#2F6FE4" strokeWidth="0.7" strokeDasharray="3,2" />
      {data.map((t) => {
        const x = (t.day / (data.length + 1)) * 100;
        const y = 50 - (t.hours / maxHour) * 46;
        return <circle key={t.day} cx={x} cy={y} r="2" fill="#E0403A" opacity={0.85} />;
      })}
    </svg>
  );
}

function trendLabel(current: number, previous: number, suffix: string) {
  if (previous === 0 && current === 0) return { text: "No data in prior period", cls: "neutral" };
  const diff = current - previous;
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
  const arrow = diff > 0 ? "↗ +" : diff < 0 ? "↘ " : "";
  return { text: `${arrow}${diff}${suffix}`, cls };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    fetch("/api/analytics").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return null;

  const interviewsTrend = trendLabel(data.totalInterviews, data.totalInterviewsPrev, " vs prior 30 days");
  const deflectionTrend = trendLabel(data.aiDeflectionPct, data.aiDeflectionPctPrev, "pt vs prior 30 days");

  return (
    <>
      <div className="section-header">
        <div className="section-title">Overview</div>
        <span className="muted" style={{ fontSize: 11.5 }}>Last 30 days</span>
      </div>

      <div className="metric-grid">
        <div className="card metric-card">
          <div className="metric-top">
            <div className="metric-icon-box purple"><span className="material-symbols-outlined">event</span></div>
            <div className="metric-label">Total Interviews</div>
            <div className="metric-value">{data.totalInterviews}</div>
          </div>
          <div className={`metric-variance ${interviewsTrend.cls}`}>{interviewsTrend.text}</div>
        </div>
        <div className="card metric-card">
          <div className="metric-top">
            <div className="metric-icon-box mint"><span className="material-symbols-outlined">auto_awesome</span></div>
            <div className="metric-label">AI Deflection Rate</div>
            <div className="metric-value">{data.aiDeflectionPct}%</div>
          </div>
          <div className={`metric-variance ${deflectionTrend.cls}`}>{deflectionTrend.text}</div>
        </div>
        <div className="card metric-card">
          <div className="metric-top">
            <div className="metric-icon-box blue"><span className="material-symbols-outlined">schedule</span></div>
            <div className="metric-label">Avg. Response Time</div>
            <div className="metric-value">{data.avgResponseSeconds !== null ? `${data.avgResponseSeconds}s` : "—"}</div>
          </div>
          <div className="metric-variance neutral">{data.avgResponseSeconds !== null ? "AI-handled replies" : "No AI replies yet"}</div>
        </div>
        <div className="card metric-card">
          <div className="metric-top">
            <div className="metric-icon-box coral"><span className="material-symbols-outlined">person_off</span></div>
            <div className="metric-label">No-shows</div>
            <div className="metric-value">—</div>
          </div>
          <div className="metric-variance neutral">Not tracked yet</div>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="card chart-card">
          <div className="chart-card-title">Interviews over time</div>
          <div className="chart-card-sub">Daily, last 7 days</div>
          <BarChart values={data.dailyInterviews} color="#6320EE" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {data.dailyLabels.map((d, i) => <span key={i} className="chart-axis-label">{d}</span>)}
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-card-title">AI deflection trend</div>
          <div className="chart-card-sub">Dashed line marks 90% target</div>
          <TrendChart values={data.dailyDeflectionPct} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {data.dailyLabels.map((d, i) => <span key={i} className="chart-axis-label">{d}</span>)}
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-card-title">Channel performance</div>
          <div className="chart-card-sub">
            <span style={{ color: "#0EA371", fontWeight: 700 }}>● WhatsApp</span> vs <span style={{ color: "#2F6FE4", fontWeight: 700 }}>● Email</span>, confirm rate by week
          </div>
          <ChannelPerfChart data={data.weeklyChannel} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {data.weeklyChannel.map((c) => <span key={c.week} className="chart-axis-label">{c.week}</span>)}
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-card-title">Confidence distribution</div>
          <div className="chart-card-sub">AI decisions by confidence band</div>
          <ConfidenceHistogram buckets={data.confidenceBuckets} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {data.confidenceBuckets.map((b) => <span key={b.label} className="chart-axis-label">{b.label}</span>)}
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-card-title">Conversion funnel</div>
          <div className="chart-card-sub">Invited → Confirmed, all-time</div>
          {data.funnel.map((s) => (
            <div className="funnel-row-big" key={s.label}>
              <span className="funnel-row-label">{s.label}</span>
              <div className="funnel-row-bar-wrap">
                <div className="funnel-row-bar" style={{ width: `${Math.max(s.pct, 2)}%`, background: STAGE_COLOR[s.color] }}>
                  <span className="funnel-row-pct">{s.pct}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card chart-card">
          <div className="chart-card-title">Time to confirm</div>
          <div className="chart-card-sub">Hours from invite to confirmation · dashed = 6h benchmark</div>
          <TimeToConfirmScatter data={data.timeToConfirm} />
        </div>
      </div>
    </>
  );
}
