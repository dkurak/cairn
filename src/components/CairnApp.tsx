"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addPainArea, deleteEntry, loadAll, logEntries, markDone, patchState, savePainCheck, setAreaActive, setPhase, setTravel, skipUpNext, startNextWeek, updateEntry,
} from "@/lib/actions";
import { activePlan, checksFor, doneMap, greenLight, itemWorkoutIds, painClass, primaryArea, sortedLog, todayISO, tours, upNext } from "@/lib/rules";
import type { Proposal } from "@/lib/proposals";
import { FEELS, PAIN_SCALE, type AppData, type Feel, type LogEntry } from "@/lib/types";
import Rundown from "./Rundown";
import PainCard from "./PainCard";
import ProposalCard from "./ProposalCard";

const EXTRA = ["Tour", "Run", "Bike", "Hike", "Other"];
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const Chip = ({ p, label }: { p: number | null; label?: string }) =>
  p == null ? null : <span className={`chip ${painClass(p)}`}>{label ? `${label} ` : ""}{p}/10</span>;

type Sheet = { itemKey?: string; whats: string[]; rest?: boolean };

export default function CairnApp({ initial }: { initial: AppData }) {
  const sb = useMemo(() => createClient(), []);
  const [data, setData] = useState(initial);
  const [status, setStatus] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [libPick, setLibPick] = useState(() => initial.workouts.find((w) => w.name === "SKI1 Hip Strength")?.id ?? initial.workouts[0]?.id ?? "");

  const { state, workouts, log, areas, checks } = data;
  const uid = state.user_id;
  const today = todayISO();
  const wById = (id: string) => workouts.find((w) => w.id === id);

  async function run(fn: () => Promise<unknown>, fail = "Couldn't save that. Try again.") {
    setStatus("");
    try {
      await fn();
      setData(await loadAll(sb, uid));
      return true;
    } catch {
      setStatus(fail);
      return false;
    }
  }

  const next = upNext(data);
  const plan = activePlan(data);
  const dm = doneMap(state);
  const touring = !!plan?.items.some((i) => i.kind === "tour");
  const gl = greenLight(state, log, touring);
  const lastTour = tours(log)[0];
  const primary = primaryArea(areas);
  const primaryChecks = primary ? checksFor(checks, primary.id) : [];
  const afterTour = !!primary && !!lastTour && lastTour.pain_next_am == null && lastTour.date < today && !primaryChecks.some((c) => c.date === today);
  const hint = afterTour && lastTour ? `Morning after your ${fmtDate(lastTour.date)} tour: your ${primary!.name} number decides your next tour.` : null;

  const hasItem = next.type === "calm" || next.type === "item";
  const nextWorkouts = hasItem ? itemWorkoutIds(next.item, workouts, log).map(wById) : [];
  const nextTitle = next.type === "item" && next.item.cycle && nextWorkouts[0] ? nextWorkouts[0].name : hasItem ? next.item.title : "";

  async function saveProposal(p: Proposal): Promise<boolean> {
    return run(async () => {
      if (p.type === "workout") {
        const base = p.base_id ? workouts.find((w) => w.id === p.base_id) : undefined;
        if (base && base.owner_id === uid) {
          const { error } = await sb.from("workouts").update({ name: p.name, category: p.category, rundown: p.blocks, notes: p.notes, updated_by: uid }).eq("id", base.id);
          if (error) throw error;
        } else {
          let name = p.name;
          for (let n = 2; workouts.some((w) => w.owner_id === uid && w.name === name); n++) name = `${p.name} (${n})`;
          const { error } = await sb.from("workouts").insert({ owner_id: uid, name, category: p.category, steps: [], rundown: p.blocks, notes: p.notes, updated_by: uid });
          if (error) throw error;
        }
      } else {
        const existing = data.plans.find((pl) => pl.kind === p.kind);
        let planId = existing?.id;
        if (existing) {
          const { error } = await sb.from("plans").update({ items: p.items }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { data: row, error } = await sb.from("plans").insert({ owner_id: uid, name: p.kind === "travel" ? "Travel" : "My week", kind: p.kind, items: p.items }).select("id").single();
          if (error) throw error;
          planId = row.id;
        }
        await patchState(sb, uid, p.kind === "home" ? { active_home_plan_id: planId, done: {} } : { active_travel_plan_id: planId, travel_done: {} });
      }
    });
  }

  function doNext() {
    if (!hasItem) return;
    const it = next.item;
    if (next.type === "calm") return setSheet({ whats: nextWorkouts.map((w) => w?.name ?? "").filter(Boolean) });
    if (it.kind === "rest") return setSheet({ itemKey: it.key, whats: ["Rest"], rest: true });
    if (it.kind === "tour") return setSheet({ itemKey: it.key, whats: ["Tour"] });
    setSheet({ itemKey: it.key, whats: nextWorkouts.map((w) => w?.name ?? "").filter(Boolean) });
  }

  return (
    <>
      <main>
        <div className="top head">
          <h1>Cairn</h1>
          <small>
            {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
            <button className="link signout" onClick={async () => { await sb.auth.signOut(); location.href = "/login"; }}>Sign out</button>
          </small>
        </div>

        <div className="col left">
          {status && <div className="status o1" role="status">{status}</div>}

          <section className="card next o3" aria-live="polite">
            {next.type === "calm" && (
              <>
                <div className="label">Up next · calm-down</div>
                <div className="title">{next.item.title}</div>
                <div className="note">{next.item.note}</div>
                {primary && primaryChecks[0] && (
                  <div>Latest {primary.name} check: <Chip p={primaryChecks[0].pain} /> <span className="note">({fmtDate(primaryChecks[0].date)}) · need 3 or less to start</span></div>
                )}
                <div className="row"><button className="primary" onClick={doNext}>Done - log it</button></div>
                {nextWorkouts.map((w, i) => <Rundown key={i} workout={w} />)}
                <div className="row"><button className="link" onClick={() => run(() => setPhase(sb, state, "build"))}>Everyday pain is 3/10 or less - start the plan</button></div>
              </>
            )}
            {next.type === "item" && (
              <>
                <div className="label">Up next · {next.item.day}{state.travel ? " · travel mode" : ""}</div>
                <div className="title">{nextTitle}</div>
                <div className="note">{next.item.note}</div>
                <div className="row">
                  <button className="primary" onClick={doNext}>Done - log it</button>
                  <button onClick={() => run(() => skipUpNext(sb, data))}>Skip</button>
                </div>
                {nextWorkouts.map((w, i) => <Rundown key={i} workout={w} />)}
              </>
            )}
            {next.type === "empty" && (
              <>
                <div className="label">Up next</div>
                <div className="title">No plan yet</div>
                <div className="note">Tell the Cairn coach your goal, any pain, your equipment and how many days a week. It will suggest a week you can save.</div>
              </>
            )}
            {next.type === "complete" && (
              <>
                <div className="label">{state.travel ? "Travel set done" : `Week ${state.week} done`}</div>
                <div className="title">Nice work</div>
                <div className="row"><button className="primary" onClick={() => run(() => startNextWeek(sb, state))}>{state.travel ? "Run the travel set again" : "Start next week"}</button></div>
              </>
            )}
          </section>

          <section className="card o10">
            <h2>Workout library</h2>
            <label htmlFor="lib-pick" className="meta">Look up any workout</label>
            <select id="lib-pick" value={libPick} onChange={(e) => setLibPick(e.target.value)}>
              {workouts.map((w) => <option key={w.id} value={w.id}>{w.name}{w.owner_id ? " (yours)" : ""}</option>)}
            </select>
            <div className="lib-body"><Rundown workout={wById(libPick)} /></div>
          </section>
        </div>

        <div className="col right">
          <div className="o2">
            <PainCard
              areas={areas}
              checks={checks}
              log={log}
              today={today}
              hint={hint}
              onCheck={(areaId, pain) => run(() => savePainCheck(sb, uid, areaId, pain, today))}
              onAdd={(name) => run(() => addPainArea(sb, uid, name))}
              onResolve={(areaId) => run(() => setAreaActive(sb, areaId, false))}
            />
          </div>

          {gl && (
            <div className="o5"><div className={`banner ${gl.tone}`}><strong>{gl.title}</strong><span>{gl.body}</span></div></div>
          )}

          <Chat data={data} onDone={() => run(async () => {})} onSaveProposal={saveProposal} />

          <section className="card o6">
            <div className="top">
              <h2>{state.travel ? "Travel set" : "This week"}</h2>
              <small>{state.phase === "calm" ? "Starts after calm-down" : `${(plan?.items ?? []).filter((i) => dm[i.key]).length} of ${plan?.items.length ?? 0}`}</small>
            </div>
            <ul className="week">
              {(plan?.items ?? []).map((it, i) => {
                const d = dm[it.key];
                const current = next.type === "item" && next.item.key === it.key;
                return (
                  <li key={it.key} className={d ? "done" : current ? "current" : ""}>
                    <span className="tick" aria-hidden="true">{d ? (d === "skipped" ? "–" : "✓") : i + 1}</span>
                    <span className="day">{it.day}</span>
                    <span className="what">{it.title}{d === "skipped" ? " (skipped)" : ""}</span>
                  </li>
                );
              })}
              <li style={{ gridTemplateColumns: "1fr", border: "none" }}>
                <div className="row">
                  <button onClick={() => run(() => setTravel(sb, state, !state.travel))}>{state.travel ? "Back home - resume my plan" : "I'm traveling"}</button>
                  {state.phase === "build" && <button className="link" onClick={() => run(() => setPhase(sb, state, "calm"))}>Hip flared? Back to calm-down</button>}
                </div>
              </li>
            </ul>
          </section>

          <section className="card o7">
            <h2>Log something else</h2>
            <div className="row">
              <button onClick={() => setSheet({ whats: ["Tour"] })}>Log a tour</button>
              <button onClick={() => setSheet({ whats: ["SKI1 Hip Strength"] })}>Log a workout</button>
              <button onClick={() => setSheet({ whats: ["Rest"], rest: true })}>Rest day</button>
            </div>
          </section>


          <section className="card o9">
            <h2>Recent</h2>
            <RecentList
              log={log}
              editingId={editingId}
              setEditingId={setEditingId}
              onSaveNotes={(id, notes) => run(() => updateEntry(sb, id, { notes: notes.slice(0, 1000) }), "Couldn't save notes. Try again.").then((ok) => ok && setEditingId(null))}
              onDelete={(id) => run(() => deleteEntry(sb, id), "Couldn't delete. Try again.")}
            />
          </section>
        </div>
      </main>

      {sheet && (
        <LogSheet
          sheet={sheet}
          options={[...workouts.map((w) => w.name), ...EXTRA]}
          onClose={() => setSheet(null)}
          onSave={async (v) => {
            const ok = await run(async () => {
              await logEntries(sb, data, v.whats.map((what) => ({ what, date: v.date, pain_during: v.pain, feel: v.feel, notes: v.notes, vert_ft: what === "Tour" ? v.vert : null })));
              if (sheet.itemKey) await markDone(sb, data.state, sheet.itemKey, v.date);
            }, "Couldn't save. Check your connection and tap Save again.");
            if (ok) setSheet(null);
            return ok;
          }}
        />
      )}
    </>
  );
}

/* ---------- recent list ---------- */
function RecentList({ log, editingId, setEditingId, onSaveNotes, onDelete }: {
  log: LogEntry[]; editingId: string | null; setEditingId: (id: string | null) => void;
  onSaveNotes: (id: string, notes: string) => void; onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const list = sortedLog(log).slice(0, 20);
  if (!list.length) return <p className="empty">Nothing logged yet. Your first Done will show up here.</p>;
  return (
    <ul className="log">
      {list.map((e) => (
        <li key={e.id}>
          <span className="date">{fmtDate(e.date)}</span>
          <button className="entry" aria-expanded={e.id === editingId} onClick={() => { setEditingId(e.id === editingId ? null : e.id); setDraft(e.notes ?? ""); }}>
            <strong>{e.what}</strong>{e.vert_ft ? ` · ${e.vert_ft.toLocaleString()} ft` : ""}
            <span className="meta">{[e.feel, e.notes].filter(Boolean).join(" · ") || (e.id === editingId ? "" : "Tap to add notes")}</span>
          </button>
          <span className="right">
            <Chip p={e.pain_during} /><Chip p={e.pain_next_am} label="AM" />
            <button
              className="del"
              onClick={() => { if (confirm === e.id) { setConfirm(null); onDelete(e.id); } else { setConfirm(e.id); setTimeout(() => setConfirm((c) => (c === e.id ? null : c)), 4000); } }}
            >{confirm === e.id ? "Tap to confirm" : "Delete"}</button>
          </span>
          {e.id === editingId && (
            <div className="note-editor">
              <label htmlFor="note-edit" className="meta">Notes</label>
              <textarea id="note-edit" autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} />
              <div className="row">
                <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                <button type="button" className="primary" onClick={() => onSaveNotes(e.id, draft.trim())}>Save notes</button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------- log sheet ---------- */
type SheetValues = { whats: string[]; date: string; pain: number | null; feel: Feel | null; notes: string; vert: number | null };

function LogSheet({ sheet, options, onClose, onSave }: {
  sheet: Sheet; options: string[]; onClose: () => void; onSave: (v: SheetValues) => Promise<boolean>;
}) {
  const [whats, setWhats] = useState(sheet.whats.length ? sheet.whats : ["Other"]);
  const [date, setDate] = useState(todayISO());
  const [pain, setPain] = useState<number | null>(null);
  const [feel, setFeel] = useState<Feel | null>(null);
  const [notes, setNotes] = useState("");
  const [vert, setVert] = useState("");
  const [saving, setSaving] = useState(false);
  const hasTour = whats.includes("Tour");
  const opts = (cur: string) => (options.includes(cur) ? options : [cur, ...options]);
  const setAt = (i: number, v: string) => setWhats((w) => w.map((x, j) => (j === i ? v : x)));

  return (
    <div className="sheet-wrap open" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const ok = await onSave({ whats: sheet.rest ? ["Rest"] : [...new Set(whats)], date, pain, feel, notes: notes.trim(), vert: vert ? Number(vert) : null });
          if (!ok) setSaving(false);
        }}
      >
        <h2 className="sheet-title">{sheet.rest ? "Rest day" : "Log it"}</h2>
        {!sheet.rest && (
          <div className="field">
            <label htmlFor="f-what-0">What</label>
            {whats.map((w, i) => (
              <div className="row" key={i} style={{ flexWrap: "nowrap" }}>
                <select id={`f-what-${i}`} value={w} onChange={(e) => setAt(i, e.target.value)} style={{ flex: 1 }}>
                  {opts(w).map((o) => <option key={o}>{o}</option>)}
                </select>
                {i > 0 && <button type="button" onClick={() => setWhats((x) => x.filter((_, j) => j !== i))}>Remove</button>}
              </div>
            ))}
            <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setWhats((x) => [...x, "EZ1 Upper Core"])}>+ Add another workout</button>
          </div>
        )}
        <div className="field"><label htmlFor="f-date">Date</label><input type="date" id="f-date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        {hasTour && !sheet.rest && (
          <div className="field"><label htmlFor="f-vert">Vert (ft)</label><input type="number" id="f-vert" inputMode="numeric" min={0} step={50} placeholder="e.g. 1200" value={vert} onChange={(e) => setVert(e.target.value)} /></div>
        )}
        <div className="field">
          <span className="lbl" id="pain-lbl">Hip pain during (0-10)</span>
          <div className="pills" id="f-pain" role="group" aria-labelledby="pain-lbl">
            {Array.from({ length: 11 }, (_, i) => <button type="button" key={i} aria-pressed={pain === i} onClick={() => setPain(i)}>{i}</button>)}
          </div>
          <span className="hint">{PAIN_SCALE}</span>
        </div>
        <div className="field">
          <span className="lbl" id="feel-lbl">How you felt</span>
          <div className="pills" role="group" aria-labelledby="feel-lbl">
            {FEELS.map((f) => <button type="button" key={f} aria-pressed={feel === f} onClick={() => setFeel(f)}>{f}</button>)}
          </div>
        </div>
        <div className="field"><label htmlFor="f-notes">Notes (optional)</label><textarea id="f-notes" maxLength={500} placeholder="Pain onset, ankle weight, anything odd" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="row">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={saving}>Save</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- coach chat ---------- */
type Msg = { role: "user" | "assistant" | "act"; content: string; proposal?: Proposal };

function Chat({ data, onDone, onSaveProposal }: { data: AppData; onDone: () => void; onSaveProposal: (p: Proposal) => Promise<boolean> }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: 'Tell me what you did or how the hip feels, and I\'ll log it. Try: "did SKI1, pain 2, felt good" or "what should I do today?"' }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    setBusy(true);
    const convo = [...msgs.filter((m) => m.role !== "act" && !m.proposal), { role: "user" as const, content: t }];
    setMsgs((m) => [...m, { role: "user", content: t }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: convo.slice(1).map(({ role, content }) => ({ role, content })) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "failed");
      setMsgs((m) => [
        ...m,
        ...(j.actions as string[]).map((a) => ({ role: "act" as const, content: a })),
        { role: "assistant", content: j.text },
        ...(j.proposals as Proposal[]).map((p) => ({ role: "assistant" as const, content: "", proposal: p })),
      ]);
      if ((j.actions as string[]).length) onDone();
    } catch (err) {
      setMsgs((m) => [...m, { role: "assistant", content: err instanceof Error && err.message !== "failed" ? err.message : "Couldn't reach Claude. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card o4">
      <h2>Ask the Cairn coach</h2>
      <div className="chat-log" aria-live="polite">
        {msgs.map((m, i) => m.proposal
          ? <ProposalCard key={i} proposal={m.proposal} data={data} onSave={onSaveProposal} />
          : <div key={i} className={`msg ${m.role === "user" ? "me" : m.role === "act" ? "act" : "ai"}`}>{m.content}</div>)}
        {busy && <div className="msg ai">Thinking…</div>}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" placeholder="Did SKI1, pain 3…" aria-label="Message the coach" />
        <button type="submit" disabled={busy}>Send</button>
      </form>
    </section>
  );
}
