"use client";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { PlanItemsCompact } from "./PlanItems";
import { Tag } from "./ui";
import VersionList from "./VersionList";
import { restoreWeekRevision } from "@/lib/actions";
import { stampDate } from "@/lib/format";
import { changedItemKeys, storedWeek } from "@/lib/programWeeks";
import type { Program, ProgramWeekVersion } from "@/lib/types";

/** Every version of one program week: what changed each time and why. Restore an earlier one if you like. */
export default function WeekHistory({ program, week }: { program: Program; week: number }) {
  const { sb, data, run } = useApp();
  const row = storedWeek(data, program.id, week);
  const [rows, setRows] = useState<ProgramWeekVersion[] | null>(null);

  useEffect(() => {
    if (!row) return;
    let live = true;
    sb.from("program_week_versions").select("id, program_week_id, revision, status, items, note, changed_at")
      .eq("program_week_id", row.id).order("revision", { ascending: false }).limit(50)
      .then(({ data: d }) => { if (live) setRows((d as ProgramWeekVersion[]) ?? []); });
    return () => { live = false; };
  }, [sb, row?.id, row?.revision]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return <p className="status">No versions yet. A week is kept the first time it's planned.</p>;
  const current = row.revision ?? 1;
  return (
    <VersionList
      rows={rows && rows.map((v, i) => {
        const before = rows[i + 1]; // the next older version
        return {
          key: String(v.revision),
          title: <><strong>Revision {v.revision}</strong> · {stampDate(v.changed_at)}</>,
          note: v.note || undefined,
          tags: <>{v.revision === current && <Tag>Current</Tag>}{v.status === "draft" && <Tag tone="accent">Draft</Tag>}</>,
          body: (
            <>
              <PlanItemsCompact items={v.items} workouts={data.workouts} changed={before ? changedItemKeys(before.items, v.items) : undefined} />
              {v.revision !== current && <div className="row"><button onClick={() => run(() => restoreWeekRevision(sb, data, program, week, v), "Couldn't restore that version.")}>Restore revision {v.revision}</button></div>}
            </>
          ),
        };
      })}
      emptyText="No earlier versions yet."
    />
  );
}
