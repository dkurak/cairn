"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "@/components/AppProvider";
import PhaseExplorer from "@/components/PhaseExplorer";
import { CriteriaList, useProgramActions } from "@/components/Programs";
import { PageHeader, SectionCard, Tag } from "@/components/ui";
import { adoptDraftWeek } from "@/lib/actions";
import { shortDate } from "@/lib/format";
import { evaluateCriteria, positionLabel, programPosition } from "@/lib/programs";
import { planAheadPrompt, programHealth, remainingWeeks, replanPrompt, storedWeek, weekPlan } from "@/lib/programWeeks";
import type { ProgramStatus } from "@/lib/types";

const STATUS: Record<ProgramStatus, string> = { active: "Active", paused: "Paused", idea: "Idea", done: "Done" };
const KIND = { event: "Event (a date to be ready for)", ongoing: "Ongoing", milestone: "Milestone (done when the body proves it)" } as const;

/** Everything on a program's pages shares this top: the program, its health and actions, and the phases. Only the week below changes. */
export default function ProgramLayout({ children }: { children: ReactNode }) {
  const { id, n } = useParams<{ id: string; n?: string }>();
  const { data, sb, today, run, askCoach } = useApp();
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
  const crit = p.kind === "milestone" ? evaluateCriteria(p, data) : null;
  const health = isActive && data.weekPlansReady ? programHealth(data, p, today) : null;
  const ahead = isActive ? remainingWeeks(p, today).filter((w) => !pos.totalWeeks || w <= pos.totalWeeks) : [];
  const undrafted = ahead.filter((w) => !storedWeek(data, p.id, w));
  const drafted = ahead.filter((w) => storedWeek(data, p.id, w));
  const thisWeek = isActive ? weekPlan(data, p, pos.week, today) : null;
  const planned = !!thisWeek && thisWeek.source !== "none" && thisWeek.items.length > 0;
  const isDraft = thisWeek?.source === "draft";
  const viewWeek = Number.parseInt(n ?? "", 10) || (isActive ? Math.min(pos.week, pos.totalWeeks ?? pos.week) : 1);

  return (
    <div className="page">
      <PageHeader title={p.title} back={back} coach={{ text: `Check in on my "${p.title}" program - am I on track?`, send: true }} />
      <SectionCard title="Program" aside={<span className="row nowrap gap-6">{health && health.state !== "unknown" && <Tag tone={health.tone}>{health.label}</Tag>}<Tag>{STATUS[p.status]}</Tag></span>}>
        <span className="note">{positionLabel(p, pos, crit ?? undefined)}</span>
        {p.goal && <p className="m0 clamp2" title={p.goal}>{p.goal}</p>}
        {health && health.reasons.length > 0 && <ul className="reasons small">{health.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
        {isActive && pos.totalWeeks && (
          <div className="meter" role="progressbar" aria-label="Weeks done" aria-valuemin={0} aria-valuemax={pos.totalWeeks} aria-valuenow={Math.min(pos.week - 1, pos.totalWeeks)}>
            <span style={{ width: `${Math.min(100, ((pos.week - 1) / pos.totalWeeks) * 100)}%` }} />
          </div>
        )}
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
        <details className="more">
          <summary>Program details</summary>
          <dl className="facts">
            <div><dt>Type</dt><dd>{KIND[p.kind]}</dd></div>
            {p.start_date && <div><dt>Started</dt><dd>{shortDate(p.start_date)}</dd></div>}
            {p.target_date && <div><dt>{p.kind === "event" ? "Event day" : "Aiming for"}</dt><dd>{shortDate(p.target_date)}</dd></div>}
            {p.days_per_week && <div><dt>Days a week</dt><dd>{p.days_per_week}</dd></div>}
            {p.preferences?.session_minutes && <div><dt>Session length</dt><dd>{p.preferences.session_minutes} min</dd></div>}
            {p.preferences?.equipment && <div><dt>Equipment</dt><dd>{p.preferences.equipment}</dd></div>}
          </dl>
          {p.goal && <p className="m0">{p.goal}</p>}
          {p.notes && <p className="note m0">{p.notes}</p>}
          {p.status === "done" && p.outcome && <p className="m0"><strong>How it went:</strong> {p.outcome}</p>}
        </details>
      </SectionCard>

      <PhaseExplorer p={p} viewWeek={viewWeek} />
      {children}
    </div>
  );
}
