"use client";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import Rundown from "./Rundown";
import { Tag } from "./ui";
import type { Workout, WorkoutVersion } from "@/lib/types";
import { stampDate as when } from "@/lib/format";


/** Version list for one workout. Tap a version to see it; restore an older one if you can edit it. */
export default function WorkoutHistory({ w }: { w: Workout }) {
  const { sb, data, uid, run } = useApp();
  const [rows, setRows] = useState<WorkoutVersion[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const onWatch = data.exports.find((e) => e.workout_id === w.id)?.version;
  const canEdit = w.owner_id === uid || (w.owner_id === null && data.profile.role === "admin");

  useEffect(() => {
    let live = true;
    sb.from("workout_versions").select("id, workout_id, version, name, category, rundown, notes, change_note, changed_by, changed_at")
      .eq("workout_id", w.id).order("version", { ascending: false }).limit(50)
      .then(({ data: d }) => { if (live) setRows((d as WorkoutVersion[]) ?? []); });
    return () => { live = false; };
  }, [sb, w.id, w.version]);

  async function restore(v: WorkoutVersion) {
    const { data: full } = await sb.from("workout_versions").select("steps").eq("id", v.id).single();
    await run(async () => {
      const { error } = await sb.from("workouts").update({ name: v.name, category: v.category, rundown: v.rundown, steps: full?.steps ?? [], notes: v.notes, change_note: `Restored v${v.version}`, updated_by: uid }).eq("id", w.id);
      if (error) throw error;
    }, "Couldn't restore that version.");
    setOpen(null);
  }

  if (!rows) return <p className="status">Loading history…</p>;
  if (!rows.length) return <p className="status">No history yet.</p>;
  return (
    <ul className="history">
      {rows.map((v) => (
        <li key={v.id}>
          <button className="rowbtn" aria-expanded={open === v.version} onClick={() => setOpen(open === v.version ? null : v.version)}>
            <span>
              <strong>v{v.version}</strong> · {when(v.changed_at)}
              {v.change_note ? <span className="history-note"> - {v.change_note}</span> : null}
            </span>
            <span className="row nowrap">
              {v.version === w.version && <Tag>Current</Tag>}
              {v.version === onWatch && <Tag>On watch</Tag>}
            </span>
          </button>
          {open === v.version && (
            <div className="history-body">
              <Rundown workout={{ ...w, name: v.name, rundown: v.rundown, notes: v.notes }} />
              {v.notes && <p className="status">{v.notes}</p>}
              {canEdit && v.version !== w.version && (
                <div className="row"><button onClick={() => restore(v)}>Restore v{v.version}</button></div>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
