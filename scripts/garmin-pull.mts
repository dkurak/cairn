/**
 * Pull the latest Garmin .fit files from Cairn to copy onto the watch.
 *   npm run garmin:pull               what the watch is missing (changed, or in your plan and never downloaded)
 *   npm run garmin:pull -- --all      every workout you can use
 *   npm run garmin:pull -- SKI1 CC05  just these (name starts with)
 * Options: --out <dir> (default garmin/out), --email <user> (default ADMIN_EMAIL), --dry-run.
 * Marks the files as on your watch, same as downloading them in the app. Uses the service role key.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAll } from "../src/lib/actions.ts";
import { exportWorkouts } from "../src/lib/garmin/export.ts";
import { watchStatus, watchToDo } from "../src/lib/garmin/status.ts";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const flag = (k: string) => { const i = args.indexOf(k); return i >= 0 ? (args.splice(i, 1), true) : false; };
const out = opt("--out") ?? "garmin/out";
const email = (opt("--email") ?? process.env.ADMIN_EMAIL ?? "").toLowerCase();
const all = flag("--all");
const dry = flag("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !email) throw new Error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ADMIN_EMAIL (or --email) in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false } });

let userId: string | undefined;
for (let page = 1; !userId; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (data.users.length < 200) break;
}
if (!userId) throw new Error(`No user ${email}`);

const data = await loadAll(sb, userId);
data.workouts = data.workouts.filter((w) => w.owner_id === null || w.owner_id === userId); // service key sees everyone's
const pick = args.length
  ? data.workouts.filter((w) => args.some((a) => w.name.toLowerCase().startsWith(a.toLowerCase())))
  : all ? data.workouts : watchToDo(data);

if (!pick.length) { console.log("Watch is up to date. (--all to pull everything)"); process.exit(0); }
for (const w of pick) {
  const s = watchStatus(w, data);
  console.log(`  ${w.name.padEnd(22)} v${w.version}  ${s.kind === "update" ? `(watch has v${s.onWatch})` : s.kind === "none" ? "(not on watch)" : "(on watch)"}`);
}
if (dry) process.exit(0);

const files = await exportWorkouts(sb, userId, pick.map((w) => w.id));
mkdirSync(out, { recursive: true });
for (const f of files) {
  writeFileSync(join(out, f.file), f.data);
  for (const w of f.warnings) console.log(`  ! ${f.name}: ${w}`);
}
console.log(`\nWrote ${files.length} file(s) to ${out}/. Copy them to GARMIN/NewFiles on the watch.`);
