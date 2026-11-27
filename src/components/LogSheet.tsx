"use client";
import { useState } from "react";
import { FEELS, PAIN_SCALE, type Feel } from "@/lib/types";
import { todayISO } from "@/lib/rules";

export type SheetSpec = { itemKey?: string; whats: string[]; rest?: boolean; date?: string };

export type SheetValues = { whats: string[]; date: string; pain: number | null; feel: Feel | null; notes: string; vert: number | null };

export default function LogSheet({ sheet, options, onClose, onSave }: {
  sheet: SheetSpec; options: string[]; onClose: () => void; onSave: (v: SheetValues) => Promise<boolean>;
}) {
  const [whats, setWhats] = useState(sheet.whats.length ? sheet.whats : ["Other"]);
  const [date, setDate] = useState(sheet.date ?? todayISO());
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

