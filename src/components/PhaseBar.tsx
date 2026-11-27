import type { ProgramPhase } from "@/lib/types";

/** Phases as a strip, widths by weeks; the current one highlighted. */
export default function PhaseBar({ phases, current = -1, week }: { phases: ProgramPhase[]; current?: number; week?: number }) {
  if (!phases.length) return null;
  const total = phases.reduce((a, p) => a + (p.weeks || 1), 0);
  let before = 0;
  return (
    <div className="phasebar" role="list" aria-label="Program phases">
      {phases.map((p, i) => {
        const start = before + 1;
        before += p.weeks || 1;
        const here = i === current;
        return (
          <div key={i} role="listitem" className={`phase ${here ? "here" : i < current ? "past" : ""}`} style={{ flexGrow: p.weeks || 1 }} title={`${p.name}: ${p.focus}`}>
            <span className="pn">{p.name}</span>
            <span className="pw">{here && week ? `wk ${week}` : p.weeks > 1 ? `wk ${start}-${before}` : `wk ${start}`}</span>
          </div>
        );
      })}
      <span className="sr-only">{total} weeks</span>
    </div>
  );
}
