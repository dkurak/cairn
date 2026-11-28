"use client";
import { useEffect } from "react";
import { useApp } from "./AppProvider";
import Chat from "./Chat";

// Right-hand pane: stays mounted (so the chat keeps its state) and slides in over any page.
export default function CoachDrawer() {
  const { coachOpen, setCoachOpen } = useApp();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && coachOpen) setCoachOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [coachOpen, setCoachOpen]);

  return (
    <aside className={`coach-drawer${coachOpen ? " open" : ""}`} aria-label="Cairn coach" aria-hidden={!coachOpen} inert={!coachOpen}>
      <div className="drawer-head">
        <h2>Cairn coach</h2>
        <button className="link" onClick={() => setCoachOpen(false)} aria-label="Close coach">Close</button>
      </div>
      <Chat />
    </aside>
  );
}
