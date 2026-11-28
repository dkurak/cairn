import Link from "next/link";
import type { ProgramPhase } from "@/lib/types";

/** Phases as a strip, widths by weeks; the current one highlighted. With `hrefFor`, each phase is a link into that phase's first week. */
export default function PhaseBar({ phases, current = -1, week, hrefFor }: {
  phases: ProgramPhase[]; current?: number; week?: number;
  /** where a phase links to: (first week of the phase, phase index) */
  hrefFor?: (startWeek: number, index: number) => string;
}) {
  if (!phases.length) return null;
  const total = phases.reduce((a, p) => a + (p.weeks || 1), 0);
  let before = 0;
  const items = phases.map((p, i) => {
    const start = before + 1;
    before += p.weeks || 1;
    const here = i === current;
    const cls = `phase ${here ? "here" : i < current ? "past" : ""}`;
    const body = (
      <>
        <span className="pn">{p.name}</span>
        <span className="pw">{here && week ? `wk ${week}` : p.weeks > 1 ? `wk ${start}-${before}` : `wk ${start}`}</span>
      </>
    );
    return hrefFor
      ? <Link key={i} href={hrefFor(start, i)} className={cls} style={{ flexGrow: p.weeks || 1 }} title={`${p.name}: ${p.focus}`}>{body}</Link>
      : <div key={i} role="listitem" className={cls} style={{ flexGrow: p.weeks || 1 }} title={`${p.name}: ${p.focus}`}>{body}</div>;
  });
  const sr = <span className="sr-only">{total} weeks</span>;
  return hrefFor
    ? <nav className="phasebar" aria-label="Program phases">{items}{sr}</nav>
    : <div className="phasebar" role="list" aria-label="Program phases">{items}{sr}</div>;
}
