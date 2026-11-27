import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadAll } from "@/lib/actions";
import { exportWorkouts } from "@/lib/garmin/export";
import { watchToDo } from "@/lib/garmin/status";
import { zipFiles } from "@/lib/garmin/zip";

// GET /api/garmin?id=<workout id>        one .fit
// GET /api/garmin?ids=<id>,<id>          a .zip
// GET /api/garmin?todo=1                 a .zip of everything the watch is missing (changed or in the plan)
// Each download records the version, so the app knows when the watch is out of date.
export async function GET(req: Request) {
  const sb = await createClient();
  const { data: claims } = await sb.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const q = new URL(req.url).searchParams;
  let ids = q.get("id") ? [q.get("id")!] : (q.get("ids") ?? "").split(",").filter(Boolean);
  if (q.get("todo")) ids = watchToDo(await loadAll(sb, userId)).map((w) => w.id);
  if (!ids.length) return NextResponse.json({ error: "Nothing to download - the watch is up to date." }, { status: 404 });

  try {
    const files = await exportWorkouts(sb, userId, ids.slice(0, 60));
    if (!files.length) return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    const one = files.length === 1 && q.get("id");
    const body = one ? files[0].data : zipFiles(files.map((f) => ({ name: f.file, data: f.data })));
    const name = one ? files[0].file : `cairn-garmin-${new Date().toISOString().slice(0, 10)}.zip`;
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": one ? "application/octet-stream" : "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("garmin export failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
