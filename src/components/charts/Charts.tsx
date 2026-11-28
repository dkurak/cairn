"use client";
import { useTip, TipBubble } from "./Tip";
import type { WeekBucket, Window } from "@/lib/stats";
import { addDays } from "@/lib/rules";
import { weekStart } from "@/lib/stats";
import { painClass } from "@/lib/rules";

import { parseISO as parse, shortDate as md } from "@/lib/format";

/* ---------- stat tile ---------- */
export function StatTile({ label, value, sub, delta }: {
  label: string; value: string; sub?: string;
  delta?: { text: string; dir: "up" | "down" | "flat"; good?: boolean | null } | null;
}) {
  const arrow = delta?.dir === "up" ? "▲" : delta?.dir === "down" ? "▼" : "■";
  return (
    <div className="card" style={{ gap: 4, alignContent: "start" }}>
      <span className="meta" style={{ fontSize: ".85rem" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", lineHeight: 1, fontWeight: 700 }}>{value}</span>
      {sub && <span className="meta" style={{ fontSize: ".85rem" }}>{sub}</span>}
      {delta && (
        <span style={{ fontSize: ".82rem", fontWeight: 600, color: delta.good == null ? "var(--muted)" : delta.good ? "var(--good)" : "var(--warn)" }}>
          <span aria-hidden="true">{arrow} </span>{delta.text}
        </span>
      )}
    </div>
  );
}

/* ---------- sessions per week (columns) ---------- */
export function WeeklyBars({ weekly, currentStart, from }: { weekly: WeekBucket[]; currentStart: string; from: string }) {
  // the first column is a partial week: label it with the day tracking began, not the Monday before
  const shown = (d: string) => (d < from ? from : d);
  const { ref, tip, show, showAtEl, hide } = useTip();
  const W = 560, H = 190, L = 26, R = 6, T = 14, B = 26;
  const max = Math.max(4, ...weekly.map((w) => w.count));
  const top = max % 2 && max > 4 ? max + 1 : max;
  const slot = (W - L - R) / weekly.length;
  const bw = Math.max(6, Math.min(48, slot - 4)); // 2px+ surface gap between columns
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.ceil(weekly.length / 8);
  const best = weekly.reduce((m, w) => (w.count > m.count ? w : m), weekly[0]);
  const bar = (x: number, v: number) => {
    const h = y(0) - y(v), r = Math.min(4, h);
    return `M${x},${y(0)} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`;
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sessions per week">
        {[0, top / 2, top].map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" /><text x={L - 6} y={y(v) + 4} textAnchor="end">{Math.round(v)}</text></g>
        ))}
        {weekly.map((w, i) => {
          const x = L + i * slot + (slot - bw) / 2;
          const isNow = w.start === currentStart;
          return (
            <g key={w.start}>
              {w.count > 0 && (
                <path d={bar(x, w.count)} fill="var(--accent)" opacity={isNow ? 1 : 0.78} tabIndex={0}
                  aria-label={`Week of ${md(shown(w.start))}: ${w.count} sessions`}
                  onMouseEnter={(e) => showAtEl(e.currentTarget, `Week of ${md(shown(w.start))} · ${w.count} session${w.count === 1 ? "" : "s"}`)}
                  onFocus={(e) => showAtEl(e.currentTarget, `Week of ${md(shown(w.start))} · ${w.count} session${w.count === 1 ? "" : "s"}`)}
                  onClick={(e) => showAtEl(e.currentTarget, `Week of ${md(shown(w.start))} · ${w.count} · ${w.names.slice(0, 3).join(", ")}${w.names.length > 3 ? "…" : ""}`)}
                  onMouseLeave={hide} onBlur={hide} />
              )}
              {w.count > 0 && (w === best || isNow) && <text x={x + bw / 2} y={y(w.count) - 4} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 700 }}>{w.count}</text>}
              {i % every === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle">{md(shown(w.start))}</text>}
            </g>
          );
        })}
      </svg>
      <TipBubble tip={tip} />
    </div>
  );
}

