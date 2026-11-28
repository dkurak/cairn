"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import FeelPill from "@/components/FeelPill";
import { PlanDayTile } from "@/components/PlanItems";
import { programHref } from "@/components/Programs";
import { PageHeader, PainChip, SectionCard, Tag } from "@/components/ui";
import WeekHistory from "@/components/WeekHistory";
import { WeekSourceTag, WeekStatusTag } from "@/components/WeekStatus";
import { adoptDraftWeek, upsertLiveWeek } from "@/lib/actions";
import { dateRange, shortDate, weekday } from "@/lib/format";
import { effectivePhases, phaseAtWeek, programPosition, weekActivity, weekRange } from "@/lib/programs";
import { countable, matchWeek, planAheadPrompt, redraftPrompt, remainingWeeks, storedWeek, weekPlan, weekStatus } from "@/lib/programWeeks";

/** One week of a program: where it sits, how it's going, what was logged, a tile per planned day, and the versions. */
export default function ProgramWeekPage() {
  const { id, n } = useParams<{ id: string; n: string }>();
  const { data, sb, uid, today, run, askCoach } = useApp();
  const p = data.programs.find((x) => x.id === id);
  const week = Math.max(1, Number.parseInt(n, 10) || 1);
  const back = <Link href={p ? programHref(p.id) : "/plan"}>‹ {p ? p.title : "Plan"}</Link>;
  if (!p) {
    return (
      <div className="page">
        <PageHeader title="Week" back={back} />
        <SectionCard><span className="empty">That program isn&apos;t here any more.</span></SectionCard>
      </div>
    );
  }

  const isActive = p.status === "active";
  const pos = programPosition(p, today);
  if (pos.totalWeeks && week > pos.totalWeeks) {
    return (
      <div className="page">
        <PageHeader title={`Week ${week}`} back={back} />
        <SectionCard><span className="empty">&quot;{p.title}&quot; runs {pos.totalWeeks} weeks, so there&apos;s no week {week}.</span><div className="row"><Link href={programHref(p.id, pos.totalWeeks)}>Go to week {pos.totalWeeks}</Link></div></SectionCard>
      </div>
    );
  }

  const phases = effectivePhases(p);
  const { phase, index: phaseIndex } = phaseAtWeek(p, week, phases);
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
    <div className="page">
      <PageHeader title={`Week ${week}${total ? ` of ${total}` : ""}`} back={back} coach={{ text: `Let's talk about week ${week} of my "${p.title}" program: ` }}>
        <div className="row nowrap gap-4">
          {prev ? <Link href={prev} className="iconlink" aria-label="Previous week">‹</Link> : <span className="iconlink dim" aria-hidden="true">‹</span>}
          {next ? <Link href={next} className="iconlink" aria-label="Next week">›</Link> : <span className="iconlink dim" aria-hidden="true">›</span>}
        </div>
      </PageHeader>

      <div className="two">
        <div className="stack">
          <SectionCard title={phase ? `${phase.name}` : "Overview"} aside={range ? dateRange(range.start, range.end) : undefined}>
            <div className="row">
              {timing && <Tag>{timing === "now" ? "This week" : timing === "past" ? "Done" : "Upcoming"}</Tag>}
              {phase && <Tag>{`Phase ${phaseIndex + 1} of ${phases.length}`}</Tag>}
              <WeekStatusTag status={ws && ws.state !== "upcoming" ? ws : null} />
            </div>
            {phase?.focus && <p className="m0">{phase.focus}</p>}
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
            <div className="row">
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
              {items.map((it) => <PlanDayTile key={it.key} item={it} workouts={data.workouts} log={data.log} did={loggedKeys.has(it.key)} />)}
            </>
          ) : (
            <span className="empty">{timing === "future" ? "Not planned yet. Use \"Draft this week\" to see it, or plan every remaining week at once." : timing === "past" ? "No plan was kept for this week." : "No plan for this week yet - build it from the card on the left."}</span>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
