"use client";
// Small shared pieces, so the same thing looks and behaves the same everywhere.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FEELS, type Feel } from "@/lib/types";
import { painClass, defaultWorkoutName } from "@/lib/rules";
import { useApp } from "./AppProvider";

/** A value: pain "3/10", with an optional prefix like "AM". (Feel and vert pills live in FeelPill.tsx.) */
export const PainChip = ({ p, label }: { p: number | null; label?: string }) =>
  p == null ? null : <span className={`chip ${painClass(p)}`}>{label ? `${label} ` : ""}{p}/10</span>;

/** A label: a category, a status, "On watch". */
export const Tag = ({ children, tone, title }: { children: ReactNode; tone?: "warn"; title?: string }) =>
  <span className={`tag${tone ? ` ${tone}` : ""}`} title={title}>{children}</span>;

/** A card with the standard header: title on the left, an optional note on the right. */
export function SectionCard({ title, aside, className = "", id, onSubmit, children }: { title?: ReactNode; aside?: ReactNode; className?: string; id?: string; onSubmit?: (e: React.FormEvent) => void; children: ReactNode }) {
  const inner = (
    <>
      {title != null && <div className="top"><h2>{title}</h2>{aside != null && aside !== "" && <small>{aside}</small>}</div>}
      {children}
    </>
  );
  const cls = `card ${className}`.trim();
  return onSubmit ? <form className={cls} id={id} onSubmit={onSubmit}>{inner}</form> : <section className={cls} id={id}>{inner}</section>;
}

/** "Ask coach": opens the coach pane; with `send` the message goes straight away, otherwise it just fills the box. */
export function AskCoachButton({ text, send = false, children = "Ask coach", primary = false }: { text: string; send?: boolean; children?: ReactNode; primary?: boolean }) {
  const { askCoach } = useApp();
  return <button className={primary ? "primary" : "askbtn"} onClick={() => askCoach(text, send)}>{children}</button>;
}

/** Page title row: h1, then the page's one control (and optionally the coach button). */
export function PageHeader({ title, back, coach, children }: { title: ReactNode; back?: ReactNode; coach?: { text: string; send?: boolean; label?: string }; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="head-left">{back}<h1>{title}</h1></div>
      <div className="row nowrap">
        {children}
        {coach && <AskCoachButton text={coach.text} send={coach.send}>{coach.label ?? "Ask coach"}</AskCoachButton>}
      </div>
    </div>
  );
}

/** Two taps to confirm anything destructive. No browser pop-ups. */
export function ConfirmButton({ children, confirmLabel = "Tap again to confirm", onConfirm, className, title, ariaLabel, disabled }: {
  children: ReactNode; confirmLabel?: string; onConfirm: () => void; className?: string; title?: string; ariaLabel?: string; disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <button
      type="button" className={className} title={title} aria-label={armed ? confirmLabel : ariaLabel} disabled={disabled}
      onClick={() => {
        if (armed) { setArmed(false); if (timer.current) clearTimeout(timer.current); onConfirm(); return; }
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 4000);
      }}
    >{armed ? confirmLabel : children}</button>
  );
}

/** 0-10 in one row. Tapping the selected number clears it (unless allowClear is false). */
export function PainPicker({ value, onChange, label, allowClear = true, disabled }: { value: number | null; onChange: (v: number | null) => void; label: string; allowClear?: boolean; disabled?: boolean }) {
  return (
    <div className="pills pain11" role="group" aria-label={label}>
      {Array.from({ length: 11 }, (_, i) => (
        <button type="button" key={i} aria-pressed={value === i} disabled={disabled} onClick={() => onChange(allowClear && value === i ? null : i)}>{i}</button>
      ))}
    </div>
  );
}

/** Rough / OK / Good / Great. */
export function FeelPicker({ value, onChange, allowClear = true, label = "How you felt", wide, disabled }: { value: Feel | null; onChange: (v: Feel | null) => void; allowClear?: boolean; label?: string; wide?: boolean; disabled?: boolean }) {
  return (
    <div className={wide ? "quick" : "pills"} role="group" aria-label={label}>
      {FEELS.map((f) => <button type="button" key={f} aria-pressed={value === f} disabled={disabled} onClick={() => onChange(allowClear && value === f ? null : f)}>{f}</button>)}
    </div>
  );
}

/** The "Log something else" card (today, and anywhere you want a quick log). */
export function LogShortcuts({ date }: { date?: string }) {
  const { data, openLog } = useApp();
  return (
    <SectionCard title="Log something else">
      <div className="row">
        <button onClick={() => openLog({ whats: ["Tour"], date })}>Log a tour</button>
        <button onClick={() => openLog({ whats: [defaultWorkoutName(data)], date })}>Log a workout</button>
        <button onClick={() => openLog({ whats: ["Rest"], rest: true, date })}>Rest day</button>
      </div>
    </SectionCard>
  );
}
