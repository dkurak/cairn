import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, EntryKind, Feel, LogEntry, Phase, PlanState, TravelInfo } from "./types";
import { FEELS } from "./types";
import { activePlan, doneMap, nextInCycle, planOf, primaryArea, todayISO, upNext } from "./rules";

// All mutations live here so the browser (UI) and the server (chat tools) behave the same.
// RLS keeps every call scoped to the signed-in user.

export const clampPain = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n))));

export async function loadAll(sb: SupabaseClient, userId: string): Promise<AppData> {
  const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const [profile, workouts, plans, state, log, areas, checks, checkins] = await Promise.all([
    sb.from("profiles").select("id, display_name, role").eq("id", userId).single(),
    sb.from("workouts").select("id, name, category, owner_id, rundown, notes").order("name"),
    sb.from("plans").select("id, owner_id, name, kind, items"),
    sb.from("plan_state").select("*").eq("user_id", userId).single(),
    sb.from("log_entries").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(300),
    sb.from("pain_areas").select("id, user_id, name, is_primary, active").eq("user_id", userId).order("created_at"),
    sb.from("pain_checks").select("id, area_id, date, pain, note").eq("user_id", userId).gte("date", since),
    sb.from("daily_checkins").select("date, feel").eq("user_id", userId).gte("date", since),
  ]);
  for (const r of [profile, workouts, plans, state, log, areas, checks, checkins]) if (r.error) throw r.error;
  return {
    profile: profile.data as AppData["profile"],
    workouts: workouts.data as AppData["workouts"],
    plans: (plans.data as AppData["plans"]).filter((p) => p.owner_id === userId),
    state: state.data as PlanState,
    log: log.data as LogEntry[],
    areas: areas.data as AppData["areas"],
    checks: checks.data as AppData["checks"],
    checkins: checkins.data as AppData["checkins"],
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
export const setTravel = (sb: SupabaseClient, s: PlanState, on: boolean, info?: TravelInfo) =>
  patchState(sb, s.user_id, { travel: on, ...(on && !s.travel ? { travel_done: {} } : {}), ...(info ? { travel_info: info } : {}) });

export async function skipUpNext(sb: SupabaseClient, data: AppData) {
  const n = upNext(data);
  if (n.type !== "item") return null;
  await markDone(sb, data.state, n.item.key, "skipped");
  return n.item.title;
}

export const startNextWeek = (sb: SupabaseClient, s: PlanState) =>
  s.travel ? patchState(sb, s.user_id, { travel_done: {} }) : patchState(sb, s.user_id, { done: {}, week: (s.week || 1) + 1 });

export async function updateEntry(sb: SupabaseClient, id: string, patch: Partial<Pick<LogEntry, "notes" | "pain_during" | "pain_next_am" | "feel" | "vert_ft" | "date">>) {
  const { error } = await sb.from("log_entries").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteEntry(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("log_entries").delete().eq("id", id);
  if (error) throw error;
}

export { activePlan, doneMap, nextInCycle, planOf, primaryArea };
