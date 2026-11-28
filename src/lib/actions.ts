import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, EntryKind, Feel, LogEntry, Phase, PlanItem, PlanState, Program, ProgramWeekVersion, TravelInfo } from "./types";
import { FEELS } from "./types";
import { activePlan, doneMap, itemWorkoutIds, nextInCycle, planOf, primaryArea, todayISO, upNext } from "./rules";
import { programPosition } from "./programs";
import { storedWeek } from "./programWeeks";

// All mutations live here so the browser (UI) and the server (chat tools) behave the same.
// RLS keeps every call scoped to the signed-in user.

export const clampPain = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n))));

export async function loadAll(sb: SupabaseClient, userId: string): Promise<AppData> {
  const since = new Date(Date.now() - 1900 * 86400000).toISOString().slice(0, 10);
  const [profile, workouts, plans, state, log, areas, checks, checkins, exports] = await Promise.all([
    sb.from("profiles").select("id, display_name, role").eq("id", userId).single(),
    sb.from("workouts").select("id, name, category, owner_id, rundown, notes, version, updated_at").order("name"),
    sb.from("plans").select("*"), // * so program_id/program_week (0007) come along when they exist
    sb.from("plan_state").select("*").eq("user_id", userId).single(),
    sb.from("log_entries").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
    sb.from("pain_areas").select("id, user_id, name, is_primary, active").eq("user_id", userId).order("created_at"),
    sb.from("pain_checks").select("id, area_id, date, pain, note").eq("user_id", userId).gte("date", since).limit(5000),
    sb.from("daily_checkins").select("date, feel").eq("user_id", userId).gte("date", since).limit(1000),
    sb.from("garmin_exports").select("workout_id, version, exported_at").eq("user_id", userId),
  ]);
  for (const r of [profile, plans, state, log, areas, checks, checkins]) if (r.error) throw r.error;
  // Watch/version features need migration 0005. Without it, keep the app working and just skip them.
  let workoutRows = workouts.data as AppData["workouts"] | null;
  if (workouts.error) {
    console.warn("workouts: falling back without version columns (apply migration 0005)", workouts.error.message);
    const r = await sb.from("workouts").select("id, name, category, owner_id, rundown, notes").order("name");
    if (r.error) throw r.error;
    workoutRows = (r.data ?? []).map((w) => ({ ...w, version: 1, updated_at: "" })) as AppData["workouts"];
  }
  if (exports.error) console.warn("garmin_exports unavailable (apply migration 0005)", exports.error.message);
  // goals need migration 0006; without it the coach just doesn't know them yet
  const goals = await sb.from("profiles").select("goals, goals_updated_at").eq("id", userId).single();
  // goal programs need migration 0007
  const programs = await sb.from("programs").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  // saved program weeks need migration 0008; without it week pages fall back to the current plan
  const programWeeks = await sb.from("program_weeks").select("*").eq("user_id", userId).order("week");
  // drafts and revisions need 0009: probe for the status column
  const weekPlans = await sb.from("program_weeks").select("status").limit(1);
  // imported watch activities need migration 0010
  const activities = await sb.from("activities").select("id, date, name, seconds, log_entry_id").eq("user_id", userId).order("date", { ascending: false }).limit(5000);
  if (!goals.error && goals.data) Object.assign(profile.data as object, goals.data);
  return {
    profile: profile.data as AppData["profile"],
    workouts: workoutRows ?? [],
    plans: (plans.data as AppData["plans"]).filter((p) => p.owner_id === userId),
    state: state.data as PlanState,
    log: log.data as LogEntry[],
    areas: areas.data as AppData["areas"],
    checks: checks.data as AppData["checks"],
    checkins: checkins.data as AppData["checkins"],
    exports: (exports.error ? [] : exports.data) as AppData["exports"],
    programs: (programs.error ? [] : programs.data ?? []) as AppData["programs"],
    programWeeks: (programWeeks.error ? [] : programWeeks.data ?? []) as AppData["programWeeks"],
    activities: (activities.error ? [] : activities.data ?? []) as AppData["activities"],
    weekPlansReady: !weekPlans.error,
  };
}

export type NewEntry = {
  what: string;
  date?: string;
  pain_during?: number | null;
  feel?: Feel | null;
  vert_ft?: number | null;
  notes?: string;
};

const kindFor = (what: string): EntryKind => (what === "Tour" ? "tour" : what === "Rest" ? "rest" : "workout");

