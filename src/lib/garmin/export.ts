import type { SupabaseClient } from "@supabase/supabase-js";
import type { RundownBlock } from "../types";
import { buildWorkoutFit, fitFileName, randomSerial } from "./fit";
import { patchSteps, type GarminStep } from "./steps";

type Row = { id: string; name: string; owner_id: string | null; version: number; rundown: RundownBlock[] | null; steps: GarminStep[] | null };

export type ExportedFile = { workout_id: string; name: string; version: number; file: string; data: Uint8Array; warnings: string[] };

/**
 * Build .fit files for these workouts (that the user can see) and record that the user's watch now has
 * this version. Pass the user's own client in the app (RLS applies) or a service client plus userId.
 */
export async function exportWorkouts(sb: SupabaseClient, userId: string, ids: string[]): Promise<ExportedFile[]> {
  if (!ids.length) return [];
  const { data, error } = await sb
    .from("workouts")
    .select("id, name, owner_id, version, rundown, steps")
    .or(`owner_id.is.null,owner_id.eq.${userId}`);
  if (error) throw error;
  const rows = data as Row[];
  const library = rows.map((r) => r.steps ?? []).filter((s) => s.length);
  const want = rows.filter((r) => ids.includes(r.id));
  const base = Date.now();
  const used = new Set<string>();
  const files = want.map((w, i): ExportedFile => {
    let steps = w.steps ?? [];
    let warnings: string[] = [];
    if (!steps.length && w.rundown?.length) ({ steps, warnings } = patchSteps(null, w.rundown, null, library)); // e.g. made before 0005
    if (!steps.length) throw new Error(`${w.name} has nothing to export`);
    let file = fitFileName(w.name);
    for (let n = 2; used.has(file); n++) file = file.replace(/(_\d+)?\.fit$/, `_${n}.fit`);
    used.add(file);
    // unique serial + time_created per file, or the watch overwrites one workout with another
    const data = buildWorkoutFit(w.name, steps, { serial: randomSerial(), createdMs: base + i * 60_000 });
    return { workout_id: w.id, name: w.name, version: w.version, file, data, warnings };
  });
  const { error: e2 } = await sb.from("garmin_exports").upsert(
    files.map((f) => ({ user_id: userId, workout_id: f.workout_id, version: f.version, exported_at: new Date().toISOString() })),
    { onConflict: "user_id,workout_id" },
  );
  if (e2) throw e2;
  return files;
}
