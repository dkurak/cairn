"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import FeelPill from "@/components/FeelPill";
import { programHref } from "@/components/Programs";
import { PageHeader, PainChip, SectionCard, Tag } from "@/components/ui";
import WorkoutTile from "@/components/WorkoutTile";
import { dateRange, shortDate, weekday } from "@/lib/format";
import { effectivePhases, phaseAtWeek, programPosition, weekActivity, weekRange } from "@/lib/programs";
import { activePlan, itemWorkoutIds } from "@/lib/rules";
import type { LogEntry, PlanItem } from "@/lib/types";

/** One week of a program: where it sits, what happened, and a tile for every workout. */
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
  const status = !isActive ? null : week < pos.week ? "past" : week === pos.week ? "now" : "future";
  const saved = data.programWeeks.find((w) => w.program_id === p.id && w.week === week);
  const live = !saved && status === "now" ? activePlan(data) : undefined; // this week's plan isn't kept for the program yet
  const items: PlanItem[] = saved?.items ?? live?.items ?? [];
  const act = weekActivity(data.log, range, today);
  const planned = items.filter((i) => i.kind !== "rest").length;
  const matches = (it: PlanItem, e: LogEntry) =>
    it.kind === "tour" ? e.kind === "tour" : it.workout_ids.length > 0 && (it.workout_ids.includes(e.workout_id ?? "") || it.workout_ids.some((id2) => data.workouts.find((w) => w.id === id2)?.name === e.what));
  // each logged session counts for one planned day (two TRV1 days need two TRV1 entries)
  const loggedKeys = new Set<string>();
  {
    const used = new Set<string>();
    for (const it of items) {
      if (it.kind === "rest") continue;
      const hit = act.entries.find((e) => !used.has(e.id) && matches(it, e));
      if (hit) { used.add(hit.id); loggedKeys.add(it.key); }
    }
  }
  const doneCount = loggedKeys.size;
  const wById = (wid: string) => data.workouts.find((w) => w.id === wid);

  const keep = () => run(async () => {
    const { error } = await sb.from("program_weeks").upsert({ user_id: uid, program_id: p.id, week, plan_kind: data.state.travel ? "travel" : "home", items: live!.items }, { onConflict: "program_id,week" });
    if (error) throw error;
  }, "Couldn't keep this week. Saved program weeks need a database update (migration 0008) first.");

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
              {status && <Tag>{status === "now" ? "This week" : status === "past" ? "Done" : "Upcoming"}</Tag>}
              {phase && (isActive || phaseIndex >= 0) && <Tag>{`Phase ${phaseIndex + 1} of ${phases.length}`}</Tag>}
            </div>
            {phase?.focus && <p className="m0">{phase.focus}</p>}
            {status !== "future" && (
              <>
                {planned > 0 && (
                  <>
                    <div className="meter" role="progressbar" aria-label="Planned sessions done" aria-valuemin={0} aria-valuemax={planned} aria-valuenow={doneCount}><span style={{ width: `${Math.min(100, (doneCount / planned) * 100)}%` }} /></div>
                    <span className="note">{doneCount} of {planned} planned sessions logged</span>
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
              {status === "future" || status === "now" ? (
                <button className="primary" onClick={() => askCoach(`${items.length ? "Rewrite" : "Build"} week ${week} of my "${p.title}" program.`)}>{items.length ? "Rewrite this week" : "Build this week"}</button>
              ) : (
                <button onClick={() => askCoach(`How did week ${week} of my "${p.title}" program go? `, false)}>Talk about this week</button>
              )}
              {live && <button onClick={keep}>Keep this week in the program</button>}
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
            ) : <span className="empty">{status === "future" ? "This week hasn't started." : "Nothing logged in this week."}</span>}
          </SectionCard>
        </div>

        <SectionCard title="The plan" aside={saved ? "as planned" : live ? "current plan" : ""}>
          {items.length ? (
            <>
              {live && <span className="note">This is your current plan. It isn&apos;t kept for the program yet - tap &quot;Keep this week&quot; to save it.</span>}
              {items.map((it) => {
                const ids = itemWorkoutIds(it, data.workouts, data.log);
                const did = loggedKeys.has(it.key);
                return (
                  <div key={it.key} className={`daytile k-${it.kind}`}>
                    <div className="daytitle"><strong>{it.day} · {it.title}</strong>{did && <Tag>Logged</Tag>}</div>
                    {it.note && <span className="note">{it.note}</span>}
                    {ids.length > 0 && (
                      <div className="tiles">
                        {ids.map((wid) => { const w = wById(wid); return w ? <WorkoutTile key={wid} w={w} variant="card" status={did ? "Logged" : null} /> : null; })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <span className="empty">{status === "future" ? "Not planned yet. The coach writes each week when it comes up, or you can plan ahead with the button on the left." : status === "past" ? "No plan was kept for this week." : "No plan for this week yet - build it from the card on the left."}</span>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
