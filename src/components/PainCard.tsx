"use client";
import { useState } from "react";
import type { PainArea, PainCheck, LogEntry } from "@/lib/types";
import { PAIN_SCALE } from "@/lib/types";
import { checkOn, checksFor, trendNote } from "@/lib/rules";
import { PainLine, type PainPt } from "./charts/Charts";
import { PainPicker, SectionCard } from "./ui";

type Props = {
  areas: PainArea[];
  checks: PainCheck[];
  log: LogEntry[];
  today: string;
  hint: string | null; // e.g. "Morning after your Nov 21 tour..."
  onCheck: (areaId: string, pain: number) => void;
  onAdd: (name: string) => void;
  onResolve: (areaId: string) => void;
};

export default function PainCard({ areas, checks, log, today, hint, onCheck, onAdd, onResolve }: Props) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const active = areas.filter((a) => a.active);
  const pending = active.filter((a) => !checkOn(checks, a.id, today));

  const pointsFor = (a: PainArea): PainPt[] => [
    ...checksFor(checks, a.id).map((c) => ({ date: c.date, p: c.pain })),
    // sessions count toward the primary area's trend
    ...(a.is_primary ? log.filter((e) => e.pain_during != null).map((e) => ({ date: e.date, at: e.created_at, p: e.pain_during as number })) : []),
  ];

  return (
    <SectionCard title="Pain check" aside={pending.length ? `${pending.length} to check today` : active.length ? "all checked today" : ""}>
      {hint && <span className="note">{hint}</span>}
      {!active.length && <p className="empty">Anything hurting? Add an area (or tell the coach, e.g. &quot;my low back is sore&quot;) and tap a number each day. You&apos;ll see the trend here.</p>}
      {active.map((a) => (
        <div key={a.id} className="areablock">
          <div className="top">
            <strong>{a.name}</strong>
            <small>{trendNote(checks, a.id)}</small>
          </div>
          <PainPicker value={checkOn(checks, a.id, today)?.pain ?? null} allowClear={false} label={`${a.name} pain today, 0 to 10`} onChange={(v) => v != null && onCheck(a.id, v)} />
          <PainLine points={pointsFor(a)} label={a.name} />
          <button className="link self-start small" onClick={() => onResolve(a.id)}>Mostly better - stop tracking {a.name}</button>
        </div>
      ))}
      <span className="scale">{PAIN_SCALE}</span>
      {adding ? (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName(""); setAdding(false); } }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Low back, Left shoulder" aria-label="Body area" maxLength={60} />
          <button type="submit">Add</button>
        </form>
      ) : (
        <button className="link self-start" onClick={() => setAdding(true)}>+ Track another area</button>
      )}
    </SectionCard>
  );
}
