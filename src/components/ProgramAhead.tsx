"use client";
// The good-news tile: a plan is in place. Shows how much is mapped out and a peek at what's next. Never a to-do.
import Link from "next/link";
import { useApp } from "./AppProvider";
import { programHref } from "./Programs";
import { activeProgram, programPosition } from "@/lib/programs";
import { programAhead, programNudge } from "@/lib/programWeeks";
import { dateRange } from "@/lib/format";

export default function ProgramAhead() {
  const { data, today } = useApp();
  const p = activeProgram(data);
  if (!p || programNudge(data, p, today)) return null; // a suggestion is showing instead
  const a = programAhead(data, p, today);
  if (!a || !a.next) return null;
  const pos = programPosition(p, today);
  const weeks = Array.from({ length: a.total }, (_, i) => i + 1);
  return (
    <div className="banner good" role="status">
      <strong>{a.allPlanned ? "You're set - the whole program is mapped out" : `${a.planned.length} of ${a.total} weeks are mapped out`}</strong>
      <div className="weekdots" role="img" aria-label={`${a.planned.length} of ${a.total} weeks planned`}>
        {weeks.map((w) => <span key={w} className={w < pos.week ? "past" : w === pos.week ? "now" : a.planned.includes(w) ? "planned" : ""} title={`Week ${w}`} />)}
      </div>
      <span>Coming up: <Link href={programHref(p.id, a.next.week)}>Week {a.next.week}{a.next.phase ? ` · ${a.next.phase}` : ""}{a.next.start && a.next.end ? ` · ${dateRange(a.next.start, a.next.end)}` : ""}</Link>{a.next.titles.length ? ` - ${a.next.titles.slice(0, 4).join(", ")}${a.next.titles.length > 4 ? "..." : ""}` : ""}. Change it any time - the plan bends with you.</span>
    </div>
  );
}
