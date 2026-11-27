"use client";
import { useState } from "react";
import type { Feel, LogEntry, PainArea, PainCheck, Workout } from "@/lib/types";
import { FEELS } from "@/lib/types";
import { addDays, painClass, sortedLog } from "@/lib/rules";
import FeelPill, { VertPill } from "./FeelPill";

const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (iso: string) => parse(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dow = (iso: string) => parse(iso).toLocaleDateString(undefined, { weekday: "short" });
const Chip = ({ p, label }: { p: number | null; label?: string }) =>
  p == null ? null : <span className={`chip ${painClass(p)}`}>{label ? `${label} ` : ""}{p}/10</span>;

export type EntryPatch = Partial<Pick<LogEntry, "what" | "kind" | "workout_id" | "date" | "feel" | "pain_during" | "pain_next_am" | "vert_ft" | "notes">>;
const EXTRA = ["Tour", "Rest", "Run", "Bike", "Hike", "Other"];

type Props = {
  log: LogEntry[];
  /** how many days to show (days with no entries count as rest days) */
  limit?: number;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onSave: (id: string, patch: EntryPatch) => void;
  onDelete: (id: string) => void;
  workouts: Workout[];
  /** optional: show that day's pain check-ins on rest days, and offer to log something */
  areas?: PainArea[];
  checks?: PainCheck[];
  onLogDay?: (date: string) => void;
};

type Draft = { what: string; date: string; feel: Feel | null; pain: number | null; am: number | null; vert: string; notes: string };

/** One row per day. Several entries on the same day are tied together; gaps between logged days show as a default Rest day.
 *  Tap an entry to edit everything about it (and delete it from there). */
export default function RecentList({ log, limit = 7, editingId, setEditingId, onSave, onDelete, workouts, areas, checks, onLogDay }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const entries = sortedLog(log);
  if (!entries.length) return <p className="empty">Nothing logged yet. Your first Done will show up here.</p>;

  const byDate = new Map<string, LogEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const newest = entries[0].date, oldest = entries[entries.length - 1].date;
  const days: { date: string; items: LogEntry[] }[] = [];
  for (let d = newest; d >= oldest && days.length < limit; d = addDays(d, -1)) days.push({ date: d, items: byDate.get(d) ?? [] });

  const restChips = (date: string) =>
    (checks ?? []).filter((c) => c.date === date).map((c) => ({ id: c.id, name: areas?.find((a) => a.id === c.area_id)?.name ?? "Pain", p: c.pain }));

  const open = (e: LogEntry) => {
    if (e.id === editingId) { setEditingId(null); return; }
    setEditingId(e.id); setConfirmDel(false);
    setDraft({ what: e.what, date: e.date, feel: e.feel, pain: e.pain_during, am: e.pain_next_am, vert: e.vert_ft ? String(e.vert_ft) : "", notes: e.notes ?? "" });
  };
  const save = (e: LogEntry) => {
    if (!draft) return;
    const kind = draft.what === "Tour" ? "tour" : draft.what === "Rest" ? "rest" : "workout";
    onSave(e.id, {
      what: draft.what, kind, workout_id: kind === "workout" ? workouts.find((w) => w.name === draft.what)?.id ?? null : null,
      date: draft.date || e.date, feel: draft.feel, pain_during: draft.pain, pain_next_am: kind === "tour" ? draft.am : e.pain_next_am,
      vert_ft: kind === "tour" && draft.vert ? Number(draft.vert) : null, notes: draft.notes.trim().slice(0, 500),
    });
  };
  const names = (cur: string) => { const all = [...new Set([...workouts.map((w) => w.name), ...EXTRA])]; return all.includes(cur) ? all : [cur, ...all]; };
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <ul className="log">
      {days.map(({ date, items }) => (
        <li key={date} className="day">
          <span className="date">{fmtDate(date)}<br /><span style={{ fontSize: ".75rem" }}>{dow(date)}</span></span>
          <div className={`items${items.length > 1 ? " multi" : ""}`}>
            {items.length > 1 && <span className="grouplabel">{items.length} sessions</span>}
            {items.length === 0 && (
              <div className="item rest">
                <span>
                  <strong style={{ color: "var(--muted)", fontWeight: 600 }}>Rest day</strong>
                  {restChips(date).map((c) => <span key={c.id} className="meta"> · {c.name} <Chip p={c.p} /></span>)}
                </span>
                {onLogDay && <button className="del" onClick={() => onLogDay(date)}>Log something</button>}
              </div>
            )}
            {items.map((e) => (
              <div className={`item kind-${e.kind}`} key={e.id}>
                <button className="entry" aria-expanded={e.id === editingId} onClick={() => open(e)}>
                  <span className="entry-head"><strong>{e.what}</strong><VertPill ft={e.vert_ft} /></span>
                  <span className="meta feelrow">
                    <FeelPill feel={e.feel} />
                    {e.notes ? <span>{e.notes}</span> : !e.feel && e.id !== editingId ? <span>Tap to edit</span> : null}
                  </span>
                </button>
                <span className="right"><Chip p={e.pain_during} /><Chip p={e.pain_next_am} label="AM" /></span>
                {e.id === editingId && draft && (
                  <div className="note-editor editor">
                    <div className="field">
                      <label htmlFor="ed-what">What</label>
                      <select id="ed-what" value={draft.what} onChange={(ev) => set({ what: ev.target.value })}>{names(draft.what).map((n) => <option key={n}>{n}</option>)}</select>
                    </div>
                    <div className="field"><label htmlFor="ed-date">Date</label><input id="ed-date" type="date" value={draft.date} onChange={(ev) => set({ date: ev.target.value })} /></div>
                    <div className="field">
                      <span className="lbl">How you felt</span>
                      <div className="pills" role="group" aria-label="How you felt">
                        {FEELS.map((f) => <button type="button" key={f} aria-pressed={draft.feel === f} onClick={() => set({ feel: draft.feel === f ? null : f })}>{f}</button>)}
                      </div>
                    </div>
                    <div className="field">
                      <span className="lbl">Pain during (0-10)</span>
                      <div className="pills pain11" role="group" aria-label="Pain during">
                        {Array.from({ length: 11 }, (_, i) => <button type="button" key={i} aria-pressed={draft.pain === i} onClick={() => set({ pain: draft.pain === i ? null : i })}>{i}</button>)}
                      </div>
                    </div>
                    {draft.what === "Tour" && (
                      <>
                        <div className="field">
                          <span className="lbl">Next-morning pain (0-10)</span>
                          <div className="pills pain11" role="group" aria-label="Next morning pain">
                            {Array.from({ length: 11 }, (_, i) => <button type="button" key={i} aria-pressed={draft.am === i} onClick={() => set({ am: draft.am === i ? null : i })}>{i}</button>)}
                          </div>
                        </div>
                        <div className="field"><label htmlFor="ed-vert">Vert (ft)</label><input id="ed-vert" type="number" inputMode="numeric" min={0} step={50} value={draft.vert} onChange={(ev) => set({ vert: ev.target.value })} /></div>
                      </>
                    )}
                    <div className="field"><label htmlFor="note-edit">Notes</label><textarea id="note-edit" maxLength={500} value={draft.notes} onChange={(ev) => set({ notes: ev.target.value })} /></div>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => { if (confirmDel) { setConfirmDel(false); onDelete(e.id); } else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 4000); } }}
                      >{confirmDel ? "Tap again to delete" : "Delete"}</button>
                      <span className="row">
                        <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                        <button type="button" className="primary" onClick={() => save(e)}>Save</button>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
