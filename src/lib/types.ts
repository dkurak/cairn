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
};

export type TravelInfo = { gear?: "gym" | "bodyweight"; jog?: boolean; returns?: string };

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
};

export const PAIN_SCALE =
  "0 none · 1-3 aware of it, moves fine · 4-6 sharp, changes how you walk · 7-10 stops you";
