"use client";
import { useState } from "react";
import type { Proposal, WorkoutProposal } from "@/lib/proposals";
import type { AppData, RundownBlock } from "@/lib/types";

const rowKey = (r: [string, string, string]) => r.join("|");

function WorkoutDiff({ p, data }: { p: WorkoutProposal; data: AppData }) {
  const base = p.base_id ? data.workouts.find((w) => w.id === p.base_id) : undefined;
  const oldRows = new Set((base?.rundown ?? []).flatMap((b: RundownBlock) => b.rows.map(rowKey)));
  const newRows = new Set(p.blocks.flatMap((b) => b.rows.map(rowKey)));
  const removed = [...oldRows].filter((r) => !newRows.has(r)).map((r) => r.split("|"));
  return (
    <>
      <div className="rundown-title">{base ? `Change: ${base.name}` : "New workout"} → {p.name}</div>
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
      {removed.length > 0 && (
        <div className="block" style={{ borderLeftColor: "var(--bad)" }}>
          <div className="block-label" style={{ color: "var(--bad)" }}>Removed</div>
          <ul className="rundown">{removed.map((r, i) => <li key={i} style={{ textDecoration: "line-through", color: "var(--muted)" }}><span className="ex">{r[0]}</span><span className="sr">{r[1]}</span></li>)}</ul>
        </div>
      )}
    </>
  );
}

export default function ProposalCard({ proposal, data, onSave }: { proposal: Proposal; data: AppData; onSave: (p: Proposal) => Promise<boolean> }) {
  const [state, setState] = useState<"open" | "saving" | "saved" | "discarded" | "error">("open");
  const wName = (id: string) => data.workouts.find((w) => w.id === id)?.name ?? "?";
  const oldPlan = proposal.type === "plan" ? data.plans.find((pl) => pl.kind === proposal.kind) : undefined;

  return (
    <div className="msg ai" style={{ maxWidth: "100%", border: "1px solid var(--line)", display: "grid", gap: 8 }}>
      <strong>{proposal.type === "workout" ? "Suggested workout" : `Suggested ${proposal.kind === "travel" ? "travel" : "weekly"} plan`}</strong>
      {proposal.reason && <span className="note">{proposal.reason}</span>}
      {proposal.type === "workout" ? (
        <WorkoutDiff p={proposal} data={data} />
      ) : (
        <>
          <ul className="rundown">
            {proposal.items.map((it) => (
              <li key={it.key}><span className="ex">{it.day} · {it.title}</span><span className="sr" /><span className="tip">{it.workout_ids.map(wName).join(" + ") || (it.kind === "rest" ? "Rest" : "")}{it.note ? ` - ${it.note}` : ""}</span></li>
            ))}
          </ul>
          {oldPlan?.items.length ? <span className="note">Replaces: {oldPlan.items.map((i) => `${i.day} ${i.title}`).join(", ")}. Progress this week resets.</span> : null}
        </>
      )}
      {state === "open" || state === "saving" || state === "error" ? (
        <div className="row">
          <button className="primary" disabled={state === "saving"} onClick={async () => { setState("saving"); setState((await onSave(proposal)) ? "saved" : "error"); }}>Save</button>
          <button disabled={state === "saving"} onClick={() => setState("discarded")}>Discard</button>
          {state === "error" && <span className="status">Couldn&apos;t save. Try again.</span>}
        </div>
      ) : (
        <span className="note">{state === "saved" ? "Saved." : "Discarded."}</span>
      )}
    </div>
  );
}
