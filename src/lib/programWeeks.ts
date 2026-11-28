// Program weeks: which plan a week has (draft, live, or just the current plan), how a week is going, and when to
// suggest planning ahead or re-planning. Pure rules only; the writes are in actions.ts.
import type { AppData, LogEntry, PlanItem, Program, ProgramWeek, Workout } from "./types";
import { addDays, activePlan } from "./rules";
import { daysBetween, shortDate } from "./format";
import { programPosition, weekRange } from "./programs";

// ---------- which plan does a week have? ----------
export type WeekSource = "draft" | "live" | "current" | "none";
export type WeekPlan = { week: number; items: PlanItem[]; source: WeekSource; revision: number; note: string; row?: ProgramWeek };

export const storedWeek = (data: Pick<AppData, "programWeeks">, programId: string, week: number) =>
  data.programWeeks.find((w) => w.program_id === programId && w.week === week);

/** The stored copy of a week if there is one; this week with no stored copy is the plan you're following now. */
export function weekPlan(data: Pick<AppData, "programWeeks" | "plans" | "state" | "programs">, p: Program, week: number, today: string): WeekPlan {
  const row = storedWeek(data, p.id, week);
  if (row) return { week, items: row.items ?? [], source: (row.status ?? "live") === "draft" ? "draft" : "live", revision: row.revision ?? 1, note: row.note ?? "", row };
  if (p.status === "active" && week === programPosition(p, today).week) {
    const live = activePlan(data);
    if (live?.items.length) return { week, items: live.items, source: "current", revision: 0, note: "" };
  }
  return { week, items: [], source: "none", revision: 0, note: "" };
}

// ---------- what counts, and what got done ----------
const KEYWORDS = ["run", "jog", "bike", "hike", "swim", "walk", "ski"] as const;
/** "Easy run 20-30 min" has no library workout, but a logged "Run" is clearly it. */
const keywordOf = (title: string) => KEYWORDS.find((k) => title.toLowerCase().includes(k));
/** A planned day we can tell was done or not: a workout, a tour, or a named activity. (Rest and vague days don't count.) */
export const countable = (it: PlanItem) => it.kind !== "rest" && (it.kind === "tour" || it.workout_ids.length > 0 || !!keywordOf(it.title));

/** Match logged entries to planned days. Each logged session counts for at most one planned day. */
export function matchWeek(items: PlanItem[], entries: LogEntry[], workouts: Pick<Workout, "id" | "name">[]) {
  const used = new Set<string>();
  const keys = new Set<string>();
  const nameOf = (id: string) => workouts.find((w) => w.id === id)?.name;
  const isMatch = (it: PlanItem, e: LogEntry) => {
    if (it.kind === "tour") return e.kind === "tour";
    if (it.workout_ids.length) return it.workout_ids.includes(e.workout_id ?? "") || it.workout_ids.some((id) => nameOf(id) === e.what);
    const k = keywordOf(it.title);
    return !!k && e.kind === "workout" && !e.workout_id && e.what.toLowerCase().includes(k);
  };
  for (const it of items) {
    if (!countable(it)) continue;
    const hit = entries.find((e) => !used.has(e.id) && isMatch(it, e));
    if (hit) { used.add(hit.id); keys.add(it.key); }
  }
  return { keys, used };
}

// ---------- how a week is going ----------
export type WeekState = "upcoming" | "on_track" | "ahead" | "behind" | "done" | "partly" | "missed";
export type Tone = "good" | "warn" | "bad";
export type WeekStatus = { state: WeekState; label: string; tone?: Tone; planned: number; logged: number; expected: number; painFlag: boolean };

const LABEL: Record<WeekState, { label: string; tone?: Tone }> = {
  upcoming: { label: "Upcoming" }, on_track: { label: "On track", tone: "good" }, ahead: { label: "Ahead", tone: "good" },
  behind: { label: "Behind", tone: "warn" }, done: { label: "Done", tone: "good" }, partly: { label: "Partly done", tone: "warn" }, missed: { label: "Missed", tone: "bad" },
};
const isSession = (e: LogEntry) => e.kind === "workout" || e.kind === "tour";

