"use client";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import Programs, { ProgramWeekBanner } from "@/components/Programs";
import RecentList from "@/components/RecentList";
import { ConfirmButton, LogShortcuts, PageHeader, SectionCard } from "@/components/ui";
import { canResumeTravel, deleteEntry, markDone, restartTravelSet, setPhase, startNextWeek, unmarkDone, updateEntry } from "@/lib/actions";
import { activePlan, doneMap, greenLight, primaryArea, upNext } from "@/lib/rules";
import { shortDate as fmt } from "@/lib/format";

export default function Plan() {
  const { data, sb, run, askCoach, openLog, openTravel, today } = useApp();
  const { state, log, workouts } = data;
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [editingId, setEditingId] = useState<string | null>(null);
  const plan = activePlan(data);
  const dm = doneMap(state);
  const next = upNext(data);
  const primary = primaryArea(data.areas);
  const wName = (id: string) => workouts.find((w) => w.id === id)?.name ?? "?";
  const doneCount = (plan?.items ?? []).filter((i) => dm[i.key]).length;

  return (
    <div className="page">
      <PageHeader title="Plan" coach={{ text: "I want to plan my next week. Here's what I'd like to focus on: " }}>
        <div className="seg" role="group" aria-label="Upcoming or past">
          <button aria-pressed={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming</button>
          <button aria-pressed={tab === "past"} onClick={() => setTab("past")}>Past</button>
        </div>
      </PageHeader>

      {tab === "upcoming" && <ProgramWeekBanner />}
      {tab === "upcoming" && <Programs />}

      {tab === "upcoming" && (
        <SectionCard className="goals" title="Goals" aside={data.profile.goals_updated_at ? `Updated ${fmt(data.profile.goals_updated_at.slice(0, 10))}` : undefined}>
          {data.profile.goals ? <p className="goals-text">{data.profile.goals}</p> : <span className="empty">No goals yet. Tell the coach what you&apos;re training for and it&apos;ll check your weeks against it.</span>}
          <div className="row">
            <button className="primary" onClick={() => askCoach("Check in on my last 5 days - what have I been working on, and does it line up with my goals?")}>Check in</button>
            <button onClick={() => askCoach(data.profile.goals ? "My goals have changed: " : "Here's what I'm training for: ", false)}>{data.profile.goals ? "Update goals" : "Set goals"}</button>
          </div>
        </SectionCard>
      )}

      {tab === "upcoming" ? (
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
          </SectionCard>

          <div className="stack">
            {(() => {
              // always findable here; Today only shows it when a tour is close
              const gl = state.travel ? null : greenLight(state, data.log, !!plan?.items.some((i) => i.kind === "tour"));
              return gl ? <div className={`banner ${gl.tone}`}><span className="note" style={{ color: "inherit" }}>Next tour</span><strong>{gl.title}</strong><span>{gl.body}</span></div> : null;
            })()}
            <SectionCard title="Where are you training?">
              {state.travel ? (
                <>
                  <span>Traveling{state.travel_info?.started ? ` since ${fmt(state.travel_info.started)}` : ""}{state.travel_info?.gear ? ` · ${state.travel_info.gear === "gym" ? "hotel gym" : "bodyweight"}` : ""}{state.travel_info?.jog ? " · jogging" : ""}{state.travel_info?.returns ? ` · back ${fmt(state.travel_info.returns)}` : ""}</span>
                  <div className="row">
                    <button onClick={openTravel}>Edit trip</button>
                    <button onClick={() => askCoach("Update my travel plan for this trip.", false)}>Tweak travel plan</button>
                    <ConfirmButton confirmLabel="Tap again to start over" onConfirm={() => void run(() => restartTravelSet(sb, state))}>New trip - start over</ConfirmButton>
                  </div>
                </>
              ) : (
                <div className="row"><button onClick={openTravel}>{canResumeTravel(state) ? "Back on the road - continue the trip" : "I'm traveling"}</button></div>
              )}
            </SectionCard>
            {/* rehab mode follows whatever area this person is protecting, not one specific injury */}
            {state.phase === "build" && primary && (
              <SectionCard title={`${primary.name} flared?`}>
                <span className="note">Back to calm-down pauses tours and the weekly plan until the pain settles.</span>
                <div className="row"><button onClick={() => run(() => setPhase(sb, state, "calm"))}>Back to calm-down</button></div>
              </SectionCard>
            )}
            {state.phase === "calm" && (
              <SectionCard title="Calm-down">
                <span className="note">Gentle days only{primary ? ` until ${primary.name.toLowerCase()} is 3/10 or less` : " until the pain settles"}.</span>
                <div className="row"><button onClick={() => run(() => setPhase(sb, state, "build"))}>Start the plan</button></div>
              </SectionCard>
            )}
            <LogShortcuts />
          </div>
        </div>
      ) : (
        <SectionCard title="History">
          <RecentList
            log={log}
            limit={400}
            areas={data.areas}
            checks={data.checks}
            onLogDay={(d) => openLog({ whats: ["Rest"], rest: true, date: d })}
            editingId={editingId}
            setEditingId={setEditingId}
            onSave={(id, patch) => run(() => updateEntry(sb, id, patch), "Couldn't save that. Try again.").then((ok) => ok && setEditingId(null))}
            workouts={workouts}
            onDelete={(id) => run(() => deleteEntry(sb, id), "Couldn't delete. Try again.")}
          />
        </SectionCard>
      )}
    </div>
  );
}
