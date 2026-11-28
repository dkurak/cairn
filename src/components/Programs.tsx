"use client";
import Link from "next/link";
import { useApp } from "./AppProvider";
import PhaseBar from "./PhaseBar";
import { activeProgram, effectivePhases, evaluateCriteria, needsNewWeek, positionLabel, programPosition } from "@/lib/programs";
import { activePlan } from "@/lib/rules";
import { shortDate as fmtDate } from "@/lib/format";
import { ConfirmButton, SectionCard, Tag } from "./ui";
import type { Program, ProgramStatus } from "@/lib/types";

const STATUS: Record<ProgramStatus, string> = { active: "Active", paused: "Paused", idea: "Idea", done: "Done" };

export const programHref = (id: string, week?: number) => `/plan/program/${id}${week ? `/week/${week}` : ""}`;

/** Start / pause / finish / delete a program. Shared by the Plan card and the program page. */
export function useProgramActions() {
  const { data, sb, run, askCoach } = useApp();
  const setStatus = (p: Program, status: ProgramStatus) =>
    run(async () => {
      if (status === "active") {
        const r = await sb.from("programs").update({ status: "paused" }).eq("user_id", data.profile.id).eq("status", "active");
        if (r.error) throw r.error;
      }
      const restart = status === "active" && (!p.start_date || p.status !== "paused");
      const { error } = await sb.from("programs").update({ status, ...(restart ? { start_date: new Date().toISOString().slice(0, 10) } : {}) }).eq("id", p.id);
      if (error) throw error;
    });
  const remove = (p: Program) => void run(async () => { const { error } = await sb.from("programs").delete().eq("id", p.id); if (error) throw error; });
  const finish = (p: Program, early: boolean) => askCoach(early
    ? `I think my "${p.title}" is done - can we call it complete? Here's how it's going: `
    : `All my "${p.title}" checks are met - let's call it done. How it went: `, false);
  return { setStatus, remove, finish };
}

/** The "done when" checks of a milestone program. */
export function CriteriaList({ crit }: { crit: NonNullable<ReturnType<typeof evaluateCriteria>> }) {
  if (!crit.total) return null;
  return (
    <ul className="checks" aria-label="Done when">
      {crit.results.map((r, i) => (
        <li key={i} className={r.met ? "met" : ""}><span className="box" aria-hidden="true">{r.met ? "✓" : ""}</span><span>{r.label}</span><span className="meta">{r.met ? "met" : r.progress}</span></li>
      ))}
    </ul>
  );
}

/** "Week 4 of Jan 18 big ski day (Build) - get this week's plan" when the program has moved on. */
export function ProgramWeekBanner() {
  const { data, askCoach } = useApp();
  const due = needsNewWeek(data, data.state.travel ? undefined : activePlan(data));
  if (!due || data.state.travel) return null;
  const { program: p, pos } = due;
  return (
    <div className="banner good">
      <strong>Week {pos.week}{pos.totalWeeks ? ` of ${pos.totalWeeks}` : ""} · {p.title}</strong>
      <span>{pos.phase ? `${pos.phase}: ${pos.phaseFocus}. ` : ""}Time for this week&apos;s plan.</span>
      <div className="row">
        <button className="primary" onClick={() => askCoach(`Build week ${pos.week} of my "${p.title}" program.`)}>Build this week</button>
        <Link href={programHref(p.id, pos.week)}>See the week</Link>
      </div>
    </div>
  );
}

export default function Programs() {
  const { data, askCoach } = useApp();
  const { setStatus, remove, finish } = useProgramActions();
  const active = activeProgram(data);
  const bank = data.programs.filter((p) => p.status !== "active");

  return (
    <SectionCard className="programs" title="Programs" aside={data.programs.length ? `${data.programs.length} saved` : ""}>
      {active ? (() => {
        const pos = programPosition(active);
        const crit = active.kind === "milestone" ? evaluateCriteria(active, data) : null;
        return (
          <>
            <div className="program-head"><Link href={programHref(active.id)} className="title">{active.title}</Link><Tag>{active.kind === "milestone" ? "Milestone" : "Active"}</Tag></div>
            <span className="note">{positionLabel(active, pos, crit ?? undefined)}</span>
            {active.goal && <span>{active.goal}</span>}
            <PhaseBar phases={effectivePhases(active)} current={pos.phaseIndex} week={pos.week} hrefFor={(start, i) => programHref(active.id, i === pos.phaseIndex ? pos.week : start)} />
            {pos.phase && <span className="note"><strong>{pos.phase}:</strong> {pos.phaseFocus}</span>}
            {crit && <CriteriaList crit={crit} />}
            {crit?.allMet && (
              <div className="banner good"><strong>All checks met</strong><span>Everything you set out to prove is there. Call it done?</span>
                <div className="row"><button className="primary" onClick={() => finish(active, false)}>Call it done</button></div>
              </div>
            )}
            <div className="row">
              <button className="primary" onClick={() => askCoach(pos.over ? `My "${active.title}" program is over. Here's how it went: ` : `Build week ${pos.week} of my "${active.title}" program.`, !pos.over)}>{pos.over ? "How did it go?" : "This week"}</button>
              <button onClick={() => askCoach(`Check in on my "${active.title}" program - am I on track?`)}>Check in</button>
              <button onClick={() => setStatus(active, "paused")}>Pause</button>
              {pos.over && <button onClick={() => setStatus(active, "done")}>Mark done</button>}
              {crit && !crit.allMet && <button onClick={() => finish(active, true)}>Call it done</button>}
            </div>
            <Link href={programHref(active.id)}>Program details ›</Link>
          </>
        );
      })() : (
        <span className="empty">No active program. Tell the coach what you want to get ready for - a big day, a trip, more strength - and it will build one.</span>
      )}
      {bank.length > 0 && (
        <ul className="program-bank">
          {bank.map((p) => (
            <li key={p.id}>
              <span>
                <Link href={programHref(p.id)}><strong>{p.title}</strong></Link> <Tag>{STATUS[p.status]}</Tag>
                <br /><span className="meta">{p.status === "done" ? `Done${p.completed_at ? ` ${fmtDate(p.completed_at.slice(0, 10))}` : ""}${p.outcome ? ` - ${p.outcome}` : ""}` : `${p.kind === "event" && p.target_date ? `Event ${fmtDate(p.target_date)}` : p.kind === "milestone" ? "Done when checks are met" : "Ongoing"}${p.weeks ? ` · ${p.weeks} wk` : ""}${p.days_per_week ? ` · ${p.days_per_week} days/wk` : ""}`}</span>
              </span>
              <span className="row nowrap">
                {p.status !== "done" && <button onClick={() => setStatus(p, "active")}>{p.status === "paused" ? "Resume" : "Start"}</button>}
                <ConfirmButton ariaLabel={`Delete ${p.title}`} confirmLabel="Delete?" onConfirm={() => remove(p)}>✕</ConfirmButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row"><button onClick={() => askCoach("I have a new goal: ", false)}>New goal program</button></div>
    </SectionCard>
  );
}
