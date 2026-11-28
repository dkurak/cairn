"use client";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import RecentList from "@/components/RecentList";
import { Heatmap, MixBars, PainTrend, Spark, StatTile, WeeklyBars } from "@/components/charts/Charts";
import { areaSeries, computeStats, RANGES, weekStart, type RangeKey } from "@/lib/stats";
import { deleteEntry, updateEntry } from "@/lib/actions";
import { primaryArea, sortedLog } from "@/lib/rules";
import { shortDate as md } from "@/lib/format";
import { PageHeader, PainChip, SectionCard } from "@/components/ui";

export default function History() {
  const { data, sb, today, run, openLog } = useApp();
  const [range, setRange] = useState<RangeKey>("4w");
  const [editingId, setEditingId] = useState<string | null>(null);
  const st = useMemo(() => computeStats(data, range, today), [data, range, today]);
  const primary = primaryArea(data.areas);
  const periodLabel = range === "max" ? `since ${md(st.win.start)}` : st.win.clamped ? `since ${md(st.win.start)}` : `${st.win.weeks} weeks`;

  const sessionDelta = st.prevSessions ? st.sessions.length - st.prevSessions.length : null;
  const inWin = sortedLog(data.log).filter((e) => e.date >= st.win.start && e.date <= st.win.end);
  const primaryChecks = primary ? areaSeries(primary, data.checks, st.win).map((c) => ({ date: c.date, p: c.pain })) : [];
  const activeAreas = data.areas.filter((a) => a.active);
  const hasData = st.sessions.length > 0 || primaryChecks.length > 0;

  return (
    <div className="page">
      <PageHeader title="History" coach={{ text: "Looking at my training over this period, what do you notice and what should I change?" }} />
      <div className="seg" role="group" aria-label="Time range" style={{ justifySelf: "start", maxWidth: "100%" }}>
        {RANGES.map((r) => <button key={r.key} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{r.label}</button>)}
      </div>

      {st.win.clamped && (
        <p className="note" style={{ margin: 0 }}>Tracking started {md(st.win.start)}, so that&apos;s where this view begins. It fills out as you keep logging.</p>
      )}

      {!hasData && (
        <SectionCard>
          <span className="empty">Nothing in this range yet. Log a session or a check-in and it will show up here.</span>
        </SectionCard>
      )}

      <div className="kpis">
        <StatTile
          label={`Sessions · ${periodLabel}`}
          value={String(st.sessions.length)}
          sub={st.weekly.length ? `${(st.sessions.length / st.weekly.length).toFixed(1)} per week` : undefined}
          delta={sessionDelta == null ? null : { text: `${sessionDelta > 0 ? "+" : ""}${sessionDelta} vs the ${st.win.weeks} weeks before`, dir: sessionDelta > 0 ? "up" : sessionDelta < 0 ? "down" : "flat", good: null }}
        />
        <StatTile label="Active days" value={String(st.activeDays)} sub={`of ${st.totalDays} days`} />
        <StatTile
          label="In the green zone"
          value={st.greenPct == null ? "-" : `${st.greenPct}%`}
          sub={st.greenPct == null ? "no pain logged on sessions" : `${st.greenN} of ${st.paintedN} sessions at 3/10 or less`}
          delta={st.avgPain == null ? null : { text: `avg ${st.avgPain.toFixed(1)}/10 during`, dir: "flat", good: st.avgPain <= 3 ? true : null }}
        />
        {st.tours.length ? (
          <StatTile label="Tour vert" value={st.vert.toLocaleString()} sub={`ft over ${st.tours.length} tour${st.tours.length === 1 ? "" : "s"}`} />
        ) : (
          <StatTile label="Weekly streak" value={String(st.streak)} sub={st.streak === 1 ? "week in a row with a session" : "weeks in a row with a session"} />
        )}
      </div>

      <div className="grid2">
        <SectionCard title="Sessions per week">
          <WeeklyBars weekly={st.weekly} currentStart={weekStart(today)} from={st.win.start} />
          <details>
            <summary className="meta" style={{ cursor: "pointer" }}>View as table</summary>
            <table style={{ width: "100%", fontSize: ".85rem", borderCollapse: "collapse", marginTop: 6 }}>
              <thead><tr><th align="left">Week of</th><th align="right">Sessions</th></tr></thead>
              <tbody>{[...st.weekly].reverse().map((w) => <tr key={w.start} style={{ borderTop: "1px solid var(--line)" }}><td>{md(w.start < st.win.start ? st.win.start : w.start)}</td><td align="right">{w.count}</td></tr>)}</tbody>
            </table>
          </details>
        </SectionCard>
        <SectionCard title="What you trained">
          <MixBars rows={st.mix} />
        </SectionCard>
      </div>

      <SectionCard title="Pain">
        <PainTrend win={st.win} sessions={st.painSessions} checks={primaryChecks} checkLabel={primary?.name ?? "Daily check"} />
      </SectionCard>

      <SectionCard title="Activity">
        <Heatmap win={st.win} perDay={st.perDay} today={today} />
      </SectionCard>

      <SectionCard title="Body areas">
        {activeAreas.length ? (
          <div className="areas">
            {activeAreas.map((a) => {
              const pts = areaSeries(a, data.checks, st.win);
              const first = pts[0], last = pts[pts.length - 1];
              const d = first && last ? last.pain - first.pain : 0;
              return (
                <div className="row-a" key={a.id}>
                  <span>
                    <strong>{a.name}</strong><br />
                    {last ? (
                      <span className="meta">
                        <PainChip p={last.pain} />{" "}
                        {pts.length > 1 ? <>{d === 0 ? "no change" : `${d < 0 ? "down" : "up"} ${Math.abs(d)}`} since {md(first.date)}</> : "first check"}
                      </span>
                    ) : <span className="meta">no checks in this range</span>}
                  </span>
                  <Spark values={pts.map((p) => p.pain)} label={a.name} />
                </div>
              );
            })}
          </div>
        ) : <span className="empty">Track an area on the Body tab to see its trend here.</span>}
      </SectionCard>

      {st.tours.length > 0 && (
        <SectionCard title="Tours">
          <table style={{ width: "100%", fontSize: ".92rem", borderCollapse: "collapse" }}>
            <thead><tr><th align="left">Date</th><th align="right">Vert</th><th align="right">During</th><th align="right">Next AM</th></tr></thead>
            <tbody>
              {st.tours.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px 0" }}>{md(t.date)}</td>
                  <td align="right">{t.vert_ft ? `${t.vert_ft.toLocaleString()} ft` : "-"}</td>
                  <td align="right">{t.pain_during != null ? <PainChip p={t.pain_during} /> : "-"}</td>
                  <td align="right">{t.pain_next_am != null ? <PainChip p={t.pain_next_am} /> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <SectionCard title="Log">
        <RecentList
          log={inWin}
          limit={400}
          areas={data.areas}
          checks={data.checks}
          onLogDay={(d) => openLog({ whats: ["Rest"], rest: true, date: d })}
          editingId={editingId}
          setEditingId={setEditingId}
          onSave={(id, patch) => run(() => updateEntry(sb, id, patch), "Couldn't save that. Try again.").then((ok) => ok && setEditingId(null))}
          workouts={data.workouts}
          onDelete={(id) => run(() => deleteEntry(sb, id), "Couldn't delete. Try again.")}
        />
      </SectionCard>
    </div>
  );
}
