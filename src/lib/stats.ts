import type { AppData, LogEntry, PainArea, PainCheck, Workout } from "./types";
import { addDays } from "./rules";
import { parseISO as parse, toISO as iso } from "./format";

export type RangeKey = "4w" | "13w" | "52w" | "max";
export const RANGES: { key: RangeKey; label: string; weeks: number }[] = [
  { key: "4w", label: "4 weeks", weeks: 4 },
  { key: "13w", label: "Quarter", weeks: 13 },
  { key: "52w", label: "Year", weeks: 52 },
  { key: "max", label: "Max", weeks: 0 }, // everything since the first tracked day
];

/** Monday of the week containing the date */
export const weekStart = (isoDate: string) => {
  const d = parse(isoDate);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return iso(d);
};

const isSession = (e: LogEntry) => e.kind === "workout" || e.kind === "tour";

const CATEGORY_LABEL: Record<string, string> = {
  SKI: "Ski prep", CC: "Circuits", EZ: "Easy days", STR: "Strength", TRV: "Travel", SURF: "Surf prep",
  TOUR: "Tours", CARDIO: "Run / bike / hike", OTHER: "Other", CUSTOM: "Custom",
};
export function categoryOf(e: LogEntry, workouts: Workout[]): string {
  if (e.kind === "tour") return "TOUR";
  const w = e.workout_id ? workouts.find((x) => x.id === e.workout_id) : undefined;
  if (w) return w.category;
  if (/^(run|bike|hike)$/i.test(e.what)) return "CARDIO";
  return "OTHER";
}
export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c;

export type Window = {
  start: string;       // first day shown: never earlier than the first tracked day
  end: string;
  weeks: number;       // nominal length of the range (4 / 13 / 52)
  buckets: number;     // Monday-aligned week columns from `start` to `end`
  clamped: boolean;    // true when tracking began inside the range
  rangeStart: string;  // where the range would start if we had the data
};

/** The first day anything was tracked: a session, a pain check or a daily check-in. */
export function firstTrackedDay(data: AppData): string | null {
  const days = [...data.log.map((e) => e.date), ...data.checks.map((c) => c.date), ...data.checkins.map((c) => c.date)];
  return days.length ? days.reduce((m, d) => (d < m ? d : m)) : null;
}

export function windowFor(range: RangeKey, today: string, first: string | null): Window {
  if (range === "max") {
    const start = first ?? today;
    const buckets = Math.round((+parse(weekStart(today)) - +parse(weekStart(start))) / (7 * 86400000)) + 1;
    return { start, end: today, weeks: Math.max(1, Math.ceil((+parse(today) - +parse(start)) / (7 * 86400000))), buckets, clamped: false, rangeStart: start };
  }
  const weeks = RANGES.find((r) => r.key === range)!.weeks;
  const rangeStart = addDays(today, -(weeks * 7 - 1));
  const clamped = !!first && first > rangeStart;
  const start = clamped ? (first as string) : rangeStart;
  const buckets = Math.round((+parse(weekStart(today)) - +parse(weekStart(start))) / (7 * 86400000)) + 1;
  return { start, end: today, weeks, buckets, clamped, rangeStart };
}

export type WeekBucket = { start: string; count: number; names: string[] };
export type Stats = {
  win: Window;
  sessions: LogEntry[];
  prevSessions: LogEntry[] | null;
  weekly: WeekBucket[];
  activeDays: number;
  totalDays: number;
  greenPct: number | null;
  greenN: number;
  paintedN: number;
  avgPain: number | null;
  streak: number;
  vert: number;
  tours: LogEntry[];
  mix: { cat: string; label: string; count: number }[];
  perDay: Map<string, string[]>;
  painSessions: { date: string; p: number }[];
};

export function computeStats(data: AppData, range: RangeKey, today: string): Stats {
  const { log, workouts } = data;
  const first = firstTrackedDay(data);
  const win = windowFor(range, today, first);
  const inWin = (e: LogEntry) => e.date >= win.start && e.date <= win.end;
  const sessions = log.filter((e) => isSession(e) && inWin(e));

  // previous period of the same length (for deltas): only when tracking started before it began
  const prevStart = addDays(win.rangeStart, -7 * win.weeks);
  const prevSessions = first && first <= prevStart
    ? log.filter((e) => isSession(e) && e.date >= prevStart && e.date < win.rangeStart)
    : null;

  const weekly: WeekBucket[] = Array.from({ length: win.buckets }, (_, i) => ({ start: addDays(weekStart(win.start), 7 * i), count: 0, names: [] }));
  const perDay = new Map<string, string[]>();
  for (const e of sessions) {
    const b = weekly.find((w) => w.start === weekStart(e.date));
    if (b) { b.count++; b.names.push(e.what); }
    perDay.set(e.date, [...(perDay.get(e.date) ?? []), e.what]);
  }

  const painted = sessions.filter((e) => e.pain_during != null);
  const green = painted.filter((e) => (e.pain_during as number) <= 3);
  const avgPain = painted.length ? painted.reduce((s, e) => s + (e.pain_during as number), 0) / painted.length : null;

  // weekly streak: consecutive weeks (ending this week, or last week if this one is still empty) with >= 1 session
  const hasWeek = new Set(log.filter(isSession).map((e) => weekStart(e.date)));
  let cursor = weekStart(today);
  if (!hasWeek.has(cursor)) cursor = addDays(cursor, -7);
  let streak = 0;
  while (hasWeek.has(cursor)) { streak++; cursor = addDays(cursor, -7); }

  const tours = sessions.filter((e) => e.kind === "tour").sort((a, b) => (a.date < b.date ? 1 : -1));
  const counts = new Map<string, number>();
  for (const e of sessions) counts.set(categoryOf(e, workouts), (counts.get(categoryOf(e, workouts)) ?? 0) + 1);
  const mix = [...counts.entries()].map(([cat, count]) => ({ cat, label: categoryLabel(cat), count })).sort((a, b) => b.count - a.count);

  return {
    win, sessions, prevSessions, weekly,
    activeDays: new Set(sessions.map((e) => e.date)).size,
    totalDays: Math.round((+parse(win.end) - +parse(win.start)) / 86400000) + 1,
    greenPct: painted.length ? Math.round((green.length / painted.length) * 100) : null,
    greenN: green.length, paintedN: painted.length, avgPain, streak,
    vert: tours.reduce((s, e) => s + (e.vert_ft ?? 0), 0), tours, mix, perDay,
    painSessions: painted.map((e) => ({ date: e.date, p: e.pain_during as number })),
  };
}

export function areaSeries(area: PainArea, checks: PainCheck[], win: Window) {
  const pts = checks.filter((c) => c.area_id === area.id && c.date >= win.start && c.date <= win.end).sort((a, b) => (a.date < b.date ? -1 : 1));
  return pts;
}
