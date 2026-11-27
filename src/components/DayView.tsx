"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "./AppProvider";
import QuickCheck from "./QuickCheck";
import Rundown from "./Rundown";
import RecentList from "./RecentList";
import Collapsible from "./Collapsible";
import FeelPill, { VertPill } from "./FeelPill";
import { deleteEntry, setPhase, skipUpNext, startNextWeek, updateEntry } from "@/lib/actions";
import { firstTrackedDay } from "@/lib/stats";
import { activePlan, addDays, checksFor, greenLight, itemWorkoutIds, painClass, primaryArea, projectedItems, sortedLog, tours, upNext } from "@/lib/rules";

const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const dow = (iso: string) => parse(iso).toLocaleDateString(undefined, { weekday: "short" });
const md = (iso: string) => parse(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const first = (t: string) => t.replace(/ .*/, "");
const Chip = ({ p, label }: { p: number | null; label?: string }) =>
  p == null ? null : <span className={`chip ${painClass(p)}`}>{label ? `${label} ` : ""}{p}/10</span>;

/** One layout for every day: past, today and future. Only the contents change. */
export default function DayView({ date }: { date: string }) {
  const { data, sb, today, run, openLog, askCoach } = useApp();
  const { state, workouts, log, areas, checks } = data;
  const [editingId, setEditingId] = useState<string | null>(null);
  const stripRef = useRef<HTMLElement>(null);

  const isToday = date === today;
  const isPast = date < today;
  const isFuture = date > today;
  const hrefFor = (d: string) => (d === today ? "/" : `/day/${d}`);
  const wById = (id: string) => workouts.find((w) => w.id === id);

  const next = upNext(data);
  const plan = activePlan(data);
  const projected = projectedItems(data);
  const hasItem = next.type === "calm" || next.type === "item";
  const todayWorkouts = hasItem ? itemWorkoutIds(next.item, workouts, log).map(wById) : [];
  const todayTitle = next.type === "item" && next.item.cycle && todayWorkouts[0] ? todayWorkouts[0].name : hasItem ? next.item.title : "";
  const offsetOf = (d: string) => Math.round((+parse(d) - +parse(today)) / 86400000);
  const plannedItem = isFuture ? projected[offsetOf(date) - 1] : undefined;
  const entriesOn = (d: string) => sortedLog(log).filter((e) => e.date === d);
  const dayEntries = entriesOn(date);
  const firstDay = firstTrackedDay(data);
  const tracked = (d: string) => !!firstDay && d >= firstDay; // days before the first tracked day are just empty

  type Kind = "workout" | "tour" | "rest" | "none";
  /** what kind of day: drives the caption and the tile styling */
  const kindOf = (d: string): Kind => {
    if (d === today) return next.type === "item" || next.type === "calm" ? (next.item.kind === "rest" ? "rest" : next.item.kind === "tour" ? "tour" : "workout") : "none";
    if (d < today) {
      const es = entriesOn(d);
      if (es.some((e) => e.kind === "tour")) return "tour";
      if (es.some((e) => e.kind === "workout")) return "workout";
      return tracked(d) ? "rest" : "none"; // rest entries and untracked-gap days are rest days
    }
    const it = projected[offsetOf(d) - 1];
    return it ? (it.kind === "rest" ? "rest" : it.kind === "tour" ? "tour" : "workout") : "none";
  };
  const caption = (d: string) => {
    if (d === today) return todayTitle ? first(todayTitle) : "-";
    if (d < today) { const e = entriesOn(d).find((x) => x.kind !== "rest"); return e ? first(e.what) : kindOf(d) === "rest" ? "Rest" : "-"; }
    const it = projected[offsetOf(d) - 1];
    return it ? first(it.title) : "-";
  };
  const window7 = [-3, -2, -1, 0, 1, 2, 3].map((n) => addDays(date, n));

  useEffect(() => { // keep the selected tile in view on narrow screens
    stripRef.current?.querySelector('[aria-current="date"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [date]);

  const touring = !!plan?.items.some((i) => i.kind === "tour");
  const gl = isToday ? greenLight(state, log, touring) : null;
  const primary = primaryArea(areas);
  const lastTour = tours(log)[0];
  const afterTourHint = isToday && primary && lastTour && lastTour.pain_next_am == null && lastTour.date < today && !checksFor(checks, primary.id).some((c) => c.date === today)
    ? `Morning after your ${md(lastTour.date)} tour: your ${primary.name} number decides your next tour.` : null;

  function doNext() {
    if (!hasItem) return;
    const it = next.item;
    const names = todayWorkouts.map((w) => w?.name ?? "").filter(Boolean);
    if (next.type === "calm") return openLog({ whats: names });
    if (it.kind === "rest") return openLog({ itemKey: it.key, whats: ["Rest"], rest: true });
    if (it.kind === "tour") return openLog({ itemKey: it.key, whats: ["Tour"] });
    openLog({ itemKey: it.key, whats: names.length ? names : [it.title] });
  }

  const loggedWorkouts = [...new Set(dayEntries.map((e) => e.workout_id).filter((x): x is string => !!x))].map(wById);
  const head = isToday ? "Today" : parse(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="page">
      <div className="page-head">
        <div className="row" style={{ gap: 6 }}>
          <Link href={hrefFor(addDays(date, -1))} className="iconlink" aria-label="Previous day">‹</Link>
          <h1>{head}</h1>
          <Link href={hrefFor(addDays(date, 1))} className="iconlink" aria-label="Next day">›</Link>
          {!isToday && <Link href="/" style={{ marginLeft: 6 }}>Back to today</Link>}
        </div>
        <button className="askbtn" onClick={() => askCoach(isToday ? "What should I focus on today?" : `Can we talk about ${head}? `, isToday)}>Ask coach</button>
      </div>

      <nav className="strip" ref={stripRef} aria-label="Days">
        {window7.map((d) => (
          <Link key={d} href={hrefFor(d)} className={`${d === date ? "sel" : ""} ${d === today ? "istoday" : ""} ${d < today ? "past" : ""} k-${kindOf(d)}`} aria-current={d === date ? "date" : undefined}>
            <span className="d">{d === today ? "Today" : dow(d)}</span>
            <span className="dn">{parse(d).getDate()}</span>
            <span className="w">{caption(d)}</span>
          </Link>
        ))}
      </nav>

      <div className="two">
        <div className="stack">
          {isToday && (
            <section className="card next" aria-live="polite">
              {next.type === "calm" && (
                <>
                  <div className="label">Up next · calm-down</div>
                  <div className="title">{next.item.title}</div>
                  <div className="note">{next.item.note}</div>
                  {primary && checksFor(checks, primary.id)[0] && (
                    <div>Latest {primary.name} check: <Chip p={checksFor(checks, primary.id)[0].pain} /> <span className="note">({md(checksFor(checks, primary.id)[0].date)}) · need 3 or less to start</span></div>
                  )}
                  <div className="row"><button className="primary" onClick={doNext}>Done - log it</button></div>
                  <Collapsible>{todayWorkouts.map((w, i) => <Rundown key={i} workout={w} />)}</Collapsible>
                  <div className="row"><button className="link" onClick={() => run(() => setPhase(sb, state, "build"))}>Everyday pain is 3/10 or less - start the plan</button></div>
                </>
              )}
              {next.type === "item" && (
                <>
                  <div className="label">Up next · {next.item.day}{state.travel ? " · travel mode" : ""}</div>
                  <div className="title">{todayTitle}</div>
                  <div className="note">{next.item.note}</div>
                  <div className="row">
                    <button className="primary" onClick={doNext}>Done - log it</button>
                    <button onClick={() => run(() => skipUpNext(sb, data))}>Skip</button>
                  </div>
                  <Collapsible>{todayWorkouts.map((w, i) => <Rundown key={i} workout={w} />)}</Collapsible>
                  <div className="row"><button className="link" onClick={() => askCoach(`Can you make today's workout (${todayTitle}) easier or swap something? `, false)}>Change this workout with the coach</button></div>
                </>
              )}
              {next.type === "empty" && (
                <>
                  <div className="label">Up next</div>
                  <div className="title">No plan yet</div>
                  <div className="note">Tell the Cairn coach your goal, any pain, your equipment and how many days a week. It will suggest a week you can save.</div>
                  <div className="row"><button className="primary" onClick={() => askCoach("Help me build a weekly plan.")}>Build my plan with the coach</button></div>
                </>
              )}
              {next.type === "complete" && (
                <>
                  <div className="label">{state.travel ? "Travel set done" : `Week ${state.week} done`}</div>
                  <div className="title">Nice work</div>
                  <div className="row"><button className="primary" onClick={() => run(() => startNextWeek(sb, state))}>{state.travel ? "Run the travel set again" : "Start next week"}</button></div>
                </>
              )}
            </section>
          )}

          {isPast && (
            <section className="card next" style={{ borderColor: "var(--line)" }}>
              <div className="label" style={{ color: "var(--muted)" }}>Done · {dow(date)} {md(date)}</div>
              {dayEntries.length ? (
                <>
                  <div className="title" style={dayEntries.every((e) => e.kind === "rest") ? { color: "var(--muted)" } : undefined}>{dayEntries.map((e) => e.what).join(" + ")}</div>
                  <ul className="list">
                    {dayEntries.map((e) => (
                      <li key={e.id}>
                        <span><span className="entry-head"><strong>{e.what}</strong><VertPill ft={e.vert_ft} /></span><span className="meta feelrow"><FeelPill feel={e.feel} />{e.notes ? <span>{e.notes}</span> : null}</span></span>
                        <span><Chip p={e.pain_during} /><Chip p={e.pain_next_am} label="AM" /></span>
                      </li>
                    ))}
                  </ul>
                  {loggedWorkouts.length > 0 && <Collapsible>{loggedWorkouts.map((w, i) => <Rundown key={i} workout={w} />)}</Collapsible>}
                </>
              ) : (
                tracked(date) ? (
                  <>
                    <div className="title" style={{ color: "var(--muted)" }}>Rest day</div>
                    <div className="note">Nothing logged, so it counts as a rest day. Did something? Add it below.</div>
                  </>
                ) : (
                  <>
                    <div className="title" style={{ color: "var(--muted)" }}>Before tracking</div>
                    <div className="note">You hadn&apos;t started logging yet. You can still add something for this day.</div>
                  </>
                )
              )}
              <div className="row">
                <button className="primary" onClick={() => openLog({ whats: ["SKI1 Hip Strength"], date })}>Log something for this day</button>
              </div>
            </section>
          )}

          {isFuture && (
            <section className="card next" style={{ borderColor: "var(--line)" }}>
              {plannedItem ? (
                <>
                  <div className="label" style={{ color: "var(--muted)" }}>Planned · {plannedItem.day}</div>
                  <div className="title">{plannedItem.title}</div>
                  <div className="note">{plannedItem.note}</div>
                  <div className="row"><button className="primary" disabled>Done - log it</button><button disabled>Skip</button></div>
                  <Collapsible>{itemWorkoutIds(plannedItem, workouts, log).map((id) => <Rundown key={id} workout={wById(id)} />)}</Collapsible>
                  <div className="row"><button className="link" onClick={() => askCoach(`Can you change what I have planned for ${head} (${plannedItem.title})? `, false)}>Change this with the coach</button></div>
                </>
              ) : (
                <>
                  <div className="label" style={{ color: "var(--muted)" }}>Planned</div>
                  <div className="title">Nothing planned yet</div>
                  <div className="row"><button className="primary" onClick={() => askCoach(`Help me plan ${head}.`)}>Plan it with the coach</button></div>
                </>
              )}
            </section>
          )}

          {gl && <div className={`banner ${gl.tone}`}><strong>{gl.title}</strong><span>{gl.body}</span></div>}
        </div>

        <div className="stack">
          {afterTourHint && <div className="banner warn"><strong>Check in</strong><span>{afterTourHint}</span></div>}
          <QuickCheck date={date} disabled={isFuture} />
          {isToday ? (
            <>
              <section className="card">
                <h2>Log something else</h2>
                <div className="row">
                  <button onClick={() => openLog({ whats: ["Tour"] })}>Log a tour</button>
                  <button onClick={() => openLog({ whats: ["SKI1 Hip Strength"] })}>Log a workout</button>
                  <button onClick={() => openLog({ whats: ["Rest"], rest: true })}>Rest day</button>
                </div>
              </section>
              <section className="card">
                <h2>Recent</h2>
                <RecentList
                  log={log}
                  limit={7}
                  areas={areas}
                  checks={checks}
                  onLogDay={(d) => openLog({ whats: ["Rest"], rest: true, date: d })}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  onSave={(id, patch) => run(() => updateEntry(sb, id, patch), "Couldn't save that. Try again.").then((ok) => ok && setEditingId(null))}
          workouts={workouts}
                  onDelete={(id) => run(() => deleteEntry(sb, id), "Couldn't delete. Try again.")}
                />
              </section>
            </>
          ) : (
            <section className="card">
              <h2>Notes</h2>
              {dayEntries.some((e) => e.notes) ? (
                <RecentList
                  log={dayEntries}
                  limit={20}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  onSave={(id, patch) => run(() => updateEntry(sb, id, patch), "Couldn't save that. Try again.").then((ok) => ok && setEditingId(null))}
          workouts={workouts}
                  onDelete={(id) => run(() => deleteEntry(sb, id), "Couldn't delete. Try again.")}
                />
              ) : <span className="empty">{isFuture ? "Nothing to note yet." : "No notes for this day. Tap an entry to add one."}</span>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
