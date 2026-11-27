"use client";
import { useApp } from "./AppProvider";
import PhaseBar from "./PhaseBar";
import { activeProgram, effectivePhases, evaluateCriteria, fmtDate, needsNewWeek, positionLabel, programPosition } from "@/lib/programs";
import { activePlan } from "@/lib/rules";
import type { Program, ProgramStatus } from "@/lib/types";

const STATUS: Record<ProgramStatus, string> = { active: "Active", paused: "Paused", idea: "Idea", done: "Done" };

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
      <div className="row"><button className="primary" onClick={() => askCoach(`Build week ${pos.week} of my "${p.title}" program.`)}>Build this week</button></div>
    </div>
  );
}

export default function Programs() {
  const { data, sb, run, askCoach } = useApp();
  const active = activeProgram(data);
  const bank = data.programs.filter((p) => p.status !== "active");
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
  const remove = (p: Program) => { if (confirm(`Delete "${p.title}"?`)) void run(async () => { const { error } = await sb.from("programs").delete().eq("id", p.id); if (error) throw error; }); };

  return (
    <section className="card programs">
      <div className="top"><h2>Programs</h2><small>{data.programs.length ? `${data.programs.length} saved` : ""}</small></div>
      {active ? (() => {
        const pos = programPosition(active);
        const crit = active.kind === "milestone" ? evaluateCriteria(active, data) : null;
        const finish = (early: boolean) => askCoach(early
          ? `I think my "${active.title}" is done - can we call it complete? Here's how it's going: `
          : `All my "${active.title}" checks are met - let's call it done. How it went: `, false);
        return (
          <>
            <div className="program-head"><span className="title">{active.title}</span><span className="tag">{active.kind === "milestone" ? "Milestone" : "Active"}</span></div>
            <span className="note">{positionLabel(active, pos, crit ?? undefined)}</span>
            {active.goal && <span>{active.goal}</span>}
            <PhaseBar phases={effectivePhases(active)} current={pos.phaseIndex} week={pos.week} />
            {pos.phase && <span className="note"><strong>{pos.phase}:</strong> {pos.phaseFocus}</span>}
            {crit && crit.total > 0 && (
              <ul className="checks" aria-label="Done when">
                {crit.results.map((r, i) => (
                  <li key={i} className={r.met ? "met" : ""}><span className="box" aria-hidden="true">{r.met ? "✓" : ""}</span><span>{r.label}</span><span className="meta">{r.met ? "met" : r.progress}</span></li>
                ))}
              </ul>
            )}
            {crit?.allMet && (
              <div className="banner good"><strong>All checks met</strong><span>Everything you set out to prove is there. Call it done?</span>
                <div className="row"><button className="primary" onClick={() => finish(false)}>Call it done</button></div>
              </div>
            )}
            <div className="row">
              <button className="primary" onClick={() => askCoach(pos.over ? `My "${active.title}" program is over. Here's how it went: ` : `Build week ${pos.week} of my "${active.title}" program.`, !pos.over)}>{pos.over ? "How did it go?" : "This week"}</button>
              <button onClick={() => askCoach(`Check in on my "${active.title}" program - am I on track?`)}>Check in</button>
              <button onClick={() => setStatus(active, "paused")}>Pause</button>
              {pos.over && <button onClick={() => setStatus(active, "done")}>Mark done</button>}
              {crit && !crit.allMet && <button onClick={() => finish(true)}>Call it done</button>}
            </div>
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
                <strong>{p.title}</strong> <span className="tag">{STATUS[p.status]}</span>
                <br /><span className="meta">{p.status === "done" ? `Done${p.completed_at ? ` ${fmtDate(p.completed_at.slice(0, 10))}` : ""}${p.outcome ? ` - ${p.outcome}` : ""}` : `${p.kind === "event" && p.target_date ? `Event ${fmtDate(p.target_date)}` : p.kind === "milestone" ? "Done when checks are met" : "Ongoing"}${p.weeks ? ` · ${p.weeks} wk` : ""}${p.days_per_week ? ` · ${p.days_per_week} days/wk` : ""}`}</span>
              </span>
              <span className="row" style={{ flexWrap: "nowrap" }}>
                {p.status !== "done" && <button onClick={() => setStatus(p, "active")}>{p.status === "paused" ? "Resume" : "Start"}</button>}
                <button aria-label={`Delete ${p.title}`} onClick={() => remove(p)}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row"><button onClick={() => askCoach("I have a new goal: ", false)}>New goal program</button></div>
    </section>
  );
}
