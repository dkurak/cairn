"use client";
import { useState } from "react";
import { useApp } from "./AppProvider";
import { watchStatus, watchToDo } from "@/lib/garmin/status";
import type { Workout } from "@/lib/types";

/** Download from /api/garmin, then reload so the "Update watch" flags clear. */
export function useGarminDownload() {
  const { run, setStatus } = useApp();
  const [busy, setBusy] = useState(false);
  async function download(query: string) {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/garmin?${query}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setStatus(j?.error ?? "Couldn't build the file. Try again.");
        return;
      }
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "cairn.fit";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      await run(async () => {}); // the download recorded the version on the server
    } finally {
      setBusy(false);
    }
  }
  return { download, busy };
}

export function WatchChip({ w }: { w: Workout }) {
  const { data } = useApp();
  const s = watchStatus(w, data);
  if (s.kind === "update") return <span className="tag warn" title={`Watch has v${s.onWatch}, latest is v${s.latest}`}>Update watch</span>;
  return null;
}

/** Top of the Library: what the watch is missing, one tap to get it all. */
export function WatchCard() {
  const { data } = useApp();
  const { download, busy } = useGarminDownload();
  const [help, setHelp] = useState(false);
  const todo = watchToDo(data);
  const line = (w: Workout) => {
    const s = watchStatus(w, data);
    return s.kind === "update" ? `${w.name} - v${s.onWatch} → v${s.latest}` : `${w.name} - in your plan, not on the watch`;
  };
  return (
    <section className={`banner ${todo.length ? "warn" : "good"}`} aria-live="polite">
      <strong>{todo.length ? `Watch: ${todo.length} to update` : "Watch is up to date"}</strong>
      {todo.length > 0 && (
        <>
          <ul className="watch-list">{todo.map((w) => <li key={w.id}>{line(w)}</li>)}</ul>
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => download("todo=1")}>{busy ? "Building…" : `Download ${todo.length === 1 ? ".fit" : "all (.zip)"}`}</button>
          </div>
        </>
      )}
      <button className="linkbtn" aria-expanded={help} onClick={() => setHelp(!help)}>How to copy to the watch</button>
      {help && (
        <ol className="watch-help">
          <li>Download here on a computer (unzip if it&apos;s a .zip).</li>
          <li>Plug the watch in by USB. On a Mac, newer watches need OpenMTP or Android File Transfer to see the files.</li>
          <li>Copy the .fit files into <code>GARMIN/NewFiles</code>, then unplug. They show up under Workouts.</li>
          <li>Or from the repo: <code>npm run garmin:pull</code> writes the same files to <code>garmin/out</code>.</li>
        </ol>
      )}
    </section>
  );
}
