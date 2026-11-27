// Goal programs: where you are in one (week, phase, days to go) and what to show the coach.
import type { AppData, Plan, Program, ProgramPhase } from "./types";
import { addDays, todayISO } from "./rules";

const days = (a: string, b: string) => Math.round((+new Date(b + "T12:00:00") - +new Date(a + "T12:00:00")) / 86400000);

export type ProgramPosition = {
  week: number; // 1-based, from start_date
  totalWeeks: number | null;
  phase: string | null;
  phaseFocus: string | null;
  phaseIndex: number;
  daysToTarget: number | null;
  over: boolean; // past the last week or the event day
};

/** Length in weeks: events run from the start to the date; otherwise explicit, else the phases. */
export function programWeeks(p: Program, from = p.start_date ?? todayISO()): number | null {
  if (p.target_date) return Math.max(1, Math.ceil((days(from, p.target_date) + 1) / 7));
  if (p.weeks) return p.weeks;
  const sum = p.phases.reduce((a, x) => a + (x.weeks || 0), 0);
  return sum || null;
}

/**
 * Phases as they'll actually run. An event's phases are stretched or trimmed at the front so the last
 * phase (the taper) ends on the date: started early, the first phase is longer; started late, the early
 * phases shrink (and drop off if needed).
 */
export function effectivePhases(p: Program, from = p.start_date ?? todayISO()): ProgramPhase[] {
  const phases = p.phases.map((x) => ({ ...x, weeks: Math.max(1, x.weeks || 1) }));
  const total = p.target_date ? programWeeks(p, from) : null;
  if (!total || !phases.length) return phases;
  let diff = total - phases.reduce((a, x) => a + x.weeks, 0);
  if (diff > 0) phases[0].weeks += diff;
  while (diff < 0 && phases.length > 1) {
    const cut = Math.min(-diff, phases[0].weeks);
    phases[0].weeks -= cut;
    diff += cut;
    if (phases[0].weeks === 0) phases.shift();
  }
  if (diff < 0) phases[0].weeks = Math.max(1, phases[0].weeks + diff);
  return phases;
}

export function programPosition(p: Program, today = todayISO()): ProgramPosition {
  const start = p.start_date ?? today;
  const week = Math.max(1, Math.floor(days(start, today) / 7) + 1);
  const totalWeeks = programWeeks(p, start);
  const daysToTarget = p.target_date ? days(today, p.target_date) : null;
  // ongoing programs repeat their phases as a cycle; event/fixed programs run once
  const phases = effectivePhases(p, start);
  const cycle = phases.reduce((a, x) => a + x.weeks, 0);
  let w = p.kind === "ongoing" && !p.weeks && cycle ? ((week - 1) % cycle) + 1 : week;
  let phaseIndex = -1;
  for (let i = 0; i < phases.length; i++) {
    if (w <= phases[i].weeks) { phaseIndex = i; break; }
    w -= phases[i].weeks;
  }
  if (phaseIndex < 0 && phases.length) phaseIndex = phases.length - 1;
  const phase = phaseIndex >= 0 ? phases[phaseIndex] : null;
  return {
    week, totalWeeks, phase: phase?.name ?? null, phaseFocus: phase?.focus ?? null, phaseIndex, daysToTarget,
    over: (daysToTarget != null && daysToTarget < 0) || (p.kind === "event" && totalWeeks != null && week > totalWeeks),
  };
}

export const activeProgram = (data: Pick<AppData, "programs">) => data.programs.find((p) => p.status === "active");

/** The active program has moved on to a week the current plan wasn't written for. */
export function needsNewWeek(data: Pick<AppData, "programs">, plan: Plan | undefined, today = todayISO()) {
  const p = activeProgram(data);
  if (!p) return null;
  const pos = programPosition(p, today);
  if (pos.over) return null;
  if (!plan || plan.program_id !== p.id || (plan.program_week ?? 0) < pos.week) return { program: p, pos };
  return null;
}

export const fmtDate = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Week 3 of 8 · Build · 23 days to Jan 18" */
export function positionLabel(p: Program, pos = programPosition(p)) {
  return [
    p.status === "active" ? `Week ${pos.week}${pos.totalWeeks ? ` of ${pos.totalWeeks}` : ""}` : null,
    p.status === "active" ? pos.phase : null,
    p.target_date ? (pos.daysToTarget! > 0 ? `${pos.daysToTarget} days to ${fmtDate(p.target_date)}` : pos.daysToTarget === 0 ? "Today's the day" : `${fmtDate(p.target_date)} has passed`) : null,
  ].filter(Boolean).join(" · ");
}

/** One line per program for the coach. */
export function programLine(p: Program, today = todayISO()) {
  const pos = programPosition(p, today);
  const prefs = Object.entries(p.preferences ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
  return `"${p.title}" [${p.status}${p.status === "active" ? `, started ${p.start_date}, week ${pos.week}${pos.totalWeeks ? `/${pos.totalWeeks}` : ""}, phase ${pos.phase ?? "-"} (${pos.phaseFocus ?? ""})` : ""}] ${p.kind}${p.target_date ? ` on ${p.target_date}` : ""}; goal: ${p.goal}; ${p.days_per_week ?? "?"} days/wk; phases: ${effectivePhases(p).map((x) => `${x.name} ${x.weeks}w (${x.focus})`).join(" > ") || "-"}${prefs ? `; prefs: ${prefs}` : ""}${p.notes ? `; notes: ${p.notes}` : ""}`;
}

