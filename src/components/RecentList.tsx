"use client";
import { useState } from "react";
import type { Feel, LogEntry, PainArea, PainCheck, Workout } from "@/lib/types";
import { addDays, sortedLog } from "@/lib/rules";
import FeelPill, { VertPill } from "./FeelPill";
import { ConfirmButton, FeelPicker, PainChip as Chip, PainPicker } from "./ui";
import { shortDate as fmtDate, weekday as dow } from "@/lib/format";


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
    setEditingId(e.id);
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
          <span className="date">{fmtDate(date)}<br /><span className="dow">{dow(date)}</span></span>
          <div className={`items${items.length > 1 ? " multi" : ""}`}>
            {items.length > 1 && <span className="grouplabel">{items.length} sessions</span>}
            {items.length === 0 && (
              <div className="item rest">
                <span>
                  <strong className="restday">Rest day</strong>
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
                      <FeelPicker value={draft.feel} onChange={(f) => set({ feel: f })} />
                    </div>
                    <div className="field">
                      <span className="lbl">Pain during (0-10)</span>
                      <PainPicker value={draft.pain} onChange={(v) => set({ pain: v })} label="Pain during" />
                    </div>
                    {draft.what === "Tour" && (
                      <>
                        <div className="field">
                          <span className="lbl">Next-morning pain (0-10)</span>
                          <PainPicker value={draft.am} onChange={(v) => set({ am: v })} label="Next morning pain" />
                        </div>
                        <div className="field"><label htmlFor="ed-vert">Vert (ft)</label><input id="ed-vert" type="number" inputMode="numeric" min={0} step={50} value={draft.vert} onChange={(ev) => set({ vert: ev.target.value })} /></div>
                      </>
                    )}
                    <div className="field"><label htmlFor="note-edit">Notes</label><textarea id="note-edit" maxLength={500} value={draft.notes} onChange={(ev) => set({ notes: ev.target.value })} /></div>
                    <div className="row between">
                      <ConfirmButton className="danger" confirmLabel="Tap again to delete" onConfirm={() => onDelete(e.id)}>Delete</ConfirmButton>
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
