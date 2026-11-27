"use client";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import Rundown from "@/components/Rundown";

export default function Library() {
  const { data, askCoach } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const cats = useMemo(() => ["All", ...[...new Set(data.workouts.map((w) => w.category))].sort()], [data.workouts]);
  const list = data.workouts.filter((w) => (cat === "All" || w.category === cat) && w.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Library</h1>
        <button className="askbtn" onClick={() => askCoach("I'd like a new set of workouts. I want to focus on: ", false)}>Build with coach</button>
      </div>
      <input
        className="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search workouts"
        aria-label="Search workouts"
        style={{ font: "inherit", color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", width: "100%" }}
      />
      <div className="pills" role="group" aria-label="Category">
        {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <section className="card">
        <ul className="list">
          {list.map((w) => (
            <li key={w.id} style={{ display: "grid" }}>
              <button className="rowbtn" aria-expanded={open === w.id} onClick={() => setOpen(open === w.id ? null : w.id)}>
                <strong>{w.name}{w.owner_id ? " (yours)" : ""}</strong>
                <span className="tag">{w.category}</span>
              </button>
              {open === w.id && (
                <div style={{ display: "grid", gap: 8, paddingBottom: 8 }}>
                  <Rundown workout={w} />
                  <div className="row">
                    <button onClick={() => askCoach(`Can you change "${w.name}"? I'd like it to: `, false)}>Change with coach</button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {!list.length && <li className="empty">No workouts match.</li>}
        </ul>
      </section>
    </div>
  );
}
