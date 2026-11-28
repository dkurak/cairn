"use client";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import ProgramNudge from "@/components/ProgramNudge";
import ProgramAhead from "@/components/ProgramAhead";
import Programs, { ProgramWeekBanner } from "@/components/Programs";
import RightNow from "@/components/RightNow";
import { PageHeader, SectionCard } from "@/components/ui";
import { markDone, startNextWeek, unmarkDone } from "@/lib/actions";
import { activePlan, doneMap, greenLight, upNext } from "@/lib/rules";
import { shortDate as fmt } from "@/lib/format";

/** What you're working toward (programs, goals), this week, and the two switches (where, and rehab mode). Everything you've done lives in History. */
export default function Plan() {
  const { data, sb, run, askCoach, today } = useApp();
  const { state, workouts } = data;
  const plan = activePlan(data);
  const dm = doneMap(state);
  const next = upNext(data);
  const wName = (id: string) => workouts.find((w) => w.id === id)?.name ?? "?";
  const doneCount = (plan?.items ?? []).filter((i) => dm[i.key]).length;
  // always findable here; Today only shows it when a tour is close
  const gl = state.travel ? null : greenLight(state, data.log, !!plan?.items.some((i) => i.kind === "tour"));

  return (
    <div className="page">
      <PageHeader title="Plan" coach={{ text: "I want to plan my next week. Here's what I'd like to focus on: " }} />

      <ProgramWeekBanner />
      <ProgramNudge />
      <ProgramAhead />
      <Programs />

      <div className="two">
        <SectionCard
          title={state.travel ? "Travel set" : `Week ${state.week}`}
          aside={`${state.travel && state.travel_info?.returns ? `Back ${fmt(state.travel_info.returns)} · ` : ""}${state.phase === "calm" && !state.travel ? "Starts after calm-down" : `${doneCount} of ${plan?.items.length ?? 0}`}`}
        >
          {plan?.items.length ? (
            <ul className="week">
              {plan.items.map((it, i) => {
                const d = dm[it.key];
                const current = next.type === "item" && next.item.key === it.key;
                return (
                  <li key={it.key} className={d ? "done" : current ? "current" : ""}>
                    <button type="button" className="tick" title={d ? "Undo" : "Mark done"} aria-label={d ? `Undo ${it.title}` : `Mark ${it.title} done`}
                      onClick={() => void run(() => (d ? unmarkDone(sb, state, it.key) : markDone(sb, state, it.key, today)))}>
                      {d ? (d === "skipped" ? "–" : "✓") : i + 1}
                    </button>
                    <span className="day">{it.day}</span>
                    <span className="what">{it.title}{d === "skipped" ? " (skipped)" : ""}
                      {it.workout_ids.length && it.workout_ids.map(wName).join(" + ") !== it.title ? <><br /><span className="meta">{it.workout_ids.map(wName).join(" + ")}</span></> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <span className="empty">No plan yet. Tell the coach what you&apos;re working toward.</span>}
          <div className="row">
            <button className="primary" onClick={() => askCoach("I want to plan my next week. Here's what I'd like to focus on: ", false)}>Plan with the coach</button>
            {next.type === "complete" && <button onClick={() => run(() => startNextWeek(sb, state))}>{state.travel ? "Run the set again" : "Start next week"}</button>}
          </div>
          <Link href="/history">Everything you&apos;ve done is in History ›</Link>
        </SectionCard>

        <div className="stack">
          {gl && <div className={`banner ${gl.tone}`}><span className="note on-banner">Next tour</span><strong>{gl.title}</strong><span>{gl.body}</span></div>}
          <SectionCard className="goals" title="Goals" aside={data.profile.goals_updated_at ? `Updated ${fmt(data.profile.goals_updated_at.slice(0, 10))}` : undefined}>
            {data.profile.goals ? <p className="goals-text">{data.profile.goals}</p> : <span className="empty">No goals yet. Tell the coach what you&apos;re training for and it&apos;ll check your weeks against it.</span>}
            <div className="row">
              <button className="primary" onClick={() => askCoach("Check in on my last 5 days - what have I been working on, and does it line up with my goals?")}>Check in</button>
              <button onClick={() => askCoach(data.profile.goals ? "My goals have changed: " : "Here's what I'm training for: ", false)}>{data.profile.goals ? "Update goals" : "Set goals"}</button>
            </div>
          </SectionCard>
          <RightNow />
        </div>
      </div>
    </div>
  );
}
