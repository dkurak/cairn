"use client";
import { useState } from "react";
import { SAVE_TARGET_NOTE, workoutSaveTarget, type PlanProposal, type ProgramProposal, type Proposal, type WorkoutProposal } from "@/lib/proposals";
import { effectivePhases, fmtDate } from "@/lib/programs";
import PhaseBar from "./PhaseBar";
import type { AppData, RundownBlock } from "@/lib/types";

const rowKey = (r: [string, string, string]) => r.join("|");

function WorkoutDiff({ p, data }: { p: WorkoutProposal; data: AppData }) {
  const base = p.base_id ? data.workouts.find((w) => w.id === p.base_id) : undefined;
  const oldRows = new Set((base?.rundown ?? []).flatMap((b: RundownBlock) => b.rows.map(rowKey)));
  const newRows = new Set(p.blocks.flatMap((b) => b.rows.map(rowKey)));
  const removed = [...oldRows].filter((r) => !newRows.has(r)).map((r) => r.split("|"));
  const target = workoutSaveTarget(p, data);
  const notesChanged = !!base && (base.notes ?? "").trim() !== p.notes.trim();
  return (
    <>
      <div className="rundown-title">{base ? `Change: ${base.name}${base.name !== p.name ? ` → ${p.name}` : ""}` : `New workout: ${p.name}`}</div>
      <span className="note">{SAVE_TARGET_NOTE[target]}{base && base.category !== p.category ? ` Category ${base.category} → ${p.category}.` : ""}</span>
      {p.blocks.map((b, i) => (
        <div className="block" key={i}>
          {b.label && <div className="block-label">{b.label}</div>}
          <ul className="rundown">
            {b.rows.map((r, j) => {
              const added = !!base && !oldRows.has(rowKey(r));
              return (
                <li key={j} style={added ? { background: "var(--good-bg)", margin: "0 -6px", padding: "9px 6px" } : undefined}>
                  <span className="ex">{added ? "+ " : ""}{r[0]}</span><span className="sr">{r[1]}</span>{r[2] ? <span className="tip">{r[2]}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {(notesChanged || (!base && p.notes)) && (
        <div className="block">
          <div className="block-label">Notes</div>
          {notesChanged && base?.notes ? <div className="note" style={{ textDecoration: "line-through" }}>{base.notes}</div> : null}
          <div className="note" style={notesChanged ? { background: "var(--good-bg)" } : undefined}>{p.notes || "(none)"}</div>
        </div>
      )}
      {p.steps && <span className="note">Watch: {target === "new" ? "a new .fit to download" : "flagged \"Update watch\" in the Library after you save"}.{p.garmin_warnings?.length ? ` ${p.garmin_warnings.join(". ")}.` : ""}</span>}
      {removed.length > 0 && (
        <div className="block" style={{ borderLeftColor: "var(--bad)" }}>
          <div className="block-label" style={{ color: "var(--bad)" }}>Removed</div>
          <ul className="rundown">{removed.map((r, i) => <li key={i} style={{ textDecoration: "line-through", color: "var(--muted)" }}><span className="ex">{r[0]}</span><span className="sr">{r[1]}</span></li>)}</ul>
        </div>
      )}
    </>
  );
}

function PlanBody({ p, data }: { p: PlanProposal; data: AppData }) {
  const wName = (id: string) => (id.startsWith("new:") ? `${id.slice(4)} (new)` : data.workouts.find((w) => w.id === id)?.name ?? "?");
  return (
    <>
      <ul className="rundown">
        {p.items.map((it) => (
          <li key={it.key}><span className="ex">{it.day} · {it.title}</span><span className="sr" /><span className="tip">{it.workout_ids.map(wName).join(" + ") || (it.kind === "rest" ? "Rest" : "")}{it.note ? ` - ${it.note}` : ""}</span></li>
        ))}
      </ul>
      {p.new_workouts?.map((w) => (
        <details key={w.name} className="block">
          <summary className="block-label">New: {w.name}</summary>
          <WorkoutDiff p={w} data={data} />
        </details>
      ))}
    </>
  );
}

function ProgramBody({ p, data }: { p: ProgramProposal; data: AppData }) {
  const active = data.programs.find((x) => x.status === "active");
  const prefs = Object.entries(p.preferences ?? {}).filter(([, v]) => v);
  const shown = p.activate ? effectivePhases({ ...p, id: "", user_id: "", status: "idea", start_date: null, created_at: "", updated_at: "" }) : p.phases;
  const label: Record<string, string> = { session_minutes: "Session", variety: "Variety", rest_days: "Rest", equipment: "Equipment", limits: "Limits" };
  return (
    <>
      <div className="rundown-title">{p.title}</div>
      <span className="note">
        {p.kind === "event" && p.target_date ? `Event ${fmtDate(p.target_date)}` : "Ongoing"}
        {p.weeks ? ` · ${p.weeks} weeks` : ""}{p.days_per_week ? ` · ${p.days_per_week} days/week` : ""}
      </span>
      {p.goal && <span>{p.goal}</span>}
      <PhaseBar phases={shown} />
      <ul className="rundown">
        {shown.map((ph, i) => <li key={i}><span className="ex">{ph.name}</span><span className="sr">{ph.weeks} wk</span><span className="tip">{ph.focus}</span></li>)}
      </ul>
      {prefs.length > 0 && <span className="note">{prefs.map(([k, v]) => `${label[k] ?? k}: ${k === "session_minutes" ? `${v} min` : v}`).join(" · ")}</span>}
      {p.first_week && p.activate && (
        <details className="block" open>
          <summary className="block-label">Week 1</summary>
          <PlanBody p={p.first_week} data={data} />
        </details>
      )}
      <span className="note">
        {p.activate ? `Starts now${p.first_week ? " and replaces this week's plan" : ""}.${active ? ` Pauses "${active.title}".` : ""}` : "Saved to your program bank to start later."}
      </span>
    </>
  );
}

export default function ProposalCard({ proposal, data, status = "open", onSave, onStatus }: { proposal: Proposal; data: AppData; status?: "open" | "saved" | "discarded" | null; onSave: (p: Proposal) => Promise<boolean>; onStatus?: (s: "saved" | "discarded") => void }) {
  const [state, setState] = useState<"open" | "saving" | "saved" | "discarded" | "error">(status ?? "open");
  const oldPlan = proposal.type === "plan" ? data.plans.find((pl) => pl.kind === proposal.kind) : undefined;
  const nNew = proposal.type === "plan" ? proposal.new_workouts?.length ?? 0 : 0;
  const heading =
    proposal.type === "workout" ? "Suggested workout"
    : proposal.type === "program" ? "Suggested program"
    : `Suggested ${proposal.kind === "travel" ? "travel" : "weekly"} plan${proposal.program_week ? ` · program week ${proposal.program_week}` : ""}${nNew ? ` + ${nNew} new workout${nNew > 1 ? "s" : ""}` : ""}`;

  return (
    <div className="msg ai" style={{ maxWidth: "100%", border: "1px solid var(--line)", display: "grid", gap: 8 }}>
      <strong>{heading}</strong>
      {proposal.reason && <span className="note">{proposal.reason}</span>}
      {proposal.type === "workout" ? (
        <WorkoutDiff p={proposal} data={data} />
      ) : proposal.type === "program" ? (
        <ProgramBody p={proposal} data={data} />
      ) : (
        <>
          <PlanBody p={proposal} data={data} />
          {oldPlan?.items.length ? <span className="note">Replaces: {oldPlan.items.map((i) => `${i.day} ${i.title}`).join(", ")}. Progress this week resets.</span> : null}
        </>
      )}
      {state === "open" || state === "saving" || state === "error" ? (
        <div className="row">
          <button className="primary" disabled={state === "saving"} onClick={async () => { setState("saving"); const ok = await onSave(proposal); setState(ok ? "saved" : "error"); if (ok) onStatus?.("saved"); }}>{proposal.type === "program" ? (proposal.activate ? "Start program" : "Save program") : "Save"}</button>
          <button disabled={state === "saving"} onClick={() => { setState("discarded"); onStatus?.("discarded"); }}>Discard</button>
          {state === "error" && <span className="status">Couldn&apos;t save. Try again.</span>}
        </div>
      ) : (
        <span className="note">{state === "saved" ? "Saved." : "Discarded."}</span>
      )}
    </div>
  );
}
