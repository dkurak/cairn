"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { setTravel } from "@/lib/actions";

const ICONS: Record<string, React.ReactNode> = {
  today: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>,
  coach: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>,
  body: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>,
  plan: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>,
  library: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h5v16H5zM10 4h5v16h-5zM16 6l4 1-3 13-4-1z" /></svg>,
};
const TABS = [
  { href: "/", key: "today", label: "Today" },
  { href: "#coach", key: "coach", label: "Coach" },
  { href: "/body", key: "body", label: "Body" },
  { href: "/plan", key: "plan", label: "Plan" },
  { href: "/library", key: "library", label: "Library" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data, sb, run, openTravel, status, coachOpen, setCoachOpen } = useApp();
  const { state } = data;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className={`shell-body${coachOpen ? " coach-open" : ""}`}>
      <header className="topbar">
        <span className="brand">Cairn</span>
        <div className="right">
          <div className="seg" role="group" aria-label="Where are you training?">
            <button aria-pressed={!state.travel} onClick={() => state.travel && run(() => setTravel(sb, state, false))}>At home</button>
            <button aria-pressed={state.travel} onClick={() => !state.travel && openTravel()}>Traveling</button>
          </div>
          <button className="link" onClick={async () => { await sb.auth.signOut(); location.href = "/login"; }}>Sign out</button>
        </div>
      </header>
      {status && <div className="status" role="status" style={{ padding: "8px 16px" }}>{status}</div>}
      {children}
      <nav className="nav" aria-label="Main">
        {TABS.map((t) => t.key === "coach" ? (
          <button key={t.key} className="navbtn" aria-expanded={coachOpen} onClick={() => setCoachOpen(!coachOpen)}>
            {ICONS[t.key]}
            <span>Coach</span>
          </button>
        ) : (
          <Link key={t.key} href={t.href} aria-current={active(t.href) ? "page" : undefined}>
            {ICONS[t.key]}
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
