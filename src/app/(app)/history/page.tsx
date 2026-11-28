"use client";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import RecentList from "@/components/RecentList";
import { PainTrend, Spark, StatTile, StackedBars, TypeHeatmap, TypeLegend } from "@/components/charts/Charts";
import Link from "next/link";
import { addDays } from "@/lib/rules";
import { allSessions, areaSeries, computeStats, GROUPS, groupInfo, RANGES, weekStart, type RangeKey } from "@/lib/stats";
import { deleteEntry, updateEntry } from "@/lib/actions";
import { primaryArea, sortedLog } from "@/lib/rules";
import { shortDate as md, weekday } from "@/lib/format";
import { PageHeader, PainChip, SectionCard } from "@/components/ui";
import { optEntry, optEntryGone } from "@/lib/optimistic";

export default function History() {
  const { data, sb, today, run, openLog } = useApp();
  const [range, setRange] = useState<RangeKey>("4w");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [logDays, setLogDays] = useState(14);
  const st = useMemo(() => computeStats(data, range, today), [data, range, today]);
  const primary = primaryArea(data.areas);
  const periodLabel = range === "max" ? `since ${md(st.win.start)}` : st.win.clamped ? `since ${md(st.win.start)}` : `${st.win.weeks} weeks`;

  const everything = useMemo(() => allSessions(data), [data]);
  const prevStart = addDays(st.win.rangeStart, -7 * st.win.weeks);
  const prevCount = st.prevSessions ? everything.filter((x) => x.date >= prevStart && x.date < st.win.rangeStart).length : null;
  const sessionDelta = prevCount == null ? null : st.sess.length - prevCount;
  const dayNames = useMemo(() => { const m = new Map<string, string[]>(); for (const x of st.sess) m.set(x.date, [...(m.get(x.date) ?? []), x.what]); return m; }, [st.sess]);
  const wk = weekStart(today);
  const thisWeek = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const activeDays = new Set(st.sess.map((x) => x.date)).size;
  const present = st.groupRows.map((g) => g.key);
  const inWin = sortedLog(data.log).filter((e) => e.date >= st.win.start && e.date <= st.win.end);
  const primaryChecks = primary ? areaSeries(primary, data.checks, st.win).map((c) => ({ date: c.date, p: c.pain })) : [];
  const activeAreas = data.areas.filter((a) => a.active);
  const hasData = st.sess.length > 0 || primaryChecks.length > 0;

  return (
    <div className="page">
      <PageHeader title="History" coach={{ text: "Looking at my training over this period, what do you notice and what should I change?" }} />
      <div className="seg self-start" role="group" aria-label="Time range">
        {RANGES.map((r) => <button key={r.key} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{r.label}</button>)}
      </div>

      {st.win.clamped && (
        <p className="note m0">Tracking started {md(st.win.start)}, so that&apos;s where this view begins. It fills out as you keep logging.</p>
      )}

      {!hasData && (
        <SectionCard>
          <span className="empty">Nothing in this range yet. Log a session or a check-in and it will show up here.</span>
        </SectionCard>
      )}

      <SectionCard title="This week" aside={`${thisWeek.filter((d) => d <= today && everything.some((x) => x.date === d)).length} active days`}>
        <div className="weekstrip">
          {thisWeek.map((d) => {
            const gs = everything.filter((x) => x.date === d);
            return (
              <Link key={d} href={d === today ? "/" : `/day/${d}`} className={`wd${d === today ? " now" : ""}${d > today ? " future" : ""}`} aria-label={`${weekday(d)} ${md(d)}: ${gs.length ? gs.map((x) => x.what).join(", ") : "nothing logged"}`}>
                <span className="dow">{weekday(d).slice(0, 3)}</span>
                <span className="dots">{gs.map((x) => <i key={x.id} style={{ background: groupInfo(x.group).color }} title={x.what} />)}</span>
              </Link>
            );
          })}
        </div>
      </SectionCard>

      <div className="kpis">
        <StatTile
          label={`Sessions · ${periodLabel}`}
          value={String(st.sess.length)}
          sub={st.series.length ? `${(st.sess.length / Math.max(1, st.win.weeks)).toFixed(1)} per week` : undefined}
          delta={sessionDelta == null ? null : { text: `${sessionDelta > 0 ? "+" : ""}${sessionDelta} vs the ${st.win.weeks} weeks before`, dir: sessionDelta > 0 ? "up" : sessionDelta < 0 ? "down" : "flat", good: null }}
        />
        <StatTile label="Active days" value={String(activeDays)} sub={`of ${st.totalDays} days`} />
        <StatTile label="Variety" value={String(st.variety)} sub={st.variety === 1 ? "type of activity" : "types of activity"} delta={st.top ? { text: `${st.top.label} is ${st.top.pct}%`, dir: "flat", good: st.top.pct <= 50 ? true : null } : null} />
        <StatTile
          label="In the green zone"
          value={st.greenPct == null ? "-" : `${st.greenPct}%`}
          sub={st.greenPct == null ? "no pain logged on sessions" : `${st.greenN} of ${st.paintedN} sessions at 3/10 or less`}
          delta={st.avgPain == null ? null : { text: `avg ${st.avgPain.toFixed(1)}/10 during`, dir: "flat", good: st.avgPain <= 3 ? true : null }}
        />
      </div>

      <div className="grid2">
        <SectionCard title={`Sessions per ${st.bucket}`} aside="by activity">
          <StackedBars series={st.series} bucket={st.bucket} currentStart={wk} />
          <TypeLegend keys={present} />
          <p className="note m0">
            {st.variety} different {st.variety === 1 ? "activity" : "activities"} in this range{st.top ? `; ${st.top.label} is ${st.top.pct}% of your sessions` : ""}.
            {st.dormant.length > 0 && <> Not done in the last 4 weeks: {st.dormant.slice(0, 4).map((d) => `${d.label} (${d.days >= 56 ? `${Math.round(d.days / 7)} wk` : `${d.days} d`} ago)`).join(", ")}.</>}
          </p>
          <details>
            <summary className="meta">View as table</summary>
            <table className="tbl">
              <thead><tr><th align="left">{st.bucket === "week" ? "Week of" : "Month"}</th>{present.map((k) => <th key={k} align="right">{groupInfo(k).label}</th>)}</tr></thead>
              <tbody>{[...st.series].reverse().map((b) => <tr key={b.start}><td>{st.bucket === "week" ? md(b.start < st.win.start ? st.win.start : b.start) : new Date(b.start + "T12:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" })}</td>{present.map((k) => <td key={k} align="right">{b.counts[k] ?? 0}</td>)}</tr>)}</tbody>
            </table>
          </details>
        </SectionCard>
        <SectionCard title="By activity" aside={`${st.sess.length} sessions`}>
          {st.groupRows.length ? (
            <div className="typerows">
              {st.groupRows.map((g) => (
                <div key={g.key} className="typerow">
                  <span className="tname"><span className="sw" style={{ background: g.color }} aria-hidden="true" />{g.label}</span>
                  <span className="ttrack" aria-hidden="true"><span className="tfill" style={{ width: `${Math.max(4, (g.count / st.groupRows[0].count) * 100)}%`, background: g.color }} /></span>
                  <span className="tmeta"><strong>{g.count}</strong> · {g.pct}%</span>
                  <span className="tsub">
                    {g.daysAgo == null ? "" : g.daysAgo === 0 ? "last: today" : `last: ${g.daysAgo >= 14 ? `${Math.round(g.daysAgo / 7)} wk` : `${g.daysAgo} d`} ago`}
                    {g.vert > 0 ? ` · ${g.vert.toLocaleString()} ft of vert` : ""}{g.miles >= 1 ? ` · ${Math.round(g.miles).toLocaleString()} mi` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : <span className="empty">Nothing logged in this range.</span>}
        </SectionCard>
      </div>

      <SectionCard title="Activity calendar">
        <TypeHeatmap win={st.win} perDay={st.perDayGroups} names={dayNames} today={today} />
        <TypeLegend keys={present} />
      </SectionCard>

      <SectionCard title="Pain">
        <PainTrend win={st.win} sessions={st.painSessions} checks={primaryChecks} checkLabel={primary?.name ?? "Daily check"} />
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
          <table className="tbl lg">
            <thead><tr><th align="left">Date</th><th align="right">Vert</th><th align="right">During</th><th align="right">Next AM</th></tr></thead>
            <tbody>
              {st.tours.map((t) => (
                <tr key={t.id}>
                  <td>{md(t.date)}</td>
                  <td align="right">{t.vert_ft ? `${t.vert_ft.toLocaleString()} ft` : "-"}</td>
                  <td align="right">{t.pain_during != null ? <PainChip p={t.pain_during} /> : "-"}</td>
                  <td align="right">{t.pain_next_am != null ? <PainChip p={t.pain_next_am} /> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <SectionCard title="Recent log" aside={`last ${logDays} days`}>
        <RecentList
          log={inWin}
          limit={logDays}
          areas={data.areas}
          checks={data.checks}
          onLogDay={(d) => openLog({ whats: ["Rest"], rest: true, date: d })}
          editingId={editingId}
          setEditingId={setEditingId}
          onSave={(id, patch) => run(() => updateEntry(sb, id, patch), "Couldn't save that. Try again.", optEntry(id, patch)).then((ok) => ok && setEditingId(null))}
          workouts={data.workouts}
          onDelete={(id) => run(() => deleteEntry(sb, id), "Couldn't delete. Try again.", optEntryGone(id))}
        />
        <div className="loglimit">
          <button onClick={() => setLogDays((n) => n + 30)}>Show 30 more days</button>
          {logDays > 14 && <button className="link" onClick={() => setLogDays(14)}>Back to 14 days</button>}
        </div>
      </SectionCard>
    </div>
  );
}
