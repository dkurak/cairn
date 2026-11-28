"use client";
// The program's phases, always on the program pages. The phase you're viewing is highlighted; below it: the goal,
// how you should feel coming out, its weeks, and the workouts in it. Tapping a phase swaps the week below (same layout).
import Link from "next/link";
import { useApp } from "./AppProvider";
import PhaseBar from "./PhaseBar";
import { programHref } from "./Programs";
import { SectionCard, Tag } from "./ui";
import { effectivePhases, phaseAtWeek, programPosition } from "@/lib/programs";
import { weekPlan } from "@/lib/programWeeks";
import type { Program } from "@/lib/types";

export default function PhaseExplorer({ p, viewWeek }: { p: Program; viewWeek: number }) {
  const { data, today } = useApp();
  const phases = effectivePhases(p);
  if (!phases.length) return null;
  const isActive = p.status === "active";
  const pos = programPosition(p, today);
  const { index, startWeek, endWeek } = phaseAtWeek(p, viewWeek, phases);
  const ph = phases[index];
  if (!ph) return null;
  const weeks = Array.from({ length: endWeek - startWeek + 1 }, (_, i) => startWeek + i);
  const isNow = isActive && index === pos.phaseIndex;
  const isPast = isActive && index < pos.phaseIndex;

  // the workouts planned across this phase: library workouts as links, other named days (a run, a tour) as plain chips
  const lib = new Map<string, { id: string; name: string; category: string }>();
  const other = new Set<string>();
  for (const w of weeks) {
    for (const it of weekPlan(data, p, w, today).items) {
      if (it.kind === "rest") continue;
      const found = it.workout_ids.map((id) => data.workouts.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
      if (found.length) found.forEach((x) => lib.set(x.id, { id: x.id, name: x.name, category: x.category }));
      else if (it.title) other.add(it.title);
    }
  }
  const planned = weeks.filter((w) => weekPlan(data, p, w, today).items.length > 0);

  return (
    <SectionCard title="Phases" aside="tap one to see its weeks">
      <PhaseBar phases={phases} current={index} week={isNow ? pos.week : undefined} hrefFor={(start, i) => programHref(p.id, isActive && i === pos.phaseIndex ? pos.week : start)} />
      <div className="phasedetail">
        <div className="ptile-head"><strong>{ph.name}</strong><Tag>{isNow ? "Now" : isPast ? "Done" : weeks.length > 1 ? `Weeks ${startWeek}-${endWeek}` : `Week ${startWeek}`}</Tag></div>
        {ph.focus && <span className="clamp2" title={ph.focus}>{ph.focus}</span>}
        {ph.outcome && <span className="note"><strong>Coming out:</strong> {ph.outcome}</span>}
        <div className="weeklinks" aria-label="Weeks in this phase">
          {weeks.map((w) => {
            const wp = weekPlan(data, p, w, today);
            return <Link key={w} href={programHref(p.id, w)} className={`${w === viewWeek ? "here" : ""} ${wp.source === "draft" ? "draft" : ""}`} aria-current={w === viewWeek ? "page" : undefined} title={wp.source === "draft" ? "Drafted ahead" : undefined}>Week {w}</Link>;
          })}
        </div>
        {lib.size + other.size > 0 ? (
          <div className="chips" aria-label="Workouts in this phase">
            {[...lib.values()].map((w) => <Link key={w.id} href={`/library/${w.id}`}>{w.name}<span className="cat">{w.category}</span></Link>)}
            {[...other].map((t) => <span key={t} className="chip">{t}</span>)}
          </div>
        ) : <span className="note">{planned.length ? "Rest and open days only so far." : "No workouts planned in this phase yet."}</span>}
      </div>
    </SectionCard>
  );
}
