import type { AppData, LogEntry, PainArea, PainCheck, Plan, PlanItem, PlanState, Workout } from "./types";

export const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const round50 = (n: number) => Math.round(n / 50) * 50;
export const painClass = (p: number | null) => (p == null ? "" : p <= 3 ? "g" : p <= 6 ? "w" : "b");

const byNewest = (a: LogEntry, b: LogEntry) =>
  a.date === b.date ? (a.created_at < b.created_at ? 1 : -1) : a.date < b.date ? 1 : -1;

export const sortedLog = (log: LogEntry[]) => [...log].sort(byNewest);
export const tours = (log: LogEntry[]) => sortedLog(log).filter((e) => e.kind === "tour");
export const primaryArea = (areas: PainArea[]) => areas.find((a) => a.is_primary && a.active);
export const checksFor = (checks: PainCheck[], areaId: string) =>
  checks.filter((c) => c.area_id === areaId).sort((a, b) => (a.date < b.date ? 1 : -1));
export const checkOn = (checks: PainCheck[], areaId: string, date: string) => checks.find((c) => c.area_id === areaId && c.date === date);

/** "down 2 vs last week" style summary: latest check vs the one closest to 7 days earlier. */
export function trendNote(checks: PainCheck[], areaId: string): string {
  const list = checksFor(checks, areaId);
  if (list.length < 2) return list.length ? "first check" : "no checks yet";
  const latest = list[0];
  const target = new Date(latest.date + "T12:00:00");
  target.setDate(target.getDate() - 7);
  const t = target.toISOString().slice(0, 10);
  const prev = list.slice(1).reduce((best, c) => (Math.abs(+new Date(c.date) - +new Date(t)) < Math.abs(+new Date(best.date) - +new Date(t)) ? c : best));
  const d = latest.pain - prev.pain;
  const span = Math.round((+new Date(latest.date) - +new Date(prev.date)) / 86400000);
  const vs = span >= 6 ? "vs last week" : `vs ${span} day${span === 1 ? "" : "s"} ago`;
  return d === 0 ? `same ${vs}` : `${d < 0 ? "down" : "up"} ${Math.abs(d)} ${vs}`;
}

export function planOf(data: Pick<AppData, "plans" | "state">, which: "home" | "travel" | "calm"): Plan | undefined {
  const { plans, state } = data;
  if (which === "home") return plans.find((p) => p.id === state.active_home_plan_id) ?? plans.find((p) => p.kind === "home" && p.owner_id);
  if (which === "travel") return plans.find((p) => p.id === state.active_travel_plan_id) ?? plans.find((p) => p.kind === "travel" && p.owner_id);
  return plans.find((p) => p.kind === "calm" && p.owner_id);
}

export const activePlan = (data: Pick<AppData, "plans" | "state">) =>
  planOf(data, data.state.travel ? "travel" : "home");
export const doneMap = (s: PlanState) => (s.travel ? s.travel_done : s.done) ?? {};

/** Next workout in a rotation after the last one logged (CC01 > CC05 > ...). */
export function nextInCycle(ids: string[], workouts: Workout[], log: LogEntry[]): string {
  const names = ids.map((id) => workouts.find((w) => w.id === id)?.name);
  const last = sortedLog(log).find((e) => e.kind === "workout" && names.includes(e.what));
  if (!last) return ids[0];
  return ids[(names.indexOf(last.what) + 1) % ids.length];
}

export function itemWorkoutIds(item: PlanItem, workouts: Workout[], log: LogEntry[]): string[] {
  if (item.cycle && item.workout_ids.length) return [nextInCycle(item.workout_ids, workouts, log)];
  return item.workout_ids;
}

export type UpNext =
  | { type: "calm"; item: PlanItem }
  | { type: "item"; item: PlanItem }
  | { type: "complete" }
  | { type: "empty" };

export function upNext(data: AppData): UpNext {
  const { state } = data;
  if (state.phase === "calm") {
    const calm = planOf(data, "calm");
    if (calm?.items[0]) return { type: "calm", item: calm.items[0] };
  }
  const plan = activePlan(data);
  if (!plan?.items.length) return { type: "empty" };
  const dm = doneMap(state);
  const item = plan.items.find((i) => !dm[i.key]);
  return item ? { type: "item", item } : { type: "complete" };
}

export type GreenLight = { tone: "good" | "warn" | "bad"; title: string; body: string } | null;

/** Tour green light, based on the latest tour (rules from CLAUDE.md). */
export function greenLight(state: PlanState, log: LogEntry[], touring: boolean): GreenLight {
  if (!touring && !tours(log).length) return null;
  if (state.phase === "calm")
    return { tone: "bad", title: "No tours yet", body: 'Calm-down first. When everyday pain is 3/10 or less, tap "start the plan" in Up next.' };
  const t = tours(log)[0];
  if (!t)
    return { tone: "good", title: "Start at 1,000-1,500 ft", body: "Start small, then add 20-25% a week if the pain is gone the next morning." };
  const v = t.vert_ft ?? 0;
  if (t.pain_during != null && t.pain_during > 3)
    return { tone: "bad", title: "Step back: 1,000-1,500 ft", body: `Last tour hit ${t.pain_during}/10. Stay in the green zone (3 or less) before adding vert.` };
  if (t.pain_next_am == null) return null; // waiting on the morning-after hip check
  if (t.pain_next_am > 0)
    return { tone: "warn", title: `Hold at ${v ? round50(v).toLocaleString() : "the same"} ft`, body: `Pain was still there the next morning (${t.pain_next_am}/10). Repeat before adding.` };
  return {
    tone: "good",
    title: `Green light: ${round50(v * 1.2).toLocaleString()}-${round50(v * 1.25).toLocaleString()} ft`,
    body: "Last tour was clean during and the next morning. Add 20-25%.",
  };
}

/** Plans are sequences, not dates: project the remaining items onto upcoming days (one per day, after today's Up next). */
export function projectedItems(data: AppData): PlanItem[] {
  const n = upNext(data);
  const plan = activePlan(data);
  if (!plan) return [];
  const dm = doneMap(data.state);
  const skipKey = n.type === "item" ? n.item.key : null;
  return plan.items.filter((i) => !dm[i.key] && i.key !== skipKey);
}

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** What "Log a workout" should start on: the last workout they logged, else the first thing in their plan, else the first in the library. */
export function defaultWorkoutName(data: Pick<AppData, "log" | "plans" | "state" | "workouts">): string {
  const last = sortedLog(data.log).find((e) => e.kind === "workout");
  if (last) return last.what;
  const plan = activePlan(data);
  const id = plan?.items.flatMap((i) => i.workout_ids)[0];
  const w = data.workouts.find((x) => x.id === id) ?? data.workouts[0];
  return w?.name ?? "Other";
}
