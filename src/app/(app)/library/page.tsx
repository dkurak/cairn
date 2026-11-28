"use client";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { PageHeader, SectionCard } from "@/components/ui";
import WorkoutHistory from "@/components/WorkoutHistory";
import WorkoutTile from "@/components/WorkoutTile";
import { WatchCard } from "@/components/Watch";

export default function Library() {
  const { data } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const cats = useMemo(() => ["All", ...[...new Set(data.workouts.map((w) => w.category))].sort()], [data.workouts]);
  const list = data.workouts.filter((w) => (cat === "All" || w.category === cat) && w.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <PageHeader title="Library" coach={{ text: "I'd like a new set of workouts. I want to focus on: " }} />
      <WatchCard />
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workouts" aria-label="Search workouts" />
      <div className="pills" role="group" aria-label="Category">
        {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <SectionCard>
        <ul className="list">
          {list.map((w) => (
            <WorkoutTile
              key={w.id}
              w={w}
              open={open === w.id}
              onToggle={() => setOpen(open === w.id ? null : w.id)}
              history={history === w.id}
              onHistory={() => setHistory(history === w.id ? null : w.id)}
            >
              {history === w.id && <WorkoutHistory w={w} />}
            </WorkoutTile>
          ))}
          {!list.length && <li className="empty">No workouts match.</li>}
        </ul>
      </SectionCard>
    </div>
  );
}
