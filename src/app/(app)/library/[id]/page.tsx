"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import FeelPill from "@/components/FeelPill";
import Rundown from "@/components/Rundown";
import { PageHeader, PainChip, SectionCard, Tag } from "@/components/ui";
import { WatchChip } from "@/components/Watch";
import WorkoutHistory from "@/components/WorkoutHistory";
import { WorkoutActions, workoutSummary } from "@/components/WorkoutTile";
import { shortDate } from "@/lib/format";
import { sortedLog } from "@/lib/rules";

/** One workout, in full: the rundown, what you can do with it, where it's used and when you did it. */
export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useApp();
  const w = data.workouts.find((x) => x.id === id);
  const back = <Link href="/library">‹ Library</Link>;
  if (!w) {
    return (
      <div className="page">
        <PageHeader title="Workout" back={back} />
        <SectionCard><span className="empty">That workout isn&apos;t in your library (it may have been deleted).</span></SectionCard>
      </div>
    );
  }
  const used = data.plans.flatMap((pl) => pl.items.filter((it) => it.workout_ids.includes(w.id)).map((it) => ({ plan: pl.name, day: it.day, title: it.title })));
  const done = sortedLog(data.log).filter((e) => e.workout_id === w.id || e.what === w.name);

  return (
    <div className="page">
      <PageHeader title={w.name} back={back} coach={{ text: `Can you change "${w.name}"? I'd like it to: ` }} />
      <div className="two">
        <SectionCard title="Workout" aside={workoutSummary(w)}>
          <div className="row"><Tag>{w.category}</Tag><Tag>v{w.version}</Tag>{w.owner_id ? <Tag>Yours</Tag> : <Tag>Shared</Tag>}<WatchChip w={w} /></div>
          {w.notes && <p className="note m0">{w.notes}</p>}
          <Rundown workout={w} />
          <WorkoutActions w={w} />
        </SectionCard>
        <div className="stack">
          <SectionCard title="Where it's used">
            {used.length ? (
              <ul className="list">{used.map((u, i) => <li key={i}><span><strong>{u.title}</strong><br /><span className="meta">{u.plan} · {u.day}</span></span></li>)}</ul>
            ) : <span className="empty">Not in any of your plans yet.</span>}
          </SectionCard>
          <SectionCard title="When you did it" aside={done.length ? `${done.length} time${done.length === 1 ? "" : "s"}` : ""}>
            {done.length ? (
              <ul className="list">
                {done.slice(0, 8).map((e) => (
                  <li key={e.id}><span><strong>{shortDate(e.date)}</strong><br /><span className="meta feelrow"><FeelPill feel={e.feel} />{e.notes ? <span>{e.notes}</span> : null}</span></span><PainChip p={e.pain_during} /></li>
                ))}
              </ul>
            ) : <span className="empty">You haven&apos;t logged this one yet.</span>}
          </SectionCard>
          <SectionCard title="Version history"><WorkoutHistory w={w} /></SectionCard>
        </div>
      </div>
    </div>
  );
}
