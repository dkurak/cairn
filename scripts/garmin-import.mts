/**
 * Import Garmin activities (from scripts/garmin_sessions.py output) for the admin user.
 *   npm run garmin:import            dry run: prints what it would do
 *   npm run garmin:import -- --apply writes it
 * Skiing, running, biking, hiking, swimming become log entries (notes start with "Garmin"); anything the log already has
 * for that day is left alone. Gym strength / overlanding / fishing stay in the activities table only (migration 0010).
 * Safe to re-run. Private data: data/garmin-export is git-ignored.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const file = process.argv.find((a) => a.endsWith(".json")) ?? "data/garmin-export/activities.json";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
type Act = { id: string; date: string; local: string | null; utc: string | null; sport: number | null; sub: number | null; name: string | null; seconds: number | null; meters: number | null; ascent_m: number | null; descent_m: number | null; avg_hr: number | null; max_hr: number | null; calories: number | null };
const acts: Act[] = JSON.parse(readFileSync(file, "utf8"));

const MAP: Record<string, { kind: "workout" | "tour"; what: string }> = {
  "Backcountry Ski": { kind: "tour", what: "Tour" }, Ski: { kind: "workout", what: "Resort ski" }, MTB: { kind: "workout", what: "Bike" },
  Run: { kind: "workout", what: "Run" }, "Trail Run": { kind: "workout", what: "Trail run" }, Hike: { kind: "workout", what: "Hike" },
  "Open Water": { kind: "workout", what: "Swim" }, Cardio: { kind: "workout", what: "Cardio" }, Tennis: { kind: "workout", what: "Tennis" },
};
const ft = (m: number) => Math.round(m * 3.28084);
const notesFor = (a: Act, what: string) => {
  const bits = ["Garmin"];
  if (a.seconds) bits.push(`${Math.round(a.seconds / 60)} min`);
  if (a.meters && a.meters > 200) bits.push(`${(a.meters / 1609.34).toFixed(1)} mi`);
  if (what === "Resort ski") { if (a.descent_m) bits.push(`${ft(a.descent_m).toLocaleString("en-US")} ft down`); }
  else if (a.ascent_m && a.ascent_m > 15) bits.push(`${ft(a.ascent_m).toLocaleString("en-US")} ft up`);
  if (a.avg_hr) bits.push(`avg HR ${a.avg_hr}`);
  if (what === "Bike") bits.splice(1, 0, "mountain bike");
  return bits.join(" · ");
};

const { data: users } = await sb.auth.admin.listUsers();
const uid = users!.users.find((u) => u.email === process.env.ADMIN_EMAIL)!.id;
const { data: log } = await sb.from("log_entries").select("id,date,kind,what,notes,vert_ft").eq("user_id", uid);
const have = log ?? [];

const toInsert: Record<string, unknown>[] = [];
const skipped: string[] = [];
const fills: { id: string; vert_ft: number }[] = [];
const links = new Map<string, string>(); // activity id -> existing log entry id
for (const a of acts) {
  const m = MAP[a.name ?? ""];
  if (!m) continue;
  const same = have.find((e) => e.date === a.date && (m.kind === "tour" ? e.kind === "tour" : e.what.toLowerCase() === m.what.toLowerCase()));
  if (same) {
    links.set(a.id, same.id);
    skipped.push(`${a.date} ${m.what} (already logged)`);
    if (m.kind === "tour" && same.vert_ft == null && a.ascent_m) fills.push({ id: same.id, vert_ft: ft(a.ascent_m) });
    continue;
  }
  toInsert.push({ user_id: uid, date: a.date, kind: m.kind, workout_id: null, what: m.what, notes: notesFor(a, m.what), vert_ft: m.kind === "tour" && a.ascent_m ? ft(a.ascent_m) : null, _act: a.id });
}
const byWhat: Record<string, number> = {};
for (const r of toInsert) byWhat[r.what as string] = (byWhat[r.what as string] ?? 0) + 1;
const strengthDupes = acts.filter((a) => a.name === "Strength" && have.some((e) => e.date === a.date && e.kind === "workout")).map((a) => a.date);
console.log(`${acts.length} activities. New log entries: ${toInsert.length}`, byWhat);
console.log(`Already in your log (left alone): ${skipped.length}`, skipped.join("; ") || "");
console.log(`Gym strength sessions kept out of the log: ${acts.filter((a) => a.name === "Strength").length} (${strengthDupes.length} on days you also logged a workout)`);
console.log(`Not training, kept in activities only: ${acts.filter((a) => ["Overland", "Fish"].includes(a.name ?? "")).length}`);
if (fills.length) console.log("Will fill missing tour vert on", fills.length, "existing entr" + (fills.length > 1 ? "ies" : "y"));
if (!apply) { console.log("\nDry run. Add --apply to write."); process.exit(0); }

const clean = toInsert.map(({ _act, ...r }) => r);
const ids = new Map<string, string>();
for (let i = 0; i < clean.length; i += 100) {
  const { data, error } = await sb.from("log_entries").insert(clean.slice(i, i + 100)).select("id");
  if (error) throw error;
  data!.forEach((d, k) => ids.set(toInsert[i + k]._act as string, d.id));
}
for (const f of fills) await sb.from("log_entries").update({ vert_ft: f.vert_ft }).eq("id", f.id);
console.log("log entries written:", clean.length);

const probe = await sb.from("activities").select("id").limit(1);
if (probe.error) { console.log("activities table not there yet (run migration 0010, then re-run this) - skipped"); process.exit(0); }
const rows = acts.map((a) => ({ user_id: uid, source: "garmin", external_id: a.id, date: a.date, started_at: a.utc, sport: a.sport, sub_sport: a.sub, name: a.name ?? "", seconds: a.seconds != null ? Math.round(a.seconds) : null, meters: a.meters, ascent_m: a.ascent_m, descent_m: a.descent_m, avg_hr: a.avg_hr, max_hr: a.max_hr, calories: a.calories, log_entry_id: ids.get(a.id) ?? links.get(a.id) ?? null }));
for (let i = 0; i < rows.length; i += 100) { const { error } = await sb.from("activities").upsert(rows.slice(i, i + 100), { onConflict: "user_id,source,external_id" }); if (error) throw error; }
console.log("activities saved:", rows.length);
