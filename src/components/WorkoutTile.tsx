"use client";
// One way to show a workout. "row" is a list item that expands (Library); "card" is a tile that links to the
// workout's page (week and program pages). Rundown = the set/circuit detail; WorkoutActions = what you can do with it.
import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import Collapsible from "./Collapsible";
import Rundown from "./Rundown";
import { Tag } from "./ui";
import { WatchChip, useGarminDownload } from "./Watch";
import type { Workout } from "@/lib/types";

/** "14 exercises · 3 sets" */
export function workoutSummary(w: Workout): string {
  const blocks = w.rundown ?? [];
  const ex = blocks.reduce((a, b) => a + b.rows.length, 0);
  const sets = blocks.filter((b) => b.label).length;
  return ex ? `${ex} exercise${ex === 1 ? "" : "s"}${sets ? ` · ${sets} set${sets === 1 ? "" : "s"}` : ""}` : "No details yet";
}

/** Change with coach, download for the watch, and (optionally) the version history toggle. */
export function WorkoutActions({ w, history, onHistory }: { w: Workout; history?: boolean; onHistory?: () => void }) {
  const { askCoach } = useApp();
  const { download, busy } = useGarminDownload();
  return (
    <div className="row">
      <button onClick={() => askCoach(`Can you change "${w.name}"? I'd like it to: `, false)}>Change with coach</button>
      <button disabled={busy} onClick={() => download(`id=${w.id}`)}>Download .fit</button>
      {onHistory && <button aria-expanded={!!history} onClick={onHistory}>History (v{w.version})</button>}
    </div>
  );
}

/** The full rundown(s) for a day's workouts, folded away on phones so the check-in stays within reach. */
export function WorkoutRundowns({ workouts }: { workouts: (Workout | undefined)[] }) {
  return <Collapsible>{workouts.map((w, i) => <Rundown key={w?.id ?? i} workout={w} />)}</Collapsible>;
}

type Props = {
  w: Workout;
  variant?: "row" | "card";
  /** row: open the details inline */
  open?: boolean;
  onToggle?: () => void;
  /** row: extra content under the rundown (e.g. version history) */
  children?: ReactNode;
  history?: boolean;
  onHistory?: () => void;
  /** card: small status on the tile, e.g. "Logged" */
  status?: string | null;
  note?: ReactNode;
};

export default function WorkoutTile({ w, variant = "row", open = false, onToggle, children, history, onHistory, status, note }: Props) {
  if (variant === "card") {
    return (
      <Link href={`/library/${w.id}`} className="wtile">
        <span className="wtile-head"><strong>{w.name}{w.owner_id ? " (yours)" : ""}</strong>{status && <Tag>{status}</Tag>}</span>
        <span className="meta">{workoutSummary(w)}</span>
        {note && <span className="meta">{note}</span>}
        <span className="row gap-6"><Tag>{w.category}</Tag><WatchChip w={w} /></span>
      </Link>
    );
  }
  return (
    <li className="wrow">
      <button className="rowbtn" aria-expanded={open} onClick={onToggle}>
        <strong>{w.name}{w.owner_id ? " (yours)" : ""}</strong>
        <span className="row nowrap"><WatchChip w={w} /><Tag>{w.category}</Tag></span>
      </button>
      {open && (
        <div className="stack pb-8">
          <Rundown workout={w} />
          <WorkoutActions w={w} history={history} onHistory={onHistory} />
          <Link href={`/library/${w.id}`}>Open the full page</Link>
          {children}
        </div>
      )}
    </li>
  );
}
