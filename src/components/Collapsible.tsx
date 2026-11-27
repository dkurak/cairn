"use client";
import { useEffect, useState } from "react";

// Long workout rundowns start collapsed on phones (so the check-in is within reach) and open on desktop.
export default function Collapsible({ label = "workout", children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { setOpen(window.matchMedia("(min-width: 900px)").matches); }, []);
  return (
    <>
      <button type="button" className="link showtoggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open && children}
    </>
  );
}
