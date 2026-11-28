"use client";
// The version list used by workouts and program weeks: a row per version (tap to open), with room for tags and actions.
import { useState, type ReactNode } from "react";

export type VersionRow = { key: string; title: ReactNode; note?: string; tags?: ReactNode; body: ReactNode };

export default function VersionList({ rows, emptyText = "No history yet." }: { rows: VersionRow[] | null; emptyText?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows) return <p className="status">Loading history…</p>;
  if (!rows.length) return <p className="status">{emptyText}</p>;
  return (
    <ul className="history">
      {rows.map((v) => (
        <li key={v.key}>
          <button className="rowbtn" aria-expanded={open === v.key} onClick={() => setOpen(open === v.key ? null : v.key)}>
            <span>{v.title}{v.note ? <span className="history-note"> - {v.note}</span> : null}</span>
            <span className="row nowrap">{v.tags}</span>
          </button>
          {open === v.key && <div className="history-body">{v.body}</div>}
        </li>
      ))}
    </ul>
  );
}
