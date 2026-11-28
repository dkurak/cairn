"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import PhaseBar from "@/components/PhaseBar";
import { CriteriaList, programHref, useProgramActions } from "@/components/Programs";
import { PageHeader, SectionCard, Tag } from "@/components/ui";
import { WeekStatusTag } from "@/components/WeekStatus";
import { dateRange, shortDate } from "@/lib/format";
import { effectivePhases, evaluateCriteria, phaseAtWeek, positionLabel, programPosition, weekRange } from "@/lib/programs";
import { planAheadPrompt, programHealth, remainingWeeks, replanPrompt, storedWeek, weekPlan, weekStatus } from "@/lib/programWeeks";
import { adoptDraftWeek } from "@/lib/actions";
import type { ProgramStatus } from "@/lib/types";

const STATUS: Record<ProgramStatus, string> = { active: "Active", paused: "Paused", idea: "Idea", done: "Done" };
const KIND = { event: "Event (a date to be ready for)", ongoing: "Ongoing", milestone: "Milestone (done when the body proves it)" } as const;

/** A program: the overview and how it's going, its phases (click in to a phase's first week) and every week. */
export default function ProgramPage() {
  const { id } = useParams<{ id: string }>();
  const { data, today, askCoach, sb, run } = useApp();
  const { setStatus, finish } = useProgramActions();
  const p = data.programs.find((x) => x.id === id);
  const back = <Link href="/plan">‹ Plan</Link>;
  if (!p) {
    return (
      <div className="page">
        <PageHeader title="Program" back={back} />
        <SectionCard><span className="empty">That program isn&apos;t here any more (it may have been deleted).</span></SectionCard>
      </div>
    );
  }

  const isActive = p.status === "active";
  const pos = programPosition(p, today);
  const phases = effectivePhases(p);
  const crit = p.kind === "milestone" ? evaluateCriteria(p, data) : null;
  const phaseTotal = phases.reduce((a, x) => a + x.weeks, 0);
  const total = pos.totalWeeks ?? Math.max(phaseTotal, isActive ? pos.week : 1);
  const state = (w: number) => (!isActive ? null : w < pos.week ? "past" : w === pos.week ? "now" : "future");
  const weeks = Array.from({ length: total }, (_, i) => i + 1);
  const health = isActive && data.weekPlansReady ? programHealth(data, p, today) : null;
  const ahead = isActive ? remainingWeeks(p, today).filter((w) => w <= total) : [];
  const thisWeek = isActive ? weekPlan(data, p, pos.week, today) : null;
  const planned = !!thisWeek && thisWeek.source !== "none" && thisWeek.items.length > 0;
  const isDraft = thisWeek?.source === "draft";
  const undrafted = ahead.filter((w) => !storedWeek(data, p.id, w));
  const drafted = ahead.filter((w) => storedWeek(data, p.id, w));

  return (
    <div className="page">
      <PageHeader title={p.title} back={back} coach={{ text: `Check in on my "${p.title}" program - am I on track?`, send: true }} />
      <div className="two">
        <div className="stack">
          <SectionCard title="Overview" aside={<Tag>{STATUS[p.status]}</Tag>}>
            {p.goal && <p className="m0">{p.goal}</p>}
            <span className="note">{positionLabel(p, pos, crit ?? undefined)}</span>
            {health && health.state !== "unknown" && (
              <div className="grid-6">
                <span className="row nowrap gap-6"><strong>How it's going</strong><Tag tone={health.tone}>{health.label}</Tag></span>
                {health.reasons.length > 0 && <ul className="reasons small">{health.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
              </div>
            )}
            {isActive && pos.totalWeeks && (
              <div className="meter" role="progressbar" aria-label="Weeks done" aria-valuemin={0} aria-valuemax={pos.totalWeeks} aria-valuenow={Math.min(pos.week - 1, pos.totalWeeks)}>
                <span style={{ width: `${Math.min(100, ((pos.week - 1) / pos.totalWeeks) * 100)}%` }} />
              </div>
            )}
            <dl className="facts">
              <div><dt>Type</dt><dd>{KIND[p.kind]}</dd></div>
              {p.start_date && <div><dt>Started</dt><dd>{shortDate(p.start_date)}</dd></div>}
              {p.target_date && <div><dt>{p.kind === "event" ? "Event day" : "Aiming for"}</dt><dd>{shortDate(p.target_date)}</dd></div>}
              {p.days_per_week && <div><dt>Days a week</dt><dd>{p.days_per_week}</dd></div>}
              {p.preferences?.session_minutes && <div><dt>Session length</dt><dd>{p.preferences.session_minutes} min</dd></div>}
              {p.preferences?.equipment && <div><dt>Equipment</dt><dd>{p.preferences.equipment}</dd></div>}
            </dl>
            {p.notes && <p className="note m0">{p.notes}</p>}
            {p.status === "done" && p.outcome && <p className="m0"><strong>How it went:</strong> {p.outcome}</p>}
            {crit && <CriteriaList crit={crit} />}
            <div className="row actions">
              {isActive ? (
                <>
                  {!pos.over && !planned && <button className="primary" onClick={() => askCoach(`Build week ${pos.week} of my "${p.title}" program.`)}>Build this week</button>}
                  {!pos.over && isDraft && <button className="primary" onClick={() => run(() => adoptDraftWeek(sb, data, p, pos.week), "Couldn't start that week. Try again.")}>Use the draft</button>}
                  {!pos.over && planned && !isDraft && <button className="primary" onClick={() => askCoach(`Check in on my "${p.title}" program - am I on track?`)}>Check in</button>}
                  {!pos.over && planned && <button onClick={() => askCoach(`Adjust week ${pos.week} of my "${p.title}" program: `, false)}>Adjust this week</button>}
                  {data.weekPlansReady && undrafted.length > 0 && <button onClick={() => askCoach(planAheadPrompt(p, undrafted))}>Plan ahead</button>}
                  {data.weekPlansReady && drafted.length > 0 && <button onClick={() => askCoach(replanPrompt(p, ahead, health?.reasons ?? []))}>Re-plan the rest</button>}
                  <button onClick={() => askCoach(`I want to change my "${p.title}" program: `, false)}>Change program</button>
                  <button onClick={() => setStatus(p, "paused")}>Pause</button>
                  {(pos.over || crit?.allMet) && <button onClick={() => setStatus(p, "done")}>Mark done</button>}
                  {crit && !crit.allMet && <button onClick={() => finish(p, true)}>Call it done</button>}
                </>
              ) : p.status === "done" ? null : (
                <button className="primary" onClick={() => setStatus(p, "active")}>{p.status === "paused" ? "Resume" : "Start"}</button>
              )}
            </div>
            {isActive && !data.weekPlansReady && <span className="note">Planning ahead and re-planning need a database update (migration 0009).</span>}
          </SectionCard>

          {phases.length > 0 && (
            <SectionCard title="Phases" aside="tap a phase to open its first week">
              <PhaseBar phases={phases} current={isActive ? pos.phaseIndex : -1} week={isActive ? pos.week : undefined} hrefFor={(start, i) => programHref(p.id, isActive && i === pos.phaseIndex ? pos.week : start)} />
              <div className="phasetiles">
                {(() => {
                  let before = 0;
                  return phases.map((ph, i) => {
                    const start = before + 1, end = before + ph.weeks;
                    before = end;
                    const here = isActive && i === pos.phaseIndex;
                    const past = isActive && i < pos.phaseIndex;
                    return (
                      <div key={i} className={`ptile ${here ? "here" : past ? "past" : ""}`}>
                        <div className="ptile-head"><strong>{ph.name}</strong><Tag>{here ? "Now" : past ? "Done" : ph.weeks > 1 ? `Weeks ${start}-${end}` : `Week ${start}`}</Tag></div>
                        <span>{ph.focus}</span>
                        <div className="weeklinks">
                          {Array.from({ length: ph.weeks }, (_, k) => start + k).map((w) => <Link key={w} href={programHref(p.id, w)} className={isActive && w === pos.week ? "here" : ""}>Week {w}</Link>)}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </SectionCard>
          )}
        </div>

        <SectionCard title="Weeks" aside={`${total} total`}>
          <ul className="weekrows">
            {weeks.map((w) => {
              const st = state(w);
              const ph = phaseAtWeek(p, w, phases).phase;
              const r = weekRange(p, w);
              const wp = weekPlan(data, p, w, today);
              const ws = weekStatus({ program: p, week: w, items: wp.items, log: data.log, workouts: data.workouts, today });
              return (
                <li key={w}>
                  <Link href={programHref(p.id, w)}>
                    <span className="wk">Wk {w}</span>
                    <span>{ph?.name ?? "-"}<br /><span className="meta">{r ? dateRange(r.start, r.end) : ""}{wp.items.length ? `${r ? " · " : ""}${wp.items.length} days planned` : ""}</span></span>
                    <span className="tags">
                      {wp.source === "draft" && <Tag tone="accent">Draft</Tag>}
                      {st === "now" && <Tag>This week</Tag>}
                      {ws && ws.state !== "upcoming" ? <WeekStatusTag status={ws} /> : st === "past" ? <Tag>Done</Tag> : st === "future" && wp.source !== "draft" ? <Tag>Upcoming</Tag> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