/**
 * Rules (also in docs/SITE.md):
 * - a finished week: 80%+ of its countable planned days logged = Done, 50%+ = Partly done, less = Missed
 * - this week: compare with how many days should be done by now (planned x days elapsed / 7):
 *   more than one behind = Behind, more than one ahead = Ahead, otherwise On track
 * - pain over 3 during any session that week raises a separate flag
 * Returns null when the week has no plan or the program has no start date.
 */
export function weekStatus(a: { program: Program; week: number; items: PlanItem[]; log: LogEntry[]; workouts: Pick<Workout, "id" | "name">[]; today: string }): WeekStatus | null {
  const range = weekRange(a.program, a.week);
  if (!range || !a.items.length) return null;
  const items = a.items.filter(countable);
  const planned = items.length;
  if (a.today < range.start) return { state: "upcoming", ...LABEL.upcoming, planned, logged: 0, expected: 0, painFlag: false };
  const end = range.end < a.today ? range.end : a.today;
  const entries = a.log.filter((e) => e.date >= range.start && e.date <= end);
  const logged = matchWeek(items, entries, a.workouts).keys.size;
  const painFlag = entries.some((e) => isSession(e) && (e.pain_during ?? 0) > 3);
  let state: WeekState;
  let expected = planned;
  if (a.today > range.end) {
    const ratio = planned ? logged / planned : 1;
    state = ratio >= 0.8 ? "done" : ratio >= 0.5 ? "partly" : "missed";
  } else {
    const elapsed = Math.min(7, daysBetween(range.start, a.today) + 1);
    expected = Math.round((planned * elapsed) / 7);
    state = planned === 0 ? "on_track" : logged > expected + 1 ? "ahead" : logged < expected - 1 ? "behind" : "on_track";
  }
  return { state, ...LABEL[state], planned, logged, expected, painFlag };
}

// ---------- how the whole program is going ----------
export type ProgramHealth = { state: "on_track" | "behind" | "attention" | "unknown"; label: string; tone?: Tone; reasons: string[]; since: string | null };

/** The program so far: weeks that finished, this week, and pain since it started. `since` is the date of the latest thing worth re-planning for. */
export function programHealth(data: AppData, p: Program, today: string): ProgramHealth {
  const pos = programPosition(p, today);
  if (!p.start_date) return { state: "unknown", label: "Not started", reasons: [], since: null };
  const reasons: string[] = [];
  let since: string | null = null;
  const bump = (d: string) => { if (!since || d > since) since = d; };
  let state: ProgramHealth["state"] = "unknown";
  let seen = 0;

  // finished weeks: only the last two matter
  for (const w of [pos.week - 2, pos.week - 1]) {
    if (w < 1) continue;
    const wp = weekPlan(data, p, w, today);
    const st = weekStatus({ program: p, week: w, items: wp.items, log: data.log, workouts: data.workouts, today });
    if (!st) continue;
    seen++;
    if (st.state === "missed" || st.state === "partly") {
      reasons.push(`Week ${w}: ${st.logged} of ${st.planned} planned sessions logged`);
      bump(weekRange(p, w)!.end);
      state = st.state === "missed" ? "attention" : state === "attention" ? "attention" : "behind";
    }
  }
  // this week
  const cur = weekPlan(data, p, pos.week, today);
  const cs = weekStatus({ program: p, week: pos.week, items: cur.items, log: data.log, workouts: data.workouts, today });
  if (cs) {
    seen++;
    if (cs.state === "behind") {
      reasons.push(`This week: ${cs.logged} of ${cs.expected} planned sessions done so far`);
      bump(weekRange(p, pos.week)!.start); // stable for the whole week, so a dismissal lasts the week
      if (state !== "attention") state = "behind";
    }
  }
  // pain since the program started (earlier flare-ups were known when it was planned)
  const since14 = addDays(today, -14);
  const recent = data.log.filter((e) => isSession(e) && e.date >= (p.start_date as string) && e.date >= since14);
  const hot = recent.filter((e) => (e.pain_during ?? 0) > 3).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (hot) { reasons.push(`Pain hit ${hot.pain_during}/10 during ${hot.what} on ${shortDate(hot.date, "en-US")}`); bump(hot.date); state = "attention"; }
  const tour = recent.filter((e) => e.kind === "tour" && (e.pain_next_am ?? 0) > 0).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (tour) { reasons.push(`The morning after the ${shortDate(tour.date, "en-US")} tour the hip was ${tour.pain_next_am}/10 - hold the vert`); bump(tour.date); state = "attention"; }

  if (state === "unknown" && seen > 0) state = "on_track";
  const label = state === "attention" ? "Needs attention" : state === "behind" ? "Behind" : state === "on_track" ? "On track" : "No data yet";
  return { state, label, tone: state === "attention" ? "bad" : state === "behind" ? "warn" : state === "on_track" ? "good" : undefined, reasons, since };
}

