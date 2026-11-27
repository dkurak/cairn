"use client";
import { useState } from "react";
import type { TravelInfo } from "@/lib/types";

export default function TravelSheet({ onClose, onStart }: { onClose: () => void; onStart: (info: TravelInfo) => Promise<void> }) {
  const [gear, setGear] = useState<"gym" | "bodyweight">("bodyweight");
  const [jog, setJog] = useState(false);
  const [returns, setReturns] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="sheet-wrap open" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onStart({ gear, jog, ...(returns ? { returns } : {}) });
        }}
      >
        <h2 className="sheet-title">Traveling</h2>
        <div className="field">
          <span className="lbl" id="gear-lbl">What do you have access to?</span>
          <div className="pills" role="group" aria-labelledby="gear-lbl">
            <button type="button" aria-pressed={gear === "gym"} onClick={() => setGear("gym")}>Hotel gym</button>
            <button type="button" aria-pressed={gear === "bodyweight"} onClick={() => setGear("bodyweight")}>Bodyweight only</button>
          </div>
        </div>
        <div className="field">
          <span className="lbl" id="jog-lbl">Want to fit in some jogging?</span>
          <div className="pills" role="group" aria-labelledby="jog-lbl">
            <button type="button" aria-pressed={jog} onClick={() => setJog(true)}>Yes</button>
            <button type="button" aria-pressed={!jog} onClick={() => setJog(false)}>No</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-returns">Back home on (optional)</label>
          <input type="date" id="t-returns" value={returns} onChange={(e) => setReturns(e.target.value)} />
          <span className="hint">The coach uses this to size the plan and I&apos;ll remind you to switch back.</span>
        </div>
        <div className="row">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>Start travel mode</button>
        </div>
      </form>
    </div>
  );
}
