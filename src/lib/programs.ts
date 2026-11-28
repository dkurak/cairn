// Goal programs: where you are in one (week, phase, days to go) and what to show the coach.
import type { AppData, Criterion, LogEntry, Plan, Program, ProgramPhase } from "./types";
import { addDays, checksFor, primaryArea, todayISO } from "./rules";

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
  if (p.kind === "milestone") return null; // done when it's done
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
  const total = p.kind === "event" && p.target_date ? programWeeks(p, from) : null; // a milestone's date is only a hope
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

/** Which phase a program week falls in. Ongoing programs repeat their phases; otherwise the last phase holds past the end. */
export function phaseAtWeek(p: Program, week: number, phases = effectivePhases(p)) {
  const cycle = phases.reduce((a, x) => a + x.weeks, 0);
  let w = p.kind === "ongoing" && !p.weeks && cycle ? ((week - 1) % cycle) + 1 : week; // milestones: the last phase holds until it's done
  let index = -1;
  let startWeek = week - w + 1; // absolute week the cycle started on
  for (let i = 0; i < phases.length; i++) {
    if (w <= phases[i].weeks) { index = i; break; }
    w -= phases[i].weeks;
    startWeek += phases[i].weeks;
  }
  if (index < 0 && phases.length) { index = phases.length - 1; startWeek = week - (w - 1); }
  const phase = index >= 0 ? phases[index] : null;
  return { index, phase, startWeek, endWeek: phase ? startWeek + phase.weeks - 1 : startWeek };
}

/** First and last day of a program week (null until the program has a start date). */
export function weekRange(p: Program, week: number): { start: string; end: string } | null {
  if (!p.start_date) return null;
  const start = addDays(p.start_date, 7 * (week - 1));
  return { start, end: addDays(start, 6) };
}

export function programPosition(p: Program, today = todayISO()): ProgramPosition {
  const start = p.start_date ?? today;
  const week = Math.max(1, Math.floor(days(start, today) / 7) + 1);
  const totalWeeks = programWeeks(p, start);
  const daysToTarget = p.target_date ? days(today, p.target_date) : null;
  // ongoing programs repeat their phases as a cycle; event/fixed programs run once
  const phases = effectivePhases(p, start);
  const { index: phaseIndex, phase } = phaseAtWeek(p, week, phases);
  return {
    week, totalWeeks, phase: phase?.name ?? null, phaseFocus: phase?.focus ?? null, phaseIndex, daysToTarget,
    over: p.kind === "event" && ((daysToTarget != null && daysToTarget < 0) || (totalWeeks != null && week > totalWeeks)),
  };
}