export async function logEntries(sb: SupabaseClient, data: AppData, entries: NewEntry[]) {
  const rows = entries.map((e, i) => {
    const kind = kindFor(e.what);
    const w = data.workouts.find((x) => x.name === e.what);
    return {
      user_id: data.state.user_id,
      date: e.date || todayISO(),
      kind,
      workout_id: w?.id ?? null,
      what: e.what.slice(0, 80),
      pain_during: e.pain_during == null ? null : clampPain(e.pain_during),
      feel: e.feel && FEELS.includes(e.feel) ? e.feel : null,
      vert_ft: kind === "tour" && e.vert_ft ? Math.round(Number(e.vert_ft)) : null,
      notes: (e.notes ?? "").slice(0, 500),
      // keep order stable inside one save
      created_at: new Date(Date.now() + i).toISOString(),
    };
  });
  const { error } = await sb.from("log_entries").insert(rows);
  if (error) throw error;
}

/** One 0-10 number per area per day (upsert). A primary-area check the morning after a tour fills that tour's next-morning pain. */
export async function savePainCheck(sb: SupabaseClient, userId: string, areaId: string, pain: number, date = todayISO(), note?: string) {
  const p = clampPain(pain);
  const { error } = await sb
    .from("pain_checks")
    .upsert({ user_id: userId, area_id: areaId, date, pain: p, ...(note !== undefined ? { note } : {}) }, { onConflict: "area_id,date" });
  if (error) throw error;
  const { data: area } = await sb.from("pain_areas").select("is_primary").eq("id", areaId).single();
  if (!area?.is_primary) return;
  const { data: t } = await sb.from("log_entries").select("id, date, pain_next_am").eq("user_id", userId).eq("kind", "tour").order("date", { ascending: false }).limit(1).maybeSingle();
  if (t && t.pain_next_am == null && t.date < date) {
    const next = new Date(t.date + "T12:00:00");
    next.setDate(next.getDate() + 1);
    if (next.toISOString().slice(0, 10) === date) await sb.from("log_entries").update({ pain_next_am: p }).eq("id", t.id);
  }
}

/** Create a tracked area (or reactivate it). The first area someone adds becomes their primary one. */
export async function saveDailyFeel(sb: SupabaseClient, userId: string, feel: Feel, date = todayISO()) {
  const { error } = await sb.from("daily_checkins").upsert({ user_id: userId, date, feel }, { onConflict: "user_id,date" });
  if (error) throw error;
}

