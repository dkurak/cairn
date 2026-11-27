// What someone has been doing lately, boiled down for the coach (and anything else that wants it).
import type { AppData, LogEntry } from "./types";
import { addDays, checksFor, primaryArea, todayISO } from "./rules";
import { categoryLabel, categoryOf } from "./stats";

const isSession = (e: LogEntry) => e.kind === "workout" || e.kind === "tour";
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export type Digest = {
  days: number;
  from: string;
  /** set when tracking started inside the window: earlier days aren't counted */
  tracking_started?: string;
  to: string;
  sessions: number;
  rest_days_logged: number;
  days_with_nothing: number;
  focus: Record<string, number>; // "Strength": 2, "Ski prep": 1 ...
  sessions_list: string[]; // "Nov 25 EZ2 Light Full Body (pain 2, Good)"
  tours: { count: number; total_vert_ft: number; max_pain: number | null };
  pain_during: { avg: number | null; max: number | null; over_3: number };
  feel: Record<string, number>;
  primary_area?: { name: string; first: number | null; latest: number | null; checks: number };
  days_since_last_session: number | null;
  notes: string[];
};

/** Training over the last `days` days, ending today. */
export function digest(data: Pick<AppData, "log" | "workouts" | "areas" | "checks">, days: number, today = todayISO()): Digest {
  const asked = addDays(today, -(days - 1));
  const first = [...data.log.map((e) => e.date), ...data.checks.map((c) => c.date)].sort()[0];
  const from = first && first > asked ? first : asked; // days before tracking started are unknown, not empty
  const span = Math.round((+new Date(today + "T12:00:00") - +new Date(from + "T12:00:00")) / 86400000) + 1;
  const inRange = data.log.filter((e) => e.date >= from && e.date <= today);
  const sessions = inRange.filter(isSession).sort((a, b) => (a.date < b.date ? -1 : 1));
  const focus: Record<string, number> = {};
  for (const e of sessions) { const c = categoryLabel(categoryOf(e, data.workouts)); focus[c] = (focus[c] ?? 0) + 1; }
  const feel: Record<string, number> = {};
  for (const e of sessions) if (e.feel) feel[e.feel] = (feel[e.feel] ?? 0) + 1;
  const pains = sessions.map((e) => e.pain_during).filter((p): p is number => p != null);
  const tours = sessions.filter((e) => e.kind === "tour");
  const activeDays = new Set(inRange.map((e) => e.date));
  const primary = primaryArea(data.areas);
  const pChecks = primary ? checksFor(data.checks, primary.id).filter((c) => c.date >= from).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
  const lastSession = [...data.log].filter(isSession).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const md = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return {
    days, from, to: today, ...(from !== asked ? { tracking_started: from } : {}),
    sessions: sessions.length,
    rest_days_logged: new Set(inRange.filter((e) => e.kind === "rest").map((e) => e.date)).size,
    days_with_nothing: Math.max(0, span - activeDays.size),
    focus,
    sessions_list: sessions.map((e) => {
      const extra = [e.pain_during != null ? `pain ${e.pain_during}` : "", e.feel ?? ""].filter(Boolean).join(", ");
      return `${md(e.date)} ${e.what}${e.vert_ft ? ` ${e.vert_ft} ft` : ""}${extra ? ` (${extra})` : ""}`;
    }),
    tours: { count: tours.length, total_vert_ft: tours.reduce((a, e) => a + (e.vert_ft ?? 0), 0), max_pain: tours.length ? Math.max(...tours.map((e) => e.pain_during ?? 0)) : null },
    pain_during: { avg: avg(pains), max: pains.length ? Math.max(...pains) : null, over_3: pains.filter((p) => p > 3).length },
    feel,
    ...(primary ? { primary_area: { name: primary.name, first: pChecks[0]?.pain ?? null, latest: pChecks.at(-1)?.pain ?? null, checks: pChecks.length } } : {}),
    days_since_last_session: lastSession ? Math.round((+new Date(today + "T12:00:00") - +new Date(lastSession.date + "T12:00:00")) / 86400000) : null,
    notes: sessions.filter((e) => e.notes).slice(-6).map((e) => `${md(e.date)} ${e.what}: ${e.notes.slice(0, 120)}`),
  };
}

/** One compact line per window for the system prompt. */
export function digestLine(d: Digest) {
  const focus = Object.entries(d.focus).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  const feel = Object.entries(d.feel).map(([k, v]) => `${k} ${v}`).join(", ");
  const area = d.primary_area && d.primary_area.checks ? `; ${d.primary_area.name} checks ${d.primary_area.first} -> ${d.primary_area.latest} (${d.primary_area.checks})` : "";
  const tours = d.tours.count ? `; tours ${d.tours.count}, ${d.tours.total_vert_ft.toLocaleString()} ft, max pain ${d.tours.max_pain}` : "";
  return `Last ${d.days} days (${d.from} to ${d.to}${d.tracking_started ? `, tracking started ${d.tracking_started}` : ""}): ${d.sessions} sessions [${focus}], rest days logged ${d.rest_days_logged}, days with no session or rest logged ${d.days_with_nothing}; pain during avg ${d.pain_during.avg ?? "-"}, max ${d.pain_during.max ?? "-"}, over 3: ${d.pain_during.over_3}${tours}${area}${feel ? `; feel ${feel}` : ""}.`;
}