// ---------- when to suggest something ----------
export type ProgramNudge = { kind: "plan_ahead" | "replan"; key: string; title: string; reasons: string[]; weeks: number[] };

/** Weeks after this one that the program still has (open-ended programs look 8 weeks ahead). */
export function remainingWeeks(p: Program, today: string): number[] {
  const pos = programPosition(p, today);
  const last = pos.totalWeeks ?? pos.week + 8;
  return Array.from({ length: Math.max(0, last - pos.week) }, (_, i) => pos.week + 1 + i);
}

/**
 * Suggest, never do. Plan ahead when no later week has a plan yet. Re-plan when the program is behind or pain flared
 * and the drafts haven't been redone since. Quiet when the active program is over, or has no weeks left.
 */
export function programNudge(data: AppData, p: Program, today: string): ProgramNudge | null {
  if (p.status !== "active" || !data.weekPlansReady) return null;
  const pos = programPosition(p, today);
  if (pos.over) return null;
  const remaining = remainingWeeks(p, today);
  if (!remaining.length) return null;
  const rows = remaining.map((w) => storedWeek(data, p.id, w));
  const drafted = rows.filter((r): r is ProgramWeek => !!r);
  if (!drafted.length) {
    return { kind: "plan_ahead", key: `${p.id}|ahead`, title: `Weeks ${remaining[0]}-${remaining[remaining.length - 1]} aren't planned yet`, reasons: ["See the whole program up front. The coach drafts every remaining week, and you can re-plan as you go."], weeks: remaining };
  }
  const health = programHealth(data, p, today);
  if (health.state !== "behind" && health.state !== "attention") return null;
  // already re-planned since the last trigger? stay quiet
  const lastDraft = drafted.map((r) => r.updated_at.slice(0, 10)).sort().pop() as string;
  if (health.since && lastDraft >= health.since) return null;
  return { kind: "replan", key: `${p.id}|replan|${health.since ?? "now"}`, title: "Re-plan the rest of the program?", reasons: health.reasons, weeks: remaining };
}

/** One line for the coach, so it can bring this up in conversation. */
export function nudgeLine(n: ProgramNudge | null): string {
  if (!n) return "No plan-ahead or re-plan suggestion right now.";
  return n.kind === "plan_ahead"
    ? `SUGGEST PLANNING AHEAD: ${n.title}. Offer to draft them all (propose_program_weeks); don't do it until they say yes.`
    : `SUGGEST A RE-PLAN: ${n.reasons.join("; ")}. Mention it briefly and offer to re-plan the later weeks (propose_program_weeks, mode replan); don't do it until they say yes.`;
}

/** Which planned days differ from an earlier version (compared day by day), as keys of `after`. */
export function changedItemKeys(before: PlanItem[], after: PlanItem[]): Set<string> {
  const sig = (it?: PlanItem) => (it ? JSON.stringify([it.day, it.title, it.kind, it.note, it.workout_ids]) : "");
  const out = new Set<string>();
  after.forEach((it, i) => { if (sig(it) !== sig(before[i])) out.add(it.key); });
  return out;
}

// ---------- what we ask the coach (one wording, used by the banner, the program page and the week page) ----------
const span = (weeks: number[]) => (weeks.length === 1 ? `week ${weeks[0]}` : `weeks ${weeks[0]}-${weeks[weeks.length - 1]}`);
export const planAheadPrompt = (p: Program, weeks: number[]) => `Plan ahead: draft every remaining week (${span(weeks)}) of my "${p.title}" program.`;
export const replanPrompt = (p: Program, weeks: number[], reasons: string[] = []) =>
  `Re-plan the rest of my "${p.title}" program (${span(weeks)}) from what I've actually done.${reasons.length ? ` ${reasons.join(". ")}.` : ""}`;
export const redraftPrompt = (p: Program, week: number, hasDraft: boolean) => `${hasDraft ? "Redraft" : "Draft"} week ${week} of my "${p.title}" program.`;
