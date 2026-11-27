import type { PlanItem, RundownBlock } from "./types";

// Things the coach suggests. Nothing is saved until the person taps Save in the app.
export type WorkoutProposal = {
  type: "workout";
  reason: string;
  base_id: string | null; // existing workout this changes (null = brand new)
  name: string;
  category: string;
  notes: string;
  blocks: RundownBlock[];
};
export type PlanProposal = {
  type: "plan";
  reason: string;
  kind: "home" | "travel";
  items: PlanItem[];
};
export type Proposal = WorkoutProposal | PlanProposal;