export async function addPainArea(sb: SupabaseClient, userId: string, name: string, makePrimary = false) {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error("Area needs a name");
  const { data: existing } = await sb.from("pain_areas").select("id, name, is_primary, active").eq("user_id", userId);
  const hit = existing?.find((a) => a.name.toLowerCase() === clean.toLowerCase());
  if (hit) {
    if (!hit.active) await sb.from("pain_areas").update({ active: true }).eq("id", hit.id);
    return hit.id as string;
  }
  const primary = makePrimary || !existing?.some((a) => a.is_primary);
  if (primary && existing?.some((a) => a.is_primary)) await sb.from("pain_areas").update({ is_primary: false }).eq("user_id", userId).eq("is_primary", true);
  const { data, error } = await sb.from("pain_areas").insert({ user_id: userId, name: clean, is_primary: primary }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function setAreaActive(sb: SupabaseClient, id: string, active: boolean) {
  const { error } = await sb.from("pain_areas").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function patchState(sb: SupabaseClient, userId: string, patch: Partial<PlanState>) {
  const { error } = await sb.from("plan_state").update(patch).eq("user_id", userId);
  if (error) throw error;
}

export function markDone(sb: SupabaseClient, state: PlanState, key: string, val: string) {
  return state.travel
    ? patchState(sb, state.user_id, { travel_done: { ...state.travel_done, [key]: val } })
    : patchState(sb, state.user_id, { done: { ...state.done, [key]: val } });
}

export const setPhase = (sb: SupabaseClient, s: PlanState, phase: Phase) => patchState(sb, s.user_id, { phase });
/** Back to traveling within this many days of switching home = the same trip, set progress kept. */
export const TRAVEL_RESUME_DAYS = 3;
const daysBetween = (a: string, b: string) => Math.round((+new Date(b + "T12:00:00") - +new Date(a + "T12:00:00")) / 86400000);

/** Switching to Traveling now would pick the last trip back up (an accidental tap, or a short stop at home). */
export const canResumeTravel = (s: PlanState, today = todayISO()) =>
  !s.travel && !!s.travel_info?.ended && daysBetween(s.travel_info.ended, today) <= TRAVEL_RESUME_DAYS;

/**
 * Travel on/off. Going home keeps the travel set's progress and remembers the day. Going back to traveling
 * continues that trip if it was recent (or `fresh: false`), otherwise starts the set over.
 */
export function setTravel(sb: SupabaseClient, s: PlanState, on: boolean, info?: TravelInfo, opts: { fresh?: boolean } = {}) {
  const today = todayISO();
  const prev = s.travel_info ?? {};
  if (!on) return patchState(sb, s.user_id, { travel: false, ...(s.travel ? { travel_info: { ...prev, ended: today } } : {}) });
  if (s.travel) return patchState(sb, s.user_id, info ? { travel_info: { ...prev, ...info } } : {}); // edit the current trip
  const fresh = opts.fresh ?? !canResumeTravel(s, today);
  const { ended: _, ...kept } = prev;
  return patchState(sb, s.user_id, fresh
    ? { travel: true, travel_done: {}, travel_info: { ...(info ?? {}), started: today } }
    : { travel: true, travel_info: { ...kept, ...(info ?? {}) } });
}

/** Start the travel set over (a new trip while already traveling). */
export const restartTravelSet = (sb: SupabaseClient, s: PlanState) =>
  patchState(sb, s.user_id, { travel_done: {}, travel_info: { ...(s.travel_info ?? {}), started: todayISO() } });

/** Un-tick a plan item (marked done or skipped by mistake). */
export function unmarkDone(sb: SupabaseClient, s: PlanState, key: string) {
  const map = { ...(s.travel ? s.travel_done : s.done) };
  delete map[key];
  return patchState(sb, s.user_id, s.travel ? { travel_done: map } : { done: map });
}

/**
 * Logging what's up next counts as doing it, however it was logged ("Log a workout", the coach, a past day).
 * Returns the item's title when it moved the plan on.
 */
export async function creditUpNext(sb: SupabaseClient, data: AppData, whats: string[], date: string) {
  const n = upNext(data);
  if (n.type !== "item") return null;
  const it = n.item;
  const names = itemWorkoutIds(it, data.workouts, data.log).map((id) => data.workouts.find((w) => w.id === id)?.name).filter(Boolean) as string[];
  const lower = whats.map((w) => w.toLowerCase());
  const hit =
    (it.kind === "workout" && names.some((nm) => lower.includes(nm.toLowerCase()))) ||
    (it.kind === "tour" && lower.includes("tour")) ||
    (it.kind === "rest" && lower.includes("rest"));
  if (!hit) return null;
  await markDone(sb, data.state, it.key, date);
  return it.title;
}

export async function skipUpNext(sb: SupabaseClient, data: AppData) {
  const n = upNext(data);
  if (n.type !== "item") return null;
  await markDone(sb, data.state, n.item.key, "skipped");
  return n.item.title;
}

export const startNextWeek = (sb: SupabaseClient, s: PlanState) =>
  s.travel ? patchState(sb, s.user_id, { travel_done: {} }) : patchState(sb, s.user_id, { done: {}, week: (s.week || 1) + 1 });

export async function updateEntry(sb: SupabaseClient, id: string, patch: Partial<Pick<LogEntry, "what" | "kind" | "workout_id" | "notes" | "pain_during" | "pain_next_am" | "feel" | "vert_ft" | "date">>) {
  const { error } = await sb.from("log_entries").update(patch).eq("id", id);
  if (error) throw error;
}
/** Save the person's training goals (needs migration 0006). */
export async function setGoals(sb: SupabaseClient, userId: string, goals: string) {
  const { error } = await sb.from("profiles").update({ goals: goals.trim().slice(0, 1500), goals_updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw new Error(/goals/.test(error.message) ? "Goals need a database update (migration 0006) first." : error.message);
}

export async function deleteEntry(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("log_entries").delete().eq("id", id);
  if (error) throw error;
}

export { activePlan, doneMap, nextInCycle, planOf, primaryArea };

// ---------- plans and program weeks ----------

/**
 * Insert or update a row. Newer columns (change_note from 0005, program_id/program_week from 0007) may not
 * exist yet if a migration hasn't run: drop the column the database complains about and try again.
 */
export async function writeRow(sb: SupabaseClient, table: string, row: Record<string, unknown>, id?: string) {
  let r = { ...row };
  for (let tries = 0; tries < 4; tries++) {
    const res = await (id ? sb.from(table).update(r).eq("id", id).select("id").single() : sb.from(table).insert(r).select("id").single());
    if (!res.error) return res.data as { id: string };
    const col = res.error.message.match(/'(\w+)' column|column "?(?:\w+\.)?(\w+)"? does not exist/);
    const name = col?.[1] ?? col?.[2];
    if (!name || !(name in r)) throw res.error;
    const { [name]: _, ...rest } = r;
    r = rest;
  }
  throw new Error(`Couldn't save to ${table}`);
}

type WeekRow = { user_id: string; program_id: string; week: number; plan_kind: "home" | "travel"; items: PlanItem[]; status: "draft" | "live"; note: string };

/** Keep a copy of a live program week. Before 0009 there's no status/note column, before 0008 no table: carry on quietly. */
export async function upsertLiveWeek(sb: SupabaseClient, row: WeekRow) {
  let r: Record<string, unknown> = { ...row };
  let res = await sb.from("program_weeks").upsert(r, { onConflict: "program_id,week" });
  if (res.error && /status|note|revision/.test(res.error.message ?? "") && !/relation/.test(res.error.message ?? "")) {
    const { status: _s, note: _n, ...rest } = r;
    r = rest;
    res = await sb.from("program_weeks").upsert(r, { onConflict: "program_id,week" });
  }
  if (res.error && !/program_weeks/.test(res.error.message ?? "")) throw res.error;
}

/** Make a plan the one being followed: writes the plan row, resets the checklist, and keeps a copy for the program week. */
export async function writeLivePlan(sb: SupabaseClient, uid: string, a: { existing?: { id: string } | null; kind: "home" | "travel"; items: PlanItem[]; program_id?: string | null; program_week?: number | null; note?: string }) {
  const link = a.kind === "home" ? { program_id: a.program_id ?? null, program_week: a.program_week ?? null } : {};
  const row = a.existing
    ? await writeRow(sb, "plans", { items: a.items, ...link }, a.existing.id)
    : await writeRow(sb, "plans", { owner_id: uid, name: a.kind === "travel" ? "Travel" : "My week", kind: a.kind, items: a.items, ...link });
  await patchState(sb, uid, a.kind === "home" ? { active_home_plan_id: row.id, done: {} } : { active_travel_plan_id: row.id, travel_done: {} });
  if (a.program_id && a.program_week) {
    await upsertLiveWeek(sb, { user_id: uid, program_id: a.program_id, week: a.program_week, plan_kind: a.kind, items: a.items, status: "live", note: a.note ?? "" });
  }
  return row.id;
}

/** Writes draft weeks. Never touches a live week, never a week that's already here or past. Needs migration 0009. */
export async function saveWeekDrafts(sb: SupabaseClient, uid: string, programId: string, drafts: { week: number; items: PlanItem[] }[], opts: { currentWeek: number; note: string; kind?: "home" | "travel" }) {
  const need = new Error("Planning ahead needs a database update (migration 0009) first.");
  const weeks = drafts.filter((d) => d.week > opts.currentWeek).map((d) => d.week);
  const { data: existing, error: e1 } = await sb.from("program_weeks").select("week, status").eq("program_id", programId).in("week", weeks.length ? weeks : [-1]);
  if (e1) throw /program_weeks|status|column/i.test(e1.message ?? "") ? need : e1;
  const live = new Set((existing ?? []).filter((r: { status?: string }) => r.status === "live").map((r: { week: number }) => r.week));
  const saved: number[] = [];
  const skipped: number[] = [];
  for (const d of drafts) {
    if (d.week <= opts.currentWeek || live.has(d.week)) { skipped.push(d.week); continue; }
    const { error } = await sb.from("program_weeks").upsert(
      { user_id: uid, program_id: programId, week: d.week, plan_kind: opts.kind ?? "home", items: d.items, status: "draft", note: opts.note.slice(0, 300) },
      { onConflict: "program_id,week" },
    );
    if (error) throw /program_weeks|status|note|column/i.test(error.message ?? "") ? need : error;
    saved.push(d.week);
  }
  return { saved, skipped };
}

/** The week has arrived: make its draft the plan you're following. */
export async function adoptDraftWeek(sb: SupabaseClient, data: AppData, p: Program, week: number) {
  const row = storedWeek(data, p.id, week);
  if (!row || (row.status ?? "live") !== "draft") throw new Error("There's no draft for that week.");
  const kind = row.plan_kind ?? "home";
  await writeLivePlan(sb, data.state.user_id, { existing: data.plans.find((pl) => pl.kind === kind), kind, items: row.items, program_id: p.id, program_week: week, note: row.note ?? "" });
}

/** Put an earlier version of a week back. If it's the week you're following, the live plan changes too. */
export async function restoreWeekRevision(sb: SupabaseClient, data: AppData, p: Program, week: number, v: ProgramWeekVersion) {
  const row = storedWeek(data, p.id, week);
  if (!row) throw new Error("That week isn't saved.");
  const note = `Restored revision ${v.revision}`;
  if ((row.status ?? "live") === "live" && week === programPosition(p, todayISO()).week) {
    const kind = row.plan_kind ?? "home";
    await writeLivePlan(sb, data.state.user_id, { existing: data.plans.find((pl) => pl.kind === kind), kind, items: v.items, program_id: p.id, program_week: week, note });
    return;
  }
  const { error } = await sb.from("program_weeks").update({ items: v.items, note }).eq("id", row.id);
  if (error) throw error;
}
