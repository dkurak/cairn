// Turning what the coach sends (loose JSON) into clean program fields, and working out what an update changes.
import type { Criterion, Program, ProgramPhase, ProgramPrefs } from "./types";

const num = (v: unknown, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, Math.round(Number(v ?? d)) || d));
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseCriteria(raw: unknown): Criterion[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 6).map((c: any): Criterion => {
    const label = String(c?.label ?? "").slice(0, 80);
    if (c?.kind === "pain_streak") return { kind: "pain_streak", label, max: num(c.max, 0, 10, 1), days: num(c.days, 1, 60, 7), ...(c.area ? { area: String(c.area).slice(0, 40) } : {}) };
    if (c?.kind === "sessions") return { kind: "sessions", label, max_pain: num(c.max_pain, 0, 10, 2), count: num(c.count, 1, 30, 4), days: num(c.days, 1, 60, 10) };
    if (c?.kind === "tour") return { kind: "tour", label, max_pain: num(c.max_pain, 0, 10, 3), ...(c.min_vert ? { min_vert: num(c.min_vert, 0, 20000, 0) } : {}) };
    return { kind: "manual", label, ...(c?.met ? { met: true } : {}) };
  });
}

export function parsePhases(raw: unknown): ProgramPhase[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 8).map((x: any) => ({
    name: String(x?.name ?? "").slice(0, 24),
    weeks: num(x?.weeks, 1, 52, 1),
    focus: String(x?.focus ?? "").slice(0, 200),
  }));
}

const PREF_KEYS = ["session_minutes", "variety", "rest_days", "equipment", "limits"] as const;
export function parsePrefs(raw: unknown, base: ProgramPrefs = {}): ProgramPrefs {
  const inp = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const k of PREF_KEYS) {
    if (!(k in inp)) continue;
    const v = inp[k];
    if (v == null || v === "") delete out[k]; // "" clears it
    else out[k] = k === "session_minutes" ? num(v, 5, 300, 30) : String(v).slice(0, 200);
  }
  return out as ProgramPrefs;
}

/** The editable fields of a program. */
export type ProgramFields = Pick<Program, "title" | "goal" | "kind" | "target_date" | "weeks" | "days_per_week" | "phases" | "preferences" | "criteria" | "notes">;
export const PROGRAM_FIELDS: (keyof ProgramFields)[] = ["title", "goal", "kind", "target_date", "weeks", "days_per_week", "phases", "preferences", "criteria", "notes"];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What an update changes. Only fields present in `input` count; phases and criteria are full replacements,
 * preferences merge (a key set to "" is removed). Returns before/after for just the changed fields.
 */
export function programChanges(p: Program, input: Record<string, unknown>, today: string):
  { error: string } | { before: Partial<ProgramFields>; after: Partial<ProgramFields> } {
  const next: Partial<ProgramFields> = {};
  if ("title" in input && input.title) next.title = String(input.title).slice(0, 60);
  if ("goal" in input) next.goal = String(input.goal ?? "").slice(0, 600);
  if ("notes" in input) next.notes = String(input.notes ?? "").slice(0, 600);
  if ("kind" in input && ["event", "ongoing", "milestone"].includes(String(input.kind))) next.kind = input.kind as Program["kind"];
  if ("target_date" in input) {
    if (input.target_date === null || input.target_date === "") next.target_date = null;
    else if (isDate(input.target_date)) next.target_date = input.target_date;
    else return { error: "target_date must be YYYY-MM-DD (or empty to clear it)." };
  }
  if ("weeks" in input) next.weeks = input.weeks == null || input.weeks === "" ? null : num(input.weeks, 1, 52, 1);
  if ("days_per_week" in input) next.days_per_week = input.days_per_week == null || input.days_per_week === "" ? null : num(input.days_per_week, 1, 7, 3);
  if ("phases" in input) {
    next.phases = parsePhases(input.phases);
    if (!next.phases.length) return { error: "phases can't be empty - leave the field out to keep them." };
  }
  if ("criteria" in input) next.criteria = parseCriteria(input.criteria);
  if ("preferences" in input) next.preferences = parsePrefs(input.preferences, p.preferences ?? {});

  const merged = { ...p, ...next };
  if (merged.kind === "milestone") next.weeks = merged.weeks = null; // done when it's done
  if (merged.kind === "event" && !merged.target_date) return { error: "An event needs a target_date." };
  if (next.target_date && next.target_date < today && merged.kind === "event") return { error: "That date has passed." };
  if (merged.kind === "milestone" && !merged.criteria?.length) return { error: "A milestone needs at least one criterion." };

  const before: Partial<ProgramFields> = {};
  const after: Partial<ProgramFields> = {};
  for (const k of PROGRAM_FIELDS) {
    if (!(k in next) || same(p[k], next[k])) continue;
    (before as Record<string, unknown>)[k] = p[k] ?? null;
    (after as Record<string, unknown>)[k] = next[k] ?? null;
  }
  if (!Object.keys(after).length) return { error: "Nothing would change - those are already the program's values." };
  return { before, after };
}