/* ---------- ranked horizontal bars (workout mix) ---------- */
export function MixBars({ rows }: { rows: { label: string; count: number }[] }) {
  if (!rows.length) return <p className="empty">Nothing logged in this range.</p>;
  const max = rows[0].count, total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(86px, 34%) 1fr auto", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: ".92rem" }}>{r.label}</span>
          <span style={{ background: "var(--bg)", borderRadius: 4, height: 14, display: "block" }}>
            <span style={{ display: "block", height: 14, width: `${Math.max(6, (r.count / max) * 100)}%`, background: "var(--accent)", borderRadius: "0 4px 4px 0" }} />
          </span>
          <span className="meta" style={{ fontVariantNumeric: "tabular-nums", fontSize: ".88rem" }}><strong style={{ color: "var(--ink)" }}>{r.count}</strong> · {Math.round((r.count / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- pain trend: sessions vs everyday checks ---------- */
export type PainPt = { date: string; p: number };
export function PainTrend({ win, sessions, checks, checkLabel }: { win: Window; sessions: PainPt[]; checks: PainPt[]; checkLabel: string }) {
  const { ref, tip, show, hide } = useTip();
  const W = 560, H = 210, L = 26, R = 78, T = 12, B = 26;
  const span = Math.max(1, Math.round((+parse(win.end) - +parse(win.start)) / 86400000));
  const x = (d: string) => L + (Math.round((+parse(d) - +parse(win.start)) / 86400000) / span) * (W - L - R);
  const y = (p: number) => T + ((10 - p) * (H - T - B)) / 10;
  const sorted = (a: PainPt[]) => [...a].sort((p, q) => (p.date < q.date ? -1 : 1));
  const S = sorted(sessions), C = sorted(checks);
  const line = (a: PainPt[]) => a.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.p).toFixed(1)}`).join(" ");
  const ticks = [0, 1, 2, 3, 4].map((i) => addDays(win.start, Math.round((span / 4) * i)));
  const last = (a: PainPt[]) => a[a.length - 1];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div className="row" style={{ gap: 14, fontSize: ".88rem" }} aria-label="Legend">
        <span><span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 3, background: "var(--s1)", verticalAlign: "middle", marginRight: 6 }} />During sessions</span>
        <span><span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 3, background: "var(--s2)", verticalAlign: "middle", marginRight: 6 }} />{checkLabel} (daily)</span>
      </div>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Pain over time: during sessions and daily checks">
        <rect x={L} y={y(3)} width={W - L - R} height={y(0) - y(3)} fill="var(--good-bg)" />
        <text x={W - R + 6} y={y(1.5) + 4} style={{ fill: "var(--good)" }}>≤3 green</text>
        {[0, 3, 6, 10].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        {C.length > 1 && <path d={line(C)} fill="none" stroke="var(--s2)" strokeWidth="2" strokeLinejoin="round" />}
        {S.length > 1 && <path d={line(S)} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" />}
        {C.map((p) => <circle key={"c" + p.date} cx={x(p.date)} cy={y(p.p)} r="5.5" fill="var(--s2)" stroke="var(--surface)" strokeWidth="2" onMouseEnter={(e) => show(e, `${md(p.date)} · ${checkLabel} ${p.p}/10`)} onClick={(e) => show(e, `${md(p.date)} · ${checkLabel} ${p.p}/10`)} onMouseLeave={hide} />)}
        {S.map((p, i) => <circle key={"s" + i} cx={x(p.date)} cy={y(p.p)} r="6" fill="var(--s1)" stroke="var(--surface)" strokeWidth="2" onMouseEnter={(e) => show(e, `${md(p.date)} · during session ${p.p}/10`)} onClick={(e) => show(e, `${md(p.date)} · during session ${p.p}/10`)} onMouseLeave={hide} />)}
        {last(C) && <text x={x(last(C).date) + 8} y={y(last(C).p) - 6} style={{ fill: "var(--ink)", fontWeight: 700 }}>{last(C).p}</text>}
        {last(S) && <text x={x(last(S).date) + 8} y={y(last(S).p) + 14} style={{ fill: "var(--ink)", fontWeight: 700 }}>{last(S).p}</text>}
        {ticks.map((d, i) => <text key={i} x={x(d)} y={H - 8} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>{md(d)}</text>)}
      </svg>
      <TipBubble tip={tip} />
      <details style={{ marginTop: 6 }}>
        <summary className="meta" style={{ cursor: "pointer" }}>View as table</summary>
        <table style={{ width: "100%", fontSize: ".85rem", borderCollapse: "collapse", marginTop: 6 }}>
          <thead><tr><th align="left">Date</th><th align="left">Type</th><th align="right">Pain</th></tr></thead>
          <tbody>
            {[...S.map((p) => ({ ...p, t: "Session" })), ...C.map((p) => ({ ...p, t: checkLabel }))].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40).map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--line)" }}><td>{md(r.date)}</td><td>{r.t}</td><td align="right">{r.p}/10</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/* ---------- activity heatmap (weeks x weekdays) ---------- */
export function Heatmap({ win, perDay, today }: { win: Window; perDay: Map<string, string[]>; today: string }) {
  const { ref, tip, show, hide } = useTip();
  const cell = win.buckets <= 8 ? 28 : win.buckets <= 20 ? 18 : 14, gap = win.buckets <= 8 ? 5 : 3, left = 30, top = 18;
  const W = left + win.buckets * (cell + gap), H = top + 7 * (cell + gap);
  const level = (n: number) => (n === 0 ? "var(--bg)" : `color-mix(in srgb, var(--accent) ${n === 1 ? 38 : n === 2 ? 68 : 100}%, var(--surface))`);
  const days = ["Mon", "", "Wed", "", "Fri", "", ""];
  const gridStart = weekStart(win.start);
  const cols = Array.from({ length: win.buckets }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)));
  let lastMonth = "";
  return (
    <div ref={ref} style={{ position: "relative", maxWidth: W }}>
      <svg className="viz" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sessions per day">
        {days.map((d, i) => d && <text key={i} x={left - 5} y={top + i * (cell + gap) + cell / 2 + 4} textAnchor="end">{d}</text>)}
        {cols.map((col, w) => {
          const m = parse(col[0]).toLocaleDateString(undefined, { month: "short" });
          const showM = m !== lastMonth; lastMonth = m;
          return (
            <g key={w}>
              {showM && <text x={left + w * (cell + gap)} y={10}>{m}</text>}
              {col.map((d, i) => {
                if (d > today || d < win.start) return null; // nothing before the first tracked day
                const names = perDay.get(d) ?? [];
                const label = `${parse(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${names.length ? names.join(", ") : "no session"}`;
                return <rect key={d} x={left + w * (cell + gap)} y={top + i * (cell + gap)} width={cell} height={cell} rx="3" fill={level(names.length)} stroke={names.length ? "none" : "var(--line)"} strokeWidth=".6"
                  tabIndex={names.length ? 0 : undefined} aria-label={label}
                  onMouseEnter={(e) => show(e, label)} onClick={(e) => show(e, label)} onFocus={(e) => show({ clientX: e.currentTarget.getBoundingClientRect().left, clientY: e.currentTarget.getBoundingClientRect().top }, label)} onMouseLeave={hide} />;
              })}
            </g>
          );
        })}
      </svg>
      <TipBubble tip={tip} />
    </div>
  );
}

/* ---------- sparkline ---------- */
export function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span className="meta" style={{ fontSize: ".85rem" }}>not enough checks yet</span>;
  const W = 140, H = 36, p = 4;
  const x = (i: number) => p + (i / (values.length - 1)) * (W - 2 * p);
  const y = (v: number) => p + ((10 - v) / 10) * (H - 2 * p);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label} trend, latest ${values[values.length - 1]} of 10`}>
      <rect x="0" y={y(3)} width={W} height={y(0) - y(3)} fill="var(--good-bg)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

/* ---------- one area's pain over time (Body) ---------- */
export function PainLine({ points, label }: { points: PainPt[] & { at?: string }[]; label: string }) {
  const pts = [...points].sort((a, b) => (a.date === b.date ? (((a as { at?: string }).at ?? "") < ((b as { at?: string }).at ?? "") ? -1 : 1) : a.date < b.date ? -1 : 1)).slice(-20);
  if (pts.length < 2) return <p className="empty">A couple more checks and the trend shows up. Goal: 3 or below.</p>;
  const W = 480, H = 160, L = 26, R = 10, T = 10, B = 24;
  const x = (i: number) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (p: number) => T + ((10 - p) * (H - T - B)) / 10;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const color = (p: number) => (painClass(p) === "g" ? "var(--good)" : painClass(p) === "w" ? "var(--warn)" : "var(--bad)");
  return (
    <svg className="viz" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label} pain, last ${pts.length} entries`}>
      <rect x={L} y={y(3)} width={W - L - R} height={y(0) - y(3)} fill="var(--good-bg)" />
      {[0, 3, 5, 10].map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" /><text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>
      ))}
      <path d={area} fill="var(--accent)" opacity=".08" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.p)} r={i === pts.length - 1 ? 6 : 4.5} fill={color(p.p)} />)}
      <text x={L} y={H - 6}>{md(pts[0].date)}</text>
      <text x={W - R} y={H - 6} textAnchor="end">{md(pts[pts.length - 1].date)}</text>
    </svg>
  );
}
