"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { programHref } from "@/components/Programs";
import { SectionCard } from "@/components/ui";
import WeekView from "@/components/WeekView";
import { programPosition } from "@/lib/programs";

/** One week of a program. The program header and phases come from the layout, so only this part changes. */
export default function ProgramWeekPage() {
  const { id, n } = useParams<{ id: string; n: string }>();
  const { data, today } = useApp();
  const p = data.programs.find((x) => x.id === id);
  const week = Math.max(1, Number.parseInt(n, 10) || 1);
  if (!p) return null;
  const total = programPosition(p, today).totalWeeks;
  if (total && week > total) {
    return <SectionCard><span className="empty">&quot;{p.title}&quot; runs {total} weeks, so there&apos;s no week {week}.</span><div className="row"><Link href={programHref(p.id, total)}>Go to week {total}</Link></div></SectionCard>;
  }
  return <WeekView p={p} week={week} />;
}
