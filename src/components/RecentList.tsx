"use client";
import { useState } from "react";
import type { LogEntry } from "@/lib/types";
import { painClass, sortedLog } from "@/lib/rules";

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const Chip = ({ p, label }: { p: number | null; label?: string }) =>
  p == null ? null : <span className={`chip ${painClass(p)}`}>{label ? `${label} ` : ""}{p}/10</span>;

export default function RecentList({ log, limit = 20, editingId, setEditingId, onSaveNotes, onDelete }: {
  log: LogEntry[]; limit?: number; editingId: string | null; setEditingId: (id: string | null) => void;
  onSaveNotes: (id: string, notes: string) => void; onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const list = sortedLog(log).slice(0, limit);
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

