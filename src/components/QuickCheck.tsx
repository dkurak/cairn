"use client";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { addPainArea, saveDailyFeel, savePainCheck } from "@/lib/actions";
import { checkOn, checksFor, trendNote } from "@/lib/rules";
import { FeelPicker, PainPicker } from "./ui";

// one tap per question: None / Aware / Sharp / Bad  ->  0 / 2 / 5 / 8 (fine-tune with the 0-10 row)
const BANDS = [
  { label: "None", value: 0, test: (p: number) => p === 0 },
  { label: "Aware", value: 2, test: (p: number) => p >= 1 && p <= 3 },
  { label: "Sharp", value: 5, test: (p: number) => p >= 4 && p <= 6 },
  { label: "Bad", value: 8, test: (p: number) => p >= 7 },
];

export default function QuickCheck({ date, disabled = false }: { date: string; disabled?: boolean }) {
  const { data, sb, uid, today, run, askCoach } = useApp();
  const isToday = date === today;
  const label = isToday ? "today" : new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const [exact, setExact] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const areas = data.areas.filter((a) => a.active);
  const feel = data.checkins.find((c) => c.date === date)?.feel;
  const unanswered = areas.filter((a) => !checkOn(data.checks, a.id, date)).length + (feel ? 0 : 1);

  return (
    <section className="card" aria-labelledby="qc-h" style={disabled ? { opacity: 0.55 } : undefined}>
      <div className="top">
        <h2 id="qc-h">Quick check-in{isToday ? "" : ` · ${label}`}</h2>
        <small>{disabled ? "opens on the day" : unanswered ? (isToday ? `${unanswered} to go` : "not recorded") : "all answered"}</small>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <strong>{isToday ? "How are you feeling overall?" : "How did you feel overall?"}</strong>
        <FeelPicker wide allowClear={false} disabled={disabled} value={feel ?? null} label="Overall feeling" onChange={(f) => f && void run(() => saveDailyFeel(sb, uid, f, date))} />
        {!disabled && feel === "Rough" && <button className="link" style={{ justifySelf: "start" }} onClick={() => askCoach("I'm feeling rough today. What should I do - lighter workout or rest?")}>Talk it through with the coach</button>}
      </div>

      {areas.map((a) => {
        const cur = checkOn(data.checks, a.id, date)?.pain;
        return (
          <div key={a.id} style={{ display: "grid", gap: 6, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
            <div className="top">
              <strong>{isToday ? `How's your ${a.name.toLowerCase()}?` : `${a.name}`}</strong>
              {isToday && <small>{trendNote(data.checks, a.id)}</small>}
            </div>
            <div className="quick" role="group" aria-label={`${a.name} today`}>
              {BANDS.map((b) => (
                <button key={b.label} aria-pressed={cur != null && b.test(cur)} disabled={disabled} onClick={() => run(() => savePainCheck(sb, uid, a.id, b.value, date))}>{b.label}</button>
              ))}
            </div>
            {exact === a.id ? (
              <PainPicker value={cur ?? null} allowClear={false} label={`${a.name} exact pain, 0 to 10`} onChange={(v) => v != null && void run(() => savePainCheck(sb, uid, a.id, v, date))} />
            ) : (
              <div className="row">
                <button className="link" disabled={disabled} style={{ fontSize: ".85rem" }} onClick={() => setExact(a.id)}>{cur != null ? `${cur}/10 - change exact number` : "Exact number (0-10)"}</button>
                {!disabled && cur != null && cur >= 4 && (
                  <button className="link" style={{ fontSize: ".85rem" }} onClick={() => askCoach(`My ${a.name} is ${cur}/10 today. What should I change in my workouts?`)}>Ask coach what to change</button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {disabled ? null : adding ? (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) { void run(() => addPainArea(sb, uid, n)); setName(""); setAdding(false); } }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Anything else hurting? e.g. Low back" aria-label="Body area" maxLength={60} />
          <button type="submit">Add</button>
        </form>
      ) : (
        <button className="link" style={{ justifySelf: "start" }} onClick={() => setAdding(true)}>+ Anything else hurting?</button>
      )}
    </section>
  );
}
