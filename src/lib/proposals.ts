import type { AppData, Criterion, PlanItem, ProgramPhase, ProgramPrefs, RundownBlock } from "./types";
import type { GarminStep } from "./garmin/steps";

// Things the coach suggests. Nothing is saved until the person taps Save in the app.
export type WorkoutProposal = {
  type: "workout";
  reason: string;
  base_id: string | null; // existing workout this changes (null = brand new)
  /** "update" (default) edits base in place when allowed; "copy" always saves a new workout */
  mode?: "update" | "copy";
  name: string;
  category: string;
  notes: string;
  blocks: RundownBlock[];
  /** Garmin watch steps to match the new rundown (only rows that changed are rebuilt) */
  steps?: GarminStep[];
  /** things the watch version can't match exactly */
  garmin_warnings?: string[];
};
export type PlanProposal = {
  type: "plan";
  reason: string;
  kind: "home" | "travel";
  /** workout_ids may hold "new:<name>" for a workout in new_workouts */
  items: PlanItem[];
  /** new workouts designed for this plan, saved together with it */
  new_workouts?: WorkoutProposal[];
  /** ids of earlier chat cards for those workouts, marked saved along with the plan */
  bundled_from?: string[];
  /** the program week this plan is for (null = not part of a program) */
  program_id?: string | null;
  program_week?: number | null;
};
export type ProgramProposal = {
  type: "program";
  reason: string;
  title: string;
  goal: string;
  kind: "event" | "ongoing" | "milestone";
  target_date: string | null;
  criteria: Criterion[];
  weeks: number | null;
  days_per_week: number | null;
  phases: ProgramPhase[];
  preferences: ProgramPrefs;
  notes: string;
  /** start it now (pauses the current one) or keep it in the bank */
  activate: boolean;
  /** week 1, saved as the weekly plan when the program starts now */
  first_week?: PlanProposal;
};
export type Proposal = WorkoutProposal | PlanProposal | ProgramProposal;

/**
 * Where a workout proposal lands when saved.
 * - update_own / update_shared: edit the existing row in place (shared = admin only, everyone sees it)
 * - fork: member changing a shared workout -> private copy, swapped into their own plans
 * - new: brand new workout (or an explicit copy)
 */
export type SaveTarget = "update_own" | "update_shared" | "fork" | "new";

export function workoutSaveTarget(p: WorkoutProposal, data: AppData): SaveTarget {
  const base = p.base_id ? data.workouts.find((w) => w.id === p.base_id) : undefined;
  if (!base || p.mode === "copy") return "new";
  if (base.owner_id === data.profile.id) return "update_own";
  if (base.owner_id === null && data.profile.role === "admin") return "update_shared";
  return "fork";
}

export const SAVE_TARGET_NOTE: Record<SaveTarget, string> = {
  update_own: "Updates your workout.",
  update_shared: "Updates the shared library workout - everyone using it sees the change.",
  fork: "Saves your own version and swaps it into your plan. The shared one stays as is.",
  new: "Saves as a new workout.",
};
