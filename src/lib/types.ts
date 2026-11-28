export type Phase = "calm" | "build";
export type EntryKind = "workout" | "tour" | "rest";
export type PlanKind = "home" | "travel" | "calm";
export const FEELS = ["Rough", "OK", "Good", "Great"] as const;
export type Feel = (typeof FEELS)[number];

export type RundownRow = [exercise: string, setsReps: string, tip: string];
export type RundownBlock = { label?: string; rows: RundownRow[] };

export type Workout = {
  id: string;
  name: string;
  category: string;
  owner_id: string | null;
  rundown: RundownBlock[] | null;
  notes: string;
  version: number;
  updated_at: string;
};

/** Which version of a workout this person last downloaded for their watch. */
export type GarminExport = { workout_id: string; version: number; exported_at: string };

export type WorkoutVersion = {
  id: string;
  workout_id: string;
  version: number;
  name: string;
  category: string;
  rundown: RundownBlock[] | null;
  notes: string;
  change_note: string;
  changed_by: string | null;
  changed_at: string;
};

export type PlanItem = {
  key: string;
  day: string;
  title: string;
  workout_ids: string[];
  kind: "workout" | "tour" | "rest";
  note: string;
  /** workout_ids is a rotation: pick the one after the last one logged */
  cycle?: boolean;
};

export type Plan = {
  id: string;
  owner_id: string | null;
  name: string;
  kind: PlanKind;
  items: PlanItem[];
  /** the goal program week this plan was written for (migration 0007) */
  program_id?: string | null;
  program_week?: number | null;
};

/** `focus` = the goal in a sentence; `outcome` = how you should feel coming out of it. */
export type ProgramPhase = { name: string; weeks: number; focus: string; outcome?: string };
export type ProgramPrefs = { session_minutes?: number; variety?: string; rest_days?: string; equipment?: string; limits?: string };
export type ProgramStatus = "idea" | "active" | "paused" | "done";
/** Milestone checks the app can evaluate from the log (or mark by hand). */
export type Criterion =
  | { kind: "pain_streak"; label: string; max: number; days: number; area?: string } // daily checks <= max, N days in a row
  | { kind: "sessions"; label: string; max_pain: number; count: number; days: number } // N sessions with pain <= max in the last D days
  | { kind: "tour"; label: string; max_pain: number; min_vert?: number } // a tour since the start, pain <= max and 0 next morning
  | { kind: "manual"; label: string; met?: boolean };
export type Program = {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  kind: "event" | "ongoing" | "milestone";
  target_date: string | null;
  start_date: string | null;
  criteria: Criterion[];
  resumes_id: string | null;
  completed_at: string | null;
  outcome: string;
  weeks: number | null;
  days_per_week: number | null;
  status: ProgramStatus;
  phases: ProgramPhase[];
  preferences: ProgramPrefs;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type TravelInfo = {
  gear?: "gym" | "bodyweight";
  jog?: boolean;
  returns?: string;
  /** when this trip's travel set started */
  started?: string;
  /** the day they switched back home; switching on again soon after continues the same trip */
  ended?: string;
};

export type PlanState = {
  user_id: string;
  phase: Phase;
  travel: boolean;
  active_home_plan_id: string | null;
  active_travel_plan_id: string | null;
  done: Record<string, string>;
  travel_done: Record<string, string>;
  travel_info: TravelInfo;
  week: number;
};

export type LogEntry = {
  id: string;
  user_id: string;
  date: string;
  kind: EntryKind;
  workout_id: string | null;
  what: string;
  pain_during: number | null;
  pain_next_am: number | null;
  feel: Feel | null;
  vert_ft: number | null;
  notes: string;
  created_at: string;
};

export type PainArea = { id: string; user_id: string; name: string; is_primary: boolean; active: boolean };
export type PainCheck = { id: string; area_id: string; date: string; pain: number; note: string };

export type DailyCheckin = { date: string; feel: Feel };

export type CoachRow = {
  id: string;
  role: "user" | "assistant" | "act";
  content: string;
  proposal: import("./proposals").Proposal | null;
  proposal_status: "open" | "saved" | "discarded" | null;
  created_at: string;
};

export type Profile = { id: string; display_name: string; role: "admin" | "member"; goals?: string; goals_updated_at?: string | null };

/** One week of a program as it was planned (0008). */
/** One week of a program as it was planned (0008). status/revision/note arrive with 0009: until then every week reads as live, revision 1. */
export type ProgramWeek = {
  id: string; program_id: string; week: number; plan_kind: "home" | "travel"; items: PlanItem[]; created_at: string; updated_at: string;
  status?: "draft" | "live"; revision?: number; note?: string;
};
/** An earlier version of a program week (0009). */
export type ProgramWeekVersion = { id: string; program_week_id: string; revision: number; status: "draft" | "live"; items: PlanItem[]; note: string; changed_at: string };

/** A watch activity (migration 0010). Gym strength sessions only live here, so History counts them from here. */
export type Activity = { id: string; date: string; name: string; seconds: number | null; log_entry_id: string | null };

export type AppData = {
  profile: Profile;
  workouts: Workout[];
  plans: Plan[];
  state: PlanState;
  log: LogEntry[];
  areas: PainArea[];
  checks: PainCheck[];
  checkins: DailyCheckin[];
  exports: GarminExport[];
  programs: Program[];
  programWeeks: ProgramWeek[];
  activities: Activity[];
  /** false until migration 0009 is applied (no draft weeks or revisions yet) */
  weekPlansReady: boolean;
};

export const PAIN_SCALE =
  "0 none · 1-3 aware of it, moves fine · 4-6 sharp, changes how you walk · 7-10 stops you";
