"use client";
import Link from "next/link";
import { useApp } from "./AppProvider";
import { AskCoachButton, PainChip, SectionCard, Tag } from "./ui";
import FeelPill from "./FeelPill";
import { PlanDayRow } from "./PlanItems";
import { programHref } from "./Programs";
import WeekHistory from "./WeekHistory";
import { WeekSourceTag, WeekStatusTag } from "./WeekStatus";
import { adoptDraftWeek, upsertLiveWeek } from "@/lib/actions";
import { dateRange, shortDate, weekday } from "@/lib/format";
import { programPosition, weekActivity, weekRange } from "@/lib/programs";
import { countable, matchWeek, planAheadPrompt, redraftPrompt, remainingWeeks, storedWeek, weekPlan, weekStatus } from "@/lib/programWeeks";
import type { Program } from "@/lib/types";

/** One week of a program: status, what was logged, the plan as a short list (tap a day for its workouts), and the versions. */
export default function WeekView({ p, week }: { p: Program; week: number }) {
  const { data, sb, uid, today, run, askCoach } = useApp();
  const isActive = p.status === "active";
  const pos = programPosition(p, today);
  const range = weekRange(p, week);
  const total = pos.totalWeeks;
  const timing = !isActive ? null : week < pos.week ? "past" : week === pos.week ? "now" : "future";
  const wp = weekPlan(data, p, week, today);
  const items = wp.items;
  const ws = weekStatus({ program: p, week, items, log: data.log, workouts: data.workouts, today });
  const act = weekActivity(data.log, range, today);
  const { keys: loggedKeys } = matchWeek(items, act.entries, data.workouts);
  const planned = items.filter(countable).length;
  const hasRow = !!storedWeek(data, p.id, week);
  const ahead = remainingWeeks(p, today).filter((w) => !total || w <= total);
  const undrafted = ahead.filter((w) => !storedWeek(data, p.id, w));

  const keep = () => run(() => upsertLiveWeek(sb, { user_id: uid, program_id: p.id, week, plan_kind: data.state.travel ? "travel" : "home", items, status: "live", note: "" }),
    "Couldn't keep this week. Saved program weeks need a database update (migration 0008) first.");

  const prev = week > 1 ? programHref(p.id, week - 1) : null;
  const next = !total || week < total ? programHref(p.id, week + 1) : null;

  return (
    <>
      <div className="weekhead">
        <h2>Week {week}{total ? ` of ${total}` : ""}{range ? <span className="meta"> · {dateRange(range.start, range.end)}</span> : null}</h2>
        <div className="row nowrap gap-4">
          {prev ? <Link href={prev} className="iconlink" aria-label="Previous week">‹</Link> : <span className="iconlink dim" aria-hidden="true">‹</span>}
          {next ? <Link href={next} className="iconlink" aria-label="Next week">›</Link> : <span className="iconlink dim" aria-hidden="true">›</span>}
          <AskCoachButton text={`Let's talk about week ${week} of my "${p.title}" program: `}>Ask coach</AskCoachButton>
        </div>
      </div>
      <div className="two">
        <div className="stack">
          <SectionCard title="This week" aside={timing ? <Tag>{timing === "now" ? "Now" : timing === "past" ? "Done" : "Upcoming"}</Tag> : undefined}>
            <div className="row"><WeekStatusTag status={ws && ws.state !== "upcoming" ? ws : null} /></div>
            {timing !== "future" && (
              <>
                {planned > 0 && (
                  <>
                    <div className="meter" role="progressbar" aria-label="Planned sessions done" aria-valuemin={0} aria-valuemax={planned} aria-valuenow={loggedKeys.size}><span style={{ width: `${Math.min(100, (loggedKeys.size / planned) * 100)}%` }} /></div>
                    <span className="note">{loggedKeys.size} of {planned} planned sessions logged{ws && timing === "now" && ws.expected ? ` (about ${ws.expected} expected by now)` : ""}</span>
                  </>
                )}
                <dl className="facts">
                  <div><dt>Sessions</dt><dd>{act.sessions.length}</dd></div>
                  <div><dt>Avg pain during</dt><dd>{act.avgPain == null ? "-" : `${act.avgPain.toFixed(1)}/10`}</dd></div>
                  {act.vert > 0 && <div><dt>Tour vert</dt><dd>{act.vert.toLocaleString()} ft</dd></div>}
                </dl>
              </>
            )}
            <div className="row actions">
              {timing === "now" ? (
                wp.source === "draft" ? (
                  <>
                    <button className="primary" onClick={() => run(() => adoptDraftWeek(sb, data, p, week), "Couldn't start that week. Try again.")}>Use this draft</button>
                    <button onClick={() => askCoach(`Rewrite week ${week} of my "${p.title}" program, starting from the draft and what I've actually done since.`)}>Adjust it first</button>
                  </>
                ) : (
                  <button className="primary" onClick={() => askCoach(`${items.length ? "Rewrite" : "Build"} week ${week} of my "${p.title}" program.`)}>{items.length ? "Rewrite this week" : "Build this week"}</button>
                )
              ) : timing === "future" ? (
                data.weekPlansReady ? (
                  <>
                    <button className="primary" onClick={() => askCoach(redraftPrompt(p, week, wp.source === "draft"))}>{wp.source === "draft" ? "Redraft this week" : "Draft this week"}</button>
                    {undrafted.length > 0 && <button onClick={() => askCoach(planAheadPrompt(p, undrafted))}>Plan all remaining weeks</button>}
                  </>
                ) : <span className="note">Planning ahead needs a database update (migration 0009).</span>
              ) : (
                <button onClick={() => askCoach(`How did week ${week} of my "${p.title}" program go? `, false)}>Talk about this week</button>
              )}
              {wp.source === "current" && !hasRow && <button onClick={keep}>Keep this week in the program</button>}
            </div>
          </SectionCard>

          <SectionCard title="Logged this week" aside={act.entries.length ? `${act.entries.length} entr${act.entries.length === 1 ? "y" : "ies"}` : ""}>
            {act.entries.length ? (
              <ul className="list">
                {act.entries.map((e) => (
                  <li key={e.id}>
                    <span><Link href={`/day/${e.date}`}><strong>{weekday(e.date)} {shortDate(e.date)}</strong></Link> · {e.what}<br /><span className="meta feelrow"><FeelPill feel={e.feel} />{e.notes ? <span>{e.notes}</span> : null}</span></span>
                    <PainChip p={e.pain_during} />
                  </li>
                ))}
              </ul>
            ) : <span className="empty">{timing === "future" ? "This week hasn't started." : "Nothing logged in this week."}</span>}
          </SectionCard>

          {data.weekPlansReady && hasRow && <SectionCard title="Versions" aside={wp.revision ? `revision ${wp.revision}` : undefined}><WeekHistory program={p} week={week} /></SectionCard>}
        </div>

        <SectionCard title="The plan" aside={<WeekSourceTag plan={wp} />}>
          {items.length ? (
            <>
              {wp.source === "current" && !hasRow && <span className="note">This is your current plan. It isn&apos;t kept for the program yet - tap &quot;Keep this week&quot; to save it.</span>}
              {wp.source === "draft" && <span className="note">A draft, planned ahead. It becomes your plan when the week arrives, and the coach adjusts it to what you&apos;ve actually done.</span>}
              {wp.note && <span className="note"><strong>Why:</strong> {wp.note}</span>}
              <div className="dayrows">{items.map((it) => <PlanDayRow key={it.key} item={it} workouts={data.workouts} log={data.log} did={loggedKeys.has(it.key)} />)}</div>
            </>
          ) : (
            <span className="empty">{timing === "future" ? "Not planned yet. Use \"Draft this week\" to see it, or plan every remaining week at once." : timing === "past" ? "No plan was kept for this week." : "No plan for this week yet - build it from the card on the left."}</span>
          )}
        </SectionCard>
      </div>
    </>
  );
}
