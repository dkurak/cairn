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

// ---------- activity groups: the "versatility" view. One colour per group, always the same one. ----------
export type GroupKey = "gym" | "tour" | "resort" | "bike" | "run" | "hike" | "swim" | "other";
export const GROUPS: { key: GroupKey; label: string; color: string }[] = [
  { key: "gym", label: "Gym & strength", color: "var(--g1)" },
  { key: "tour", label: "Backcountry ski", color: "var(--g2)" },
  { key: "resort", label: "Resort ski", color: "var(--g3)" },
  { key: "bike", label: "Bike", color: "var(--g4)" },
  { key: "run", label: "Run", color: "var(--g5)" },
  { key: "hike", label: "Hike", color: "var(--g6)" },
  { key: "swim", label: "Swim", color: "var(--g7)" },
  { key: "other", label: "Other", color: "var(--muted)" },
];
export const groupInfo = (k: GroupKey) => GROUPS.find((g) => g.key === k)!;

/** Which kind of activity an entry is. Library workouts are gym; the rest is read from what was logged. */
export function groupOf(e: Pick<LogEntry, "kind" | "what" | "workout_id">, workouts: Pick<Workout, "id" | "name">[]): GroupKey {
  if (e.kind === "tour") return "tour";
  if (e.workout_id && workouts.some((w) => w.id === e.workout_id)) return "gym";
  const w = e.what.toLowerCase();
  if (workouts.some((x) => x.name.toLowerCase() === w)) return "gym";
  if (/\bski/.test(w) || /resort/.test(w)) return "resort";
  if (/bike|cycl|mtb/.test(w)) return "bike";
  if (/run|jog/.test(w)) return "run";
  if (/hike|walk/.test(w)) return "hike";
  if (/swim/.test(w)) return "swim";
  if (/strength|gym|lift|rings|yoga|mobility|core/.test(w)) return "gym";
  return "other";
}

/** One thing you did: a logged session, or a watch strength session on a day nothing was logged for it. */
export type Sess = { id: string; date: string; what: string; group: GroupKey; vert: number; miles: number; fromWatch: boolean; entry?: LogEntry };

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
  // versatility
  sess: Sess[];                                  // every session in the window, logged or from the watch
  groupRows: GroupRow[];                         // one row per activity type, most sessions first
  series: Bucket[];                              // sessions per week (or per month on long ranges), split by type
  bucket: "week" | "month";
  variety: number;                               // how many different types in the window
  top: { label: string; pct: number } | null;
  dormant: { label: string; days: number }[];    // types you do, but not in the last 4 weeks
  perDayGroups: Map<string, GroupKey[]>;
};
export type GroupRow = { key: GroupKey; label: string; color: string; count: number; pct: number; lastDate: string | null; daysAgo: number | null; vert: number; miles: number };
export type Bucket = { start: string; label: string; counts: Partial<Record<GroupKey, number>>; total: number };

const minsIn = (notes: string) => Number(/(\d+) min/.exec(notes)?.[1] ?? 0);
const milesIn = (notes: string) => Number(/([\d.]+) mi\b/.exec(notes)?.[1] ?? 0);

/** Every session, with watch-only gym sessions added for the days nothing gym-like was logged. */
export function allSessions(data: AppData): Sess[] {
  const out: Sess[] = data.log.filter(isSession).map((e) => ({ id: e.id, date: e.date, what: e.what, group: groupOf(e, data.workouts), vert: e.kind === "tour" ? e.vert_ft ?? 0 : 0, miles: milesIn(e.notes ?? ""), fromWatch: (e.notes ?? "").startsWith("Garmin"), entry: e }));
  const gymDays = new Set(out.filter((x) => x.group === "gym").map((x) => x.date));
  for (const a of data.activities ?? []) {
    if (a.name !== "Strength" || gymDays.has(a.date)) continue;
    gymDays.add(a.date); // two watch sessions on one day count once
    out.push({ id: `act-${a.id}`, date: a.date, what: "Gym session", group: "gym", vert: 0, miles: 0, fromWatch: true });
  }
  return out;
}

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
  void minsIn;
  const mix = [...counts.entries()].map(([cat, count]) => ({ cat, label: categoryLabel(cat), count })).sort((a, b) => b.count - a.count);

  // versatility: every session in the window (incl. watch gym), by type
  const everything = allSessions(data);
  const sess = everything.filter((x) => x.date >= win.start && x.date <= win.end);
  const bucket: "week" | "month" = win.weeks > 13 && win.buckets > 14 ? "month" : "week";
  const keyOf = (d: string) => (bucket === "week" ? weekStart(d) : d.slice(0, 7) + "-01");
  const series: Bucket[] = [];
  if (bucket === "week") for (let i = 0; i < win.buckets; i++) { const st = addDays(weekStart(win.start), 7 * i); series.push({ start: st, label: st, counts: {}, total: 0 }); }
  else {
    const a = parse(win.start), b = parse(win.end);
    for (let y = a.getFullYear(), m = a.getMonth(); y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth()); m++) { if (m > 11) { m = 0; y++; } const st = `${y}-${String(m + 1).padStart(2, "0")}-01`; series.push({ start: st, label: st, counts: {}, total: 0 }); if (y === b.getFullYear() && m === b.getMonth()) break; }
  }
  for (const x of sess) { const b = series.find((r) => r.start === keyOf(x.date)); if (b) { b.counts[x.group] = (b.counts[x.group] ?? 0) + 1; b.total++; } }
  const lastBy = new Map<GroupKey, string>();
  for (const x of everything) if (x.date <= today && (lastBy.get(x.group) ?? "") < x.date) lastBy.set(x.group, x.date);
  const total = sess.length;
  const groupRows: GroupRow[] = GROUPS.map((g) => {
    const mine = sess.filter((x) => x.group === g.key);
    const last = lastBy.get(g.key) ?? null;
    return { key: g.key, label: g.label, color: g.color, count: mine.length, pct: total ? Math.round((mine.length / total) * 100) : 0, lastDate: last, daysAgo: last ? Math.round((+parse(today) - +parse(last)) / 86400000) : null, vert: mine.reduce((a, x) => a + x.vert, 0), miles: mine.reduce((a, x) => a + x.miles, 0) };
  }).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const recentCut = addDays(today, -27);
  const doneRecently = new Set(everything.filter((x) => x.date >= recentCut && x.date <= today).map((x) => x.group));
  const dormant = GROUPS.filter((g) => g.key !== "other" && lastBy.has(g.key) && !doneRecently.has(g.key)).map((g) => ({ label: g.label, days: Math.round((+parse(today) - +parse(lastBy.get(g.key) as string)) / 86400000) })).sort((a, b) => a.days - b.days);
  const perDayGroups = new Map<string, GroupKey[]>();
  for (const x of sess) perDayGroups.set(x.date, [...(perDayGroups.get(x.date) ?? []), x.group]);

  return {
    sess, groupRows, series, bucket, perDayGroups, dormant,
    variety: new Set(sess.map((x) => x.group).filter((g) => g !== "other")).size,
    top: groupRows[0] ? { label: groupRows[0].label, pct: groupRows[0].pct } : null,
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
