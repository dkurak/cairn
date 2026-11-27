"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { setTravel } from "@/lib/actions";

const ICONS: Record<string, React.ReactNode> = {
  today: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>,
  coach: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>,
  body: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>,
  plan: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>,
  history: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  library: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h5v16H5zM10 4h5v16h-5zM16 6l4 1-3 13-4-1z" /></svg>,
};
const TABS = [
  { href: "/", key: "today", label: "Today" },
  { href: "#coach", key: "coach", label: "Coach" },
  { href: "/body", key: "body", label: "Body" },
  { href: "/plan", key: "plan", label: "Plan" },
  { href: "/history", key: "history", label: "History" },
  { href: "/library", key: "library", label: "Library" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data, sb, run, openTravel, status, coachOpen, setCoachOpen } = useApp();
  const { state, profile } = data;
  const [menu, setMenu] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const initial = (profile.display_name || "?").trim().charAt(0).toUpperCase();

  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const coachBtn = (cls: string, close = false) => (
    <button key="coach" className={cls} aria-expanded={coachOpen} onClick={() => { setCoachOpen(!coachOpen); if (close) setMenu(false); }}>
      {ICONS.coach}<span>Coach</span>
    </button>
  );

  return (
    <div className={`shell-body${coachOpen ? " coach-open" : ""}`}>
      <header className="topbar">
        <div className="brandrow">
          <button className="hamburger" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <span className="brand">Cairn</span>
        </div>
        <div className="right">
          <div className="seg" role="group" aria-label="Where are you training?">
            <button aria-pressed={!state.travel} onClick={() => state.travel && run(() => setTravel(sb, state, false))}>At home</button>
            <button aria-pressed={state.travel} onClick={() => !state.travel && openTravel()}>Traveling</button>
          </div>
          <Link href="/account" className="avatar" aria-label="Account" title={profile.display_name}>{initial}</Link>
        </div>
      </header>
      {status && <div className="status" role="status" style={{ padding: "8px 16px" }}>{status}</div>}
      {children}

      {/* phone: bottom tabs */}
      <nav className="nav six" aria-label="Main">
        {TABS.map((t) => t.key === "coach" ? coachBtn("navbtn") : (
          <Link key={t.key} href={t.href} aria-current={active(t.href) ? "page" : undefined}>
            {ICONS[t.key]}<span>{t.label}</span>
          </Link>
        ))}
      </nav>

      {/* laptop: slide-out menu */}
      <div className={`scrim${menu ? " open" : ""}`} onClick={() => setMenu(false)} aria-hidden="true" />
      <aside className={`navdrawer${menu ? " open" : ""}`} aria-label="Menu" aria-hidden={!menu} inert={!menu}>
        <div className="drawer-head">
          <span className="brand">Cairn</span>
          <button className="link" onClick={() => setMenu(false)} aria-label="Close menu">Close</button>
        </div>
        <nav className="dnav" aria-label="Main menu">
          {TABS.map((t) => t.key === "coach" ? coachBtn("dnavbtn", true) : (
            <Link key={t.key} href={t.href} aria-current={active(t.href) ? "page" : undefined}>
              {ICONS[t.key]}<span>{t.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}
