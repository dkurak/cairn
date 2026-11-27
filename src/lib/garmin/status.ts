import type { AppData, Workout } from "../types";

export type WatchStatus =
  | { kind: "current"; version: number } // watch has the latest
  | { kind: "update"; onWatch: number; latest: number } // changed since the last download
  | { kind: "none" }; // never downloaded

export function watchStatus(w: Pick<Workout, "id" | "version">, data: Pick<AppData, "exports">): WatchStatus {
  const e = data.exports.find((x) => x.workout_id === w.id);
  if (!e) return { kind: "none" };
  return e.version >= w.version ? { kind: "current", version: w.version } : { kind: "update", onWatch: e.version, latest: w.version };
}

/** Workouts in any of their plans. */
export function planWorkoutIds(data: Pick<AppData, "plans">) {
  return new Set(data.plans.flatMap((p) => p.items.flatMap((i) => i.workout_ids)));
}

/**
 * What to put on the watch: everything that changed since the last download,
 * plus plan workouts that were never downloaded.
 */
export function watchToDo(data: Pick<AppData, "workouts" | "exports" | "plans">) {
  const inPlan = planWorkoutIds(data);
  return data.workouts.filter((w) => {
    const s = watchStatus(w, data);
    return s.kind === "update" || (s.kind === "none" && inPlan.has(w.id));
  });
}
