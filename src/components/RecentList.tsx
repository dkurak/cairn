"use client";
import { useState } from "react";
import type { LogEntry, PainArea, PainCheck } from "@/lib/types";
import { addDays, painClass, sortedLog } from "@/lib/rules";

const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (iso: string) => parse(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dow = (iso: string) => parse(iso).toLocaleDateString(undefined, { weekday: "short" });
const Chip = ({ p, label }: { p: number | null; label?: string }) =>
  p == null ? null : <span className={`chip ${painClass(p)}`}>{label ? `${label} ` : ""}{p}/10</span>;

type Props = {
  log: LogEntry[];
  /** how many days to show (days with no entries count as rest days) */
  limit?: number;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onDelete: (id: string) => void;
  /** optional: show that day's pain check-ins on rest days, and offer to log something */
  areas?: PainArea[];
  checks?: PainCheck[];
  onLogDay?: (date: string) => void;
};

/** One row per day. Several entries on the same day are tied together; gaps between logged days show as a default Rest day. */
export default function RecentList({ log, limit = 7, editingId, setEditingId, onSaveNotes, onDelete, areas, checks, onLogDay }: Props) {
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const entries = sortedLog(log);
  if (!entries.length) return <p className="empty">Nothing logged yet. Your first Done will show up here.</p>;

  const byDate = new Map<string, LogEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const newest = entries[0].date, oldest = entries[entries.length - 1].date;
  const days: { date: string; items: LogEntry[] }[] = [];
  for (let d = newest; d >= oldest && days.length < limit; d = addDays(d, -1)) days.push({ date: d, items: byDate.get(d) ?? [] });

  const restChips = (date: string) =>
    (checks ?? []).filter((c) => c.date === date).map((c) => ({ id: c.id, name: areas?.find((a) => a.id === c.area_id)?.name ?? "Pain", p: c.pain }));

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
              <div className="item" key={e.id}>
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
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
