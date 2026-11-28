"use client";
// A suggestion, never an action: "plan ahead" or "re-plan", with the reasons, and a way to say not now.
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { activeProgram } from "@/lib/programs";
import { planAheadPrompt, programNudge, replanPrompt } from "@/lib/programWeeks";

const STORE = "cairn.nudge.dismissed";
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(STORE) ?? "[]"); } catch { return []; } };

export default function ProgramNudge() {
  const { data, today, askCoach } = useApp();
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  useEffect(() => { setDismissed(read()); }, []);
  const p = activeProgram(data);
  const n = p ? programNudge(data, p, today) : null;
  if (!p || !n || dismissed === null || dismissed.includes(n.key)) return null;

  const ask = n.kind === "plan_ahead" ? planAheadPrompt(p, n.weeks) : replanPrompt(p, n.weeks, n.reasons);
  const dismiss = () => { const next = [...dismissed, n.key].slice(-50); try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* ignore */ } setDismissed(next); };

  return (
    <div className="banner" role="status">
      <strong>{n.title}</strong>
      {n.reasons.length === 1 ? <span>{n.reasons[0]}</span> : <ul className="reasons">{n.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      <div className="row">
        <button className="primary" onClick={() => askCoach(ask)}>{n.kind === "plan_ahead" ? "Plan ahead" : "Re-plan the rest"}</button>
        <button onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