/** What actually happened in a program week (up to today): the entries, the sessions among them, average pain, tour vert. */
export function weekActivity(log: LogEntry[], range: { start: string; end: string } | null, today = todayISO()) {
  if (!range) return { entries: [] as LogEntry[], sessions: [] as LogEntry[], avgPain: null as number | null, vert: 0 };
  const end = range.end < today ? range.end : today;
  const entries = log.filter((e) => e.date >= range.start && e.date <= end).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : 1));
  const sessions = entries.filter((e) => e.kind === "workout" || e.kind === "tour");
  const painted = sessions.filter((e) => e.pain_during != null);
  return {
    entries, sessions,
    avgPain: painted.length ? painted.reduce((a, e) => a + (e.pain_during as number), 0) / painted.length : null,
    vert: sessions.reduce((a, e) => a + (e.vert_ft ?? 0), 0),
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
export function positionLabel(p: Program, pos = programPosition(p), crit?: { met: number; total: number }) {
  if (p.kind === "milestone")
    return [p.status === "active" ? `Week ${pos.week}` : null, p.status === "active" ? pos.phase : null, crit?.total ? `${crit.met} of ${crit.total} checks met` : null, p.target_date ? `aiming for ${fmtDate(p.target_date)}` : null].filter(Boolean).join(" · ");
  return [
    p.status === "active" ? `Week ${pos.week}${pos.totalWeeks ? ` of ${pos.totalWeeks}` : ""}` : null,
    p.status === "active" ? pos.phase : null,
    p.target_date ? (pos.daysToTarget! > 0 ? `${pos.daysToTarget} days to ${fmtDate(p.target_date)}` : pos.daysToTarget === 0 ? "Today's the day" : `${fmtDate(p.target_date)} has passed`) : null,
  ].filter(Boolean).join(" · ");
}

/** One line per program for the coach. */
export function programLine(p: Program, data?: CritData, today = todayISO()) {
  const pos = programPosition(p, today);
  const crit = data && p.kind === "milestone" ? evaluateCriteria(p, data, today) : null;
  const prefs = Object.entries(p.preferences ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
  return `"${p.title}" [${p.status}${p.status === "active" ? `, started ${p.start_date}, week ${pos.week}${pos.totalWeeks ? `/${pos.totalWeeks}` : ""}, phase ${pos.phase ?? "-"} (${pos.phaseFocus ?? ""})` : ""}] ${p.kind}${p.target_date ? ` on ${p.target_date}` : ""}; goal: ${p.goal}; ${p.days_per_week ?? "?"} days/wk; phases: ${effectivePhases(p).map((x) => `${x.name} ${x.weeks}w (${x.focus})`).join(" > ") || "-"}${prefs ? `; prefs: ${prefs}` : ""}${p.notes ? `; notes: ${p.notes}` : ""}${crit ? `; checks ${crit.met}/${crit.total}${crit.allMet ? " ALL MET - suggest calling it done" : ""}: ${crit.results.map((r) => `${r.label} (${r.met ? "met" : r.progress})`).join(", ")}` : ""}${p.resumes_id ? "; paused another program when it started (offer to resume it when done)" : ""}${p.status === "done" && p.outcome ? `; outcome: ${p.outcome}` : ""}`;
}


// ---------- milestone criteria ----------

export type CriterionResult = { label: string; met: boolean; progress: string };
type CritData = Pick<AppData, "log" | "areas" | "checks">;

/** Score one check against the log. Only data since the program started counts. */
export function evaluateCriterion(c: Criterion, data: CritData, since: string, today = todayISO()): CriterionResult {
  switch (c.kind) {
    case "pain_streak": {
      const area = (c.area && data.areas.find((a) => a.name.toLowerCase() === c.area!.toLowerCase())) || primaryArea(data.areas);
      if (!area) return { label: c.label, met: false, progress: "no pain area tracked" };
      const byDate = new Map(checksFor(data.checks, area.id).map((x) => [x.date, x.pain]));
      // count back from today (or yesterday, if today isn't checked yet); a missed or high day ends the streak
      let d = byDate.has(today) ? today : addDays(today, -1);
      let n = 0;
      while (d >= since && byDate.has(d) && byDate.get(d)! <= c.max) { n++; d = addDays(d, -1); }
      return { label: c.label, met: n >= c.days, progress: `${Math.min(n, c.days)} of ${c.days} days` };
    }
    case "sessions": {
      const from = addDays(today, -(c.days - 1));
      const ok = data.log.filter((e) => e.kind === "workout" && e.date >= from && e.date >= since && e.date <= today && e.pain_during != null && e.pain_during <= c.max_pain).length;
      return { label: c.label, met: ok >= c.count, progress: `${Math.min(ok, c.count)} of ${c.count}` };
    }
    case "tour": {
      const clean = data.log.find((e) => e.kind === "tour" && e.date >= since && (e.pain_during ?? 99) <= c.max_pain && e.pain_next_am === 0 && (!c.min_vert || (e.vert_ft ?? 0) >= c.min_vert));
      const pending = data.log.find((e) => e.kind === "tour" && e.date >= since && e.pain_next_am == null);
      return { label: c.label, met: !!clean, progress: clean ? `done ${clean.date.slice(5)}` : pending ? "waiting on next-morning check" : "not yet" };
    }
    default:
      return { label: c.label, met: !!c.met, progress: c.met ? "done" : "not yet" };
  }
}

export function evaluateCriteria(p: Program, data: CritData, today = todayISO()) {
  const since = p.start_date ?? today;
  const results = (p.criteria ?? []).map((c) => evaluateCriterion(c, data, since, today));
  return { results, met: results.filter((r) => r.met).length, total: results.length, allMet: results.length > 0 && results.every((r) => r.met) };
}
