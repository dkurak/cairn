import type { AppData, LogEntry, PainArea, PainCheck, Workout } from "./types";
import { addDays } from "./rules";

export type RangeKey = "4w" | "12w" | "26w" | "all";
export const RANGES: { key: RangeKey; label: string; weeks: number }[] = [
  { key: "4w", label: "4 weeks", weeks: 4 },
  { key: "12w", label: "12 weeks", weeks: 12 },
  { key: "26w", label: "6 months", weeks: 26 },
  { key: "all", label: "All", weeks: 52 },
];

const parse = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const iso = (d: Date) => { const x = new Date(d); x.setHours(12); return x.toISOString().slice(0, 10); };
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

export type Window = { start: string; end: string; weeks: number };
export function windowFor(range: RangeKey, today: string, log: LogEntry[]): Window {
  const wk = RANGES.find((r) => r.key === range)!.weeks;
  let weeks = wk;
  if (range === "all") {
    const first = log.filter(isSession).map((e) => e.date).sort()[0];
    if (first) weeks = Math.min(52, Math.max(4, Math.ceil((+parse(today) - +parse(weekStart(first))) / (7 * 86400000)) + 1));
    else weeks = 4;
  }
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  return { start, end: today, weeks };
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
  const win = windowFor(range, today, log);
  const inWin = (e: LogEntry) => e.date >= win.start && e.date <= win.end;
  const sessions = log.filter((e) => isSession(e) && inWin(e));

  // previous period of the same length (for deltas); only meaningful if we have data that far back
  const prevStart = addDays(win.start, -7 * win.weeks);
  const prevAll = log.filter((e) => isSession(e) && e.date >= prevStart && e.date < win.start);
  const earliest = log.map((e) => e.date).sort()[0];
  const prevSessions = range !== "all" && earliest && earliest <= prevStart ? prevAll : null;

  const weekly: WeekBucket[] = Array.from({ length: win.weeks }, (_, i) => ({ start: addDays(win.start, 7 * i), count: 0, names: [] }));
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
