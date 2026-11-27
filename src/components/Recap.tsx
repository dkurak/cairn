"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "./AppProvider";
import { digest } from "@/lib/review";
import { activeProgram } from "@/lib/programs";

type RecapData = { summary: string; next: string[] };
const CACHE = "cairn.recap.v1";

/** Short AI recap of recent training + next steps. Cached per device until the data behind it changes. */
export default function Recap() {
  const { data, today } = useApp();
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inflight = useRef<string | null>(null); // one request per key at a time

  // anything that should change the recap: today, the log, hip checks, goals, the program and its week
  const lastLog = data.log.reduce((a, e) => (e.created_at > a ? e.created_at : a), "");
  const lastCheck = data.checks.reduce((a, c) => (c.date > a ? c.date : a), "");
  const prog = activeProgram(data);
  const key = [today, data.log.length, lastLog, data.checks.length, lastCheck, data.profile.goals_updated_at ?? "", prog?.id ?? "", prog?.updated_at ?? "", data.state.travel].join("|");

  const load = useCallback(async (force = false) => {
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(CACHE) ?? "null");
        if (c?.key === key && c.recap) { setRecap(c.recap); setFailed(false); return; }
      } catch {}
    }
    if (inflight.current === key) return;
    inflight.current = key;
    setLoading(true);
    try {
      const res = await fetch("/api/recap", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const r = (await res.json()) as RecapData;
      setRecap(r);
      setFailed(false);
      try { localStorage.setItem(CACHE, JSON.stringify({ key, recap: r })); } catch {}
    } catch {
      setFailed(true);
    } finally {
      inflight.current = null;
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { void load(); }, [load]);

  // no AI? still say something useful
  const d = digest(data, 5, today);
  const focus = Object.entries(d.focus).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(", ");
  const fallback = d.sessions
    ? `${d.sessions} session${d.sessions > 1 ? "s" : ""} in the last 5 days (${focus})${d.pain_during.max != null ? `, pain max ${d.pain_during.max}/10` : ""}.`
    : "Nothing logged in the last 5 days.";

  return (
    <section className="card recap" aria-live="polite">
      <div className="top">
        <h2>Recap</h2>
        <button className="link" onClick={() => void load(true)} disabled={loading} aria-label="Refresh recap">{loading ? "…" : "Refresh"}</button>
      </div>
      {recap && !loading ? (
        <>
          <p className="recap-text">{recap.summary}</p>
          {recap.next.length > 0 && (
            <>
              <div className="recap-label">Next</div>
              <ul className="recap-next">{recap.next.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
        </>
      ) : loading ? (
        <p className="status">Looking over your week…</p>
      ) : (
        <p className="recap-text">{fallback}{failed ? <span className="status"> Couldn&apos;t reach the coach for a full recap.</span> : null}</p>
      )}
      <Link href="/history" className="recap-link">View daily activity →</Link>
    </section>
  );
}
