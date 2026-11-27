"use client";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import RecentList from "@/components/RecentList";
import { deleteEntry, setPhase, startNextWeek, updateEntry } from "@/lib/actions";
import { activePlan, doneMap, upNext } from "@/lib/rules";

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function Plan() {
  const { data, sb, run, askCoach, openLog, openTravel } = useApp();
  const { state, log, workouts } = data;
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [editingId, setEditingId] = useState<string | null>(null);
  const plan = activePlan(data);
  const dm = doneMap(state);
  const next = upNext(data);
  const wName = (id: string) => workouts.find((w) => w.id === id)?.name ?? "?";
  const doneCount = (plan?.items ?? []).filter((i) => dm[i.key]).length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Plan</h1>
        <div className="seg" role="group" aria-label="Upcoming or past">
          <button aria-pressed={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming</button>
          <button aria-pressed={tab === "past"} onClick={() => setTab("past")}>Past</button>
        </div>
      </div>

      {tab === "upcoming" && (
        <section className="card goals">
          <div className="top"><h2>Goals</h2>{data.profile.goals_updated_at ? <small>Updated {fmt(data.profile.goals_updated_at.slice(0, 10))}</small> : null}</div>
          {data.profile.goals ? <p className="goals-text">{data.profile.goals}</p> : <span className="empty">No goals yet. Tell the coach what you&apos;re training for and it&apos;ll check your weeks against it.</span>}
          <div className="row">
            <button className="primary" onClick={() => askCoach("Check in on my last 5 days - what have I been working on, and does it line up with my goals?")}>Check in</button>
            <button onClick={() => askCoach(data.profile.goals ? "My goals have changed: " : "Here's what I'm training for: ", false)}>{data.profile.goals ? "Update goals" : "Set goals"}</button>
          </div>
        </section>
      )}

      {tab === "upcoming" ? (
        <div className="two">
          <section className="card">
            <div className="top">
              <h2>{state.travel ? "Travel set" : `Week ${state.week}`}</h2>
              <small>
                {state.travel && state.travel_info?.returns ? `Back ${fmt(state.travel_info.returns)} · ` : ""}
                {state.phase === "calm" && !state.travel ? "Starts after calm-down" : `${doneCount} of ${plan?.items.length ?? 0}`}
              </small>
            </div>
            {plan?.items.length ? (
              <ul className="week">
                {plan.items.map((it, i) => {
                  const d = dm[it.key];
                  const current = next.type === "item" && next.item.key === it.key;
                  return (
                    <li key={it.key} className={d ? "done" : current ? "current" : ""}>
                      <span className="tick" aria-hidden="true">{d ? (d === "skipped" ? "–" : "✓") : i + 1}</span>
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
          </section>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <section className="card">
              <h2>Where are you training?</h2>
              {state.travel ? (
                <>
                  <span>Traveling{state.travel_info?.gear ? ` · ${state.travel_info.gear === "gym" ? "hotel gym" : "bodyweight"}` : ""}{state.travel_info?.jog ? " · jogging" : ""}{state.travel_info?.returns ? ` · back ${fmt(state.travel_info.returns)}` : ""}</span>
                  <div className="row">
                    <button onClick={openTravel}>Edit trip</button>
                    <button onClick={() => askCoach("Update my travel plan for this trip.", false)}>Tweak travel plan</button>
                  </div>
                </>
              ) : (
                <div className="row"><button onClick={openTravel}>I&apos;m traveling</button></div>
              )}
            </section>
            {state.phase === "build" && (
              <section className="card">
                <h2>Hip flared?</h2>
                <span className="note">Back to calm-down pauses tours and the weekly plan until the pain settles.</span>
                <div className="row"><button onClick={() => run(() => setPhase(sb, state, "calm"))}>Back to calm-down</button></div>
              </section>
            )}
            {state.phase === "calm" && (
              <section className="card">
                <h2>Calm-down</h2>
                <span className="note">Wall march holds and EZ1 only until everyday pain is 3/10 or less.</span>
                <div className="row"><button onClick={() => run(() => setPhase(sb, state, "build"))}>Start the plan</button></div>
              </section>
            )}
            <section className="card">
              <h2>Log something else</h2>
              <div className="row">
                <button onClick={() => openLog({ whats: ["Tour"] })}>Log a tour</button>
                <button onClick={() => openLog({ whats: ["SKI1 Hip Strength"] })}>Log a workout</button>
                <button onClick={() => openLog({ whats: ["Rest"], rest: true })}>Rest day</button>
              </div>
            </section>
          </div>
        </div>
      ) : (
        <section className="card">
          <h2>History</h2>
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
        </section>
      )}
    </div>
  );
}
