"use client";
// One way to show planned days. PlanDayTile = a day with a tile per workout (week pages, version viewer);
// PlanItemsCompact = one line per day (proposal cards, version lists).
import { Tag } from "./ui";
import WorkoutTile from "./WorkoutTile";
import { itemWorkoutIds } from "@/lib/rules";
import type { LogEntry, PlanItem, Workout } from "@/lib/types";

export function PlanDayTile({ item, workouts, log, did, changed }: { item: PlanItem; workouts: Workout[]; log: LogEntry[]; did?: boolean; changed?: boolean }) {
  const ids = itemWorkoutIds(item, workouts, log);
  return (
    <div className={`daytile k-${item.kind}`}>
      <div className="daytitle"><strong>{item.day} · {item.title}</strong><span className="row nowrap gap-6">{changed && <Tag tone="accent">Changed</Tag>}{did && <Tag tone="good">Logged</Tag>}</span></div>
      {item.note && <span className="note">{item.note}</span>}
      {ids.length > 0 && (
        <div className="tiles">
          {ids.map((id) => { const w = workouts.find((x) => x.id === id); return w ? <WorkoutTile key={id} w={w} variant="card" status={did ? "Logged" : null} /> : null; })}
        </div>
      )}
    </div>
  );
}

export function PlanItemsCompact({ items, workouts, changed }: { items: PlanItem[]; workouts: Pick<Workout, "id" | "name">[]; changed?: Set<string> }) {
  if (!items.length) return <span className="empty">Nothing planned.</span>;
  const nameOf = (id: string) => workouts.find((w) => w.id === id)?.name ?? (id.startsWith("new:") ? id.slice(4) : "?");
  return (
    <ul className="planlist">
      {items.map((it) => {
        const names = it.workout_ids.map(nameOf).join(" + ");
        return (
          <li key={it.key}>
            <span className="pd">{it.day}</span>
            <span>{it.title}{names && names !== it.title ? <><br /><span className="meta">{names}</span></> : null}</span>
            {changed?.has(it.key) ? <Tag tone="accent">Changed</Tag> : <span />}
          </li>
        );
      })}
    </ul>
  );
}
