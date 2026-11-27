"use client";
import { useApp } from "@/components/AppProvider";
import PainCard from "@/components/PainCard";
import { addPainArea, savePainCheck, setAreaActive } from "@/lib/actions";
import { checksFor, primaryArea } from "@/lib/rules";

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function Body() {
  const { data, sb, uid, today, run, askCoach } = useApp();
  const { areas, checks, log, checkins } = data;
  const resolved = areas.filter((a) => !a.active);
  const p = primaryArea(areas);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Body</h1>
        <button className="askbtn" onClick={() => askCoach("I want to give you an update on how my body is doing.", false)}>Update the coach</button>
      </div>
      <p className="note" style={{ margin: 0 }}>Track what hurts and how it&apos;s changing. The coach reads this when it suggests changes to your workouts.</p>

      <div className="two">
        <PainCard
          areas={areas}
          checks={checks}
          log={log}
          today={today}
          hint={null}
          onCheck={(areaId, pain) => run(() => savePainCheck(sb, uid, areaId, pain, today))}
          onAdd={(name) => run(() => addPainArea(sb, uid, name))}
          onResolve={(areaId) => run(() => setAreaActive(sb, areaId, false))}
        />
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <section className="card">
            <h2>Recent notes</h2>
            {(() => {
              const notes = log.filter((e) => e.notes).slice(0, 6);
              return notes.length ? (
                <ul className="list">
                  {notes.map((e) => <li key={e.id}><span><strong>{fmt(e.date)} · {e.what}</strong><br /><span className="meta">{e.notes}</span></span></li>)}
                </ul>
              ) : <span className="empty">Notes from your workouts show up here.</span>;
            })()}
          </section>
          <section className="card">
            <h2>How you&apos;ve felt</h2>
            {checkins.length ? (
              <div className="row">
                {[...checkins].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10).map((c) => (
                  <span key={c.date} className={`chip ${c.feel === "Rough" ? "b" : c.feel === "OK" ? "w" : "g"}`}>{fmt(c.date)} {c.feel}</span>
                ))}
              </div>
            ) : <span className="empty">Use the quick check-in on Today to build this up.</span>}
          </section>
          {resolved.length > 0 && (
            <section className="card">
              <h2>Resolved</h2>
              <ul className="list">
                {resolved.map((a) => (
                  <li key={a.id}>
                    <span>{a.name}<br /><span className="meta">last check {checksFor(checks, a.id)[0] ? `${fmt(checksFor(checks, a.id)[0].date)}: ${checksFor(checks, a.id)[0].pain}/10` : "none"}</span></span>
                    <button className="link" onClick={() => run(() => setAreaActive(sb, a.id, true))}>Track again</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {p && <span className="note">Primary area: {p.name} (drives the tour rules).</span>}
        </div>
      </div>
    </div>
  );
}
