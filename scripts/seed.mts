/**
 * Seed Cairn: shared workouts, the admin user's plans and their history.
 * Run after applying supabase/migrations 0001 and 0002:  npm run seed
 * Safe to re-run: existing rows are updated or skipped. Uses the service role key (server only).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminEmail = process.env.ADMIN_EMAIL!;
if (!url || !key || !adminEmail) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ADMIN_EMAIL in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false } });
const json = (p: string) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), "utf8"));
const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

type RawWorkout = { name: string; category: string; steps: any[] };
const rundowns: Record<string, unknown> = json("workout_rundowns.json");

// ---------- 1. shared workouts ----------
function findStep(steps: any[], re: RegExp): any | undefined {
  for (const s of steps) {
    if (s.type === "exercise" && re.test(s.title ?? "")) return s;
    if (s.type === "repeat") { const f = findStep(s.steps, re); if (f) return f; }
  }
}

async function seedWorkouts() {
  const raw: RawWorkout[] = json("workouts.json");
  const ski1 = raw.find((w) => w.name === "SKI1 Hip Strength")!;
  const wall = findStep(ski1.steps, /wall march/i);
  const rows = raw.map((w) => ({ name: w.name, category: w.category, steps: w.steps, rundown: rundowns[w.name] ?? null, notes: "", owner_id: null }));
  rows.push({
    name: "Wall march holds",
    category: "SKI",
    steps: wall ? [wall] : [],
    rundown: rundowns["Wall march holds"] ?? null,
    notes: "Calm-down: this is the whole session",
    owner_id: null,
  });
  const existing = must(await sb.from("workouts").select("id, name").is("owner_id", null), "read workouts");
  const have = new Map(existing.map((w) => [w.name, w.id]));
  const toInsert = rows.filter((r) => !have.has(r.name));
  if (toInsert.length) must(await sb.from("workouts").insert(toInsert).select("id"), "insert workouts");
  for (const r of rows.filter((r) => have.has(r.name)))
    must(await sb.from("workouts").update({ steps: r.steps, rundown: r.rundown, category: r.category }).eq("id", have.get(r.name)!).select("id"), `update ${r.name}`);
  const all = must(await sb.from("workouts").select("id, name").is("owner_id", null), "reread workouts");
  console.log(`workouts: ${toInsert.length} new, ${rows.length - toInsert.length} updated`);
  return new Map(all.map((w) => [w.name, w.id]));
}

// ---------- 2. Dave's plan definitions (copied to his user only; new members start empty) ----------
const TRAVEL_NOTE = "Drive or flight day: TRV4 Drive Reset at every stop. Missed a day? Just do what's next.";
function planDefs(id: Map<string, string>) {
  const ids = (...names: string[]) => names.map((n) => { const v = id.get(n); if (!v) throw new Error(`missing workout ${n}`); return v; });
  const plans = [
    {
      name: "Home week", kind: "home",
      items: [
        { key: "r1", day: "Mon", title: "SKI1 Hip Strength + EZ1 Upper Core", workout_ids: ids("SKI1 Hip Strength", "EZ1 Upper Core"), kind: "workout", note: "Rehab first, then easy upper body." },
        { key: "r2", day: "Tue", title: "CC Combo", workout_ids: ids("CC01 Combo", "CC05 Combo", "CC10 Combo", "CC15 Combo", "CC20 Combo"), cycle: true, kind: "workout", note: "Next CC in line. Use the hip swaps on crunch and tuck moves." },
        { key: "r3", day: "Wed", title: "SKI2 Hip Endurance", workout_ids: ids("SKI2 Hip Endurance"), kind: "workout", note: "Build the weighted march toward 3:00." },
        { key: "r4", day: "Thu", title: "EZ2 Light Full Body", workout_ids: ids("EZ2 Light Full Body"), kind: "workout", note: "Easy. RPE 5. Rest is fine too." },
        { key: "r7", day: "Fri", title: "Rest day", workout_ids: ids("SKI3 Mobility Recov"), kind: "rest", note: "Recover for the weekend. Optional: SKI3 Mobility Recov or an easy walk. Tap Done to log it." },
        { key: "r5", day: "Sat", title: "Tour", workout_ids: ids("SKI4 Trailhead", "SKI3 Mobility Recov"), kind: "tour", note: "SKI4 at the trailhead, SKI3 that evening." },
        { key: "r6", day: "Sun", title: "SKI1 Hip Strength", workout_ids: ids("SKI1 Hip Strength"), kind: "workout", note: "Or rest if the tour left pain the next morning." },
      ],
    },
    {
      name: "Travel", kind: "travel",
      items: [
        { key: "t1", day: "Hotel", title: "TRV1 Hotel Hip", workout_ids: ids("TRV1 Hotel Hip"), kind: "workout", note: `Hip rehab, no gym needed. Pack the 5 lb ankle weights if you can. ${TRAVEL_NOTE}` },
        { key: "t2", day: "Hotel", title: "TRV2 Hotel Full Body", workout_ids: ids("TRV2 Hotel Full Body"), kind: "workout", note: `Bodyweight, CC-style 40s on / 20s off. Hotel gym? Do a CC or EZ2 instead. ${TRAVEL_NOTE}` },
        { key: "t3", day: "Hotel", title: "TRV1 Hotel Hip", workout_ids: ids("TRV1 Hotel Hip"), kind: "workout", note: `Second hip session of the trip. ${TRAVEL_NOTE}` },
        { key: "t4", day: "Hotel", title: "TRV3 Hotel Upper", workout_ids: ids("TRV3 Hotel Upper"), kind: "workout", note: `Legs off. Hotel gym? EZ1 works too. ${TRAVEL_NOTE}` },
      ],
    },
    {
      name: "Calm-down", kind: "calm",
      items: [
        { key: "c1", day: "Today", title: "Wall march holds + EZ1 Upper Core", workout_ids: ids("Wall march holds", "EZ1 Upper Core"), kind: "workout", note: "Calm-down days. Wall march holds (from SKI1) and EZ1 Upper Core only. No tours, no hard stretching." },
      ],
    },
  ];
  return plans;
}

// ---------- 3. admin user ----------
async function ensureAdmin(defs: ReturnType<typeof planDefs>): Promise<string> {
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === adminEmail.toLowerCase())?.id;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({ email: adminEmail, email_confirm: true });
    if (error) throw error;
    userId = data.user.id; // signup trigger creates profile, an empty plan and plan_state
    console.log("created user (magic link login will work for this email)");
  }
  must(await sb.from("profiles").update({ role: "admin", display_name: "Dave" }).eq("id", userId).select("id"), "promote admin");

  // Dave's plans: update what exists (the trigger's empty "My week" is replaced), insert the rest
  const mine = must(await sb.from("plans").select("id, kind").eq("owner_id", userId), "read user plans");
  for (const d of defs) {
    const row = mine.find((m) => m.kind === d.kind);
    if (row) must(await sb.from("plans").update({ name: d.name, items: d.items }).eq("id", row.id).select("id"), `update ${d.kind}`);
    else must(await sb.from("plans").insert({ ...d, owner_id: userId }).select("id"), `insert ${d.kind}`);
  }
  const plans = must(await sb.from("plans").select("id, kind").eq("owner_id", userId), "reread user plans");
  const active = { active_home_plan_id: plans.find((p) => p.kind === "home")?.id, active_travel_plan_id: plans.find((p) => p.kind === "travel")?.id };
  const st = await sb.from("plan_state").select("user_id").eq("user_id", userId).maybeSingle();
  if (st.data) must(await sb.from("plan_state").update(active).eq("user_id", userId).select("user_id"), "plan_state");
  else must(await sb.from("plan_state").insert({ user_id: userId, ...active }).select("user_id"), "plan_state");
  console.log("plans: home, travel, calm");
  return userId;
}

// ---------- 4. history ----------
async function importHistory(userId: string, id: Map<string, string>) {
  const have = must(await sb.from("log_entries").select("id").eq("user_id", userId).limit(1), "check log");
  if (have.length) { console.log("history: log already has entries, skipping import"); return; }
  const h = json("history.json");

  // hip checks -> pain checks on a primary "Right hip flexor" area
  const found = must(await sb.from("pain_areas").select("id").eq("user_id", userId).ilike("name", "Right hip flexor").limit(1), "find hip area");
  const area = found[0] ?? must(await sb.from("pain_areas").insert({ user_id: userId, name: "Right hip flexor", is_primary: true }).select("id").single(), "hip area");
  const checks = h.log.filter((e: any) => e.what === "Hip check").map((e: any) => ({ user_id: userId, area_id: area.id, date: e.date, pain: e.pain }));
  if (checks.length) must(await sb.from("pain_checks").upsert(checks, { onConflict: "area_id,date" }).select("id"), "pain checks");

  const rows: any[] = [];
  let n = 0;
  const at = (date: string) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n++ * 60_000).toISOString();
  for (const e of h.log) {
    if (e.what === "Hip check") continue;
    const base = { user_id: userId, date: e.date, notes: e.notes ?? "", feel: e.feel ?? null, pain_during: e.painDuring ?? null, pain_next_am: e.painNextAm ?? null };
    if (e.what === "Tour") rows.push({ ...base, kind: "tour", what: "Tour", vert_ft: e.vert ?? null, created_at: at(e.date) });
    else if (e.what === "Rest") rows.push({ ...base, kind: "rest", what: "Rest", created_at: at(e.date) });
    else for (const name of String(e.what).split(" + ").map((x: string) => x.trim()))
      rows.push({ ...base, kind: "workout", what: name, workout_id: id.get(name) ?? null, created_at: at(e.date) });
  }
  must(await sb.from("log_entries").insert(rows).select("id"), "insert history");
  const ps = h.plan_state;
  must(await sb.from("plan_state").update({ phase: ps.phase, travel: ps.travel, week: ps.week, done: ps.done }).eq("user_id", userId).select("user_id"), "restore state");
  console.log(`history: ${rows.length} log rows + ${checks.length} hip checks, phase=${ps.phase}, week=${ps.week}`);
}

const ids = await seedWorkouts();
const userId = await ensureAdmin(planDefs(ids));
await importHistory(userId, ids);
console.log("seed complete");
