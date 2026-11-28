"use client";
import { useParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import WeekView from "@/components/WeekView";
import { programPosition } from "@/lib/programs";

/** The program's landing: this week's view (week 1 when it isn't running). */
export default function ProgramPage() {
  const { id } = useParams<{ id: string }>();
  const { data, today } = useApp();
  const p = data.programs.find((x) => x.id === id);
  if (!p) return null;
  const pos = programPosition(p, today);
  const week = p.status === "active" ? Math.max(1, Math.min(pos.week, pos.totalWeeks ?? pos.week)) : 1;
  return <WeekView p={p} week={week} />;
}
