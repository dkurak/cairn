import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addPainArea, loadAll, logEntries, markDone, savePainCheck, setPhase, setTravel, skipUpNext, startNextWeek, clampPain } from "@/lib/actions";
import { activePlan, checksFor, doneMap, itemWorkoutIds, primaryArea, sortedLog, todayISO, tours, upNext } from "@/lib/rules";
import type { Proposal } from "@/lib/proposals";
import { isGarminExercise, patchSteps, type GarminHint, type GarminStep } from "@/lib/garmin/steps";
import { watchStatus } from "@/lib/garmin/status";
import { FEELS, PAIN_SCALE, type AppData, type Feel, type PlanItem } from "@/lib/types";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY (server only)

/** Every workout the person can see, in full, so the coach can read and edit them exactly. */
function libraryText(data: AppData) {
  const usedIn = (id: string) =>
    data.plans.flatMap((pl) => pl.items.filter((i) => i.workout_ids.includes(id)).map((i) => `${pl.kind} ${i.day}`));
  const ws = data.workouts.map((w) => {
    const who = w.owner_id === null ? "shared" : w.owner_id === data.profile.id ? "theirs" : "other";
    const used = usedIn(w.id);
    const ws = watchStatus(w, data);
    const watch = ws.kind === "update" ? `, v${w.version} - watch has v${ws.onWatch}` : ws.kind === "current" ? `, v${w.version} on watch` : `, v${w.version} not on watch`;
    const blocks = (w.rundown ?? []).map((b) =>
      `  [${b.label ?? "list"}]\n` + b.rows.map((r) => `    - ${r[0]} | ${r[1]}${r[2] ? ` | ${r[2]}` : ""}`).join("\n"),
    ).join("\n");
    return `### ${w.name} (${w.category}, ${who}${watch})${used.length ? ` - in plan: ${used.join(", ")}` : ""}
${w.notes ? `  notes: ${w.notes}\n` : ""}${blocks || "  (no rundown)"}`;
  });
  return `WORKOUT LIBRARY - the full current content of every workout they can use. Rows are "exercise | sets_reps | tip". Block labels like "Circuit · 3 rounds" are set/circuit tiles; "list" means no label.
${ws.join("\n\n")}`;
}

function systemPrompt(data: AppData) {
  const { state, workouts, profile, areas, checks } = data;
  const n = upNext(data);
  const wName = (id: string) => workouts.find((w) => w.id === id)?.name ?? id;
  const upNextWorkouts =
    n.type === "calm" || n.type === "item"
      ? itemWorkoutIds(n.item, workouts, data.log).map((id) => {
          const w = workouts.find((x) => x.id === id);
          return { [w?.name ?? id]: w?.rundown };
        })
      : [];
  const plan = activePlan(data);
  const recent = sortedLog(data.log)
    .slice(0, 25)
    .map((e) => ({ date: e.date, kind: e.kind, what: e.what, vert_ft: e.vert_ft, pain_during: e.pain_during, pain_next_am: e.pain_next_am, feel: e.feel, notes: e.notes }));
  const pain = areas.map((a) => ({
    area: a.name, primary: a.is_primary, active: a.active,
    last_checks: checksFor(checks, a.id).slice(0, 14).map((c) => `${c.date}: ${c.pain}${c.note ? ` (${c.note})` : ""}`),
  }));
  const touring = !!plan?.items.some((i) => i.kind === "tour") || tours(data.log).length > 0;
  const today = todayISO();
  return `You are the Cairn coach, the assistant inside ${profile.display_name}'s workout log. Be brief, casual and practical (1-3 short sentences or bullets). Use "-" never em dashes. You are not a doctor.
Today is ${today} (${new Date().toLocaleDateString("en-US", { weekday: "long" })}).
Cairn covers all training (strength, full body, travel, surf prep, rehab). Working out supports being outside.
Pain rule: keep pain at 3/10 or less during anything. Scale: ${PAIN_SCALE}.
Tracked pain areas and recent daily checks (0-10): ${JSON.stringify(pain)}
${touring ? "Tours: start at 1,000-1,500 ft, then +20-25%/week only if the primary area is 0 the next morning (pain during > 3 means step back; next-morning pain > 0 means hold). Calm phase (no tours) lasts until the primary area is 3 or less." : ""}
The full workout library is above (WORKOUT LIBRARY). You can also log free text like Run, Bike, Hike, Tour, Rest.
Role: ${profile.role}. ${profile.role === "admin" ? "As admin, saving a change to a shared workout updates it for everyone." : "Changing a shared workout saves their own version and swaps it into their plan; the shared one is untouched."}
Plan (${state.travel ? "travel mode ON" : "home"}): ${plan?.items.length ? plan.items.map((i) => `${i.key} ${i.day}: ${i.title} [${i.workout_ids.map(wName).join(", ")}]`).join("; ") : "EMPTY - no weekly plan yet"}.
Travel info: ${state.travel ? JSON.stringify(state.travel_info) : "not traveling"}.
Phase: ${state.phase}. Week ${state.week}. Done: ${JSON.stringify(doneMap(state))}.
Up next: ${n.type === "item" || n.type === "calm" ? `${n.item.key} ${n.item.title}` : n.type === "empty" ? "no plan yet" : "week complete"}. Details: ${JSON.stringify(upNextWorkouts)}
Recent log (newest first): ${JSON.stringify(recent)}

How to work:
- Reports of something done or a pain number: call the matching tool, then confirm in one line. If a number is missing, log what you have and ask for it. Never invent numbers.
- When they mention pain somewhere new, call add_pain_area, then ask for today's 0-10 (call pain_check once they answer). Ask how it's trending when it helps.
- Workouts: answer questions about any workout from the library above - never guess its content. To change one, call propose_workout with base_workout set to its exact name and the FULL new rundown: copy every row you are not changing word for word (same exercise, sets_reps and tip text, same block labels and order) so the diff only shows real changes. Keep its notes unless the change is to the notes. Use save_as 'copy' only when they want a separate variant. For a brand new workout, omit base_workout. The person sees a diff card and taps Save; nothing saves until they do, so never say it's saved. Base changes on their pain trend and log. To change the weekly plan, call propose_plan_change with workouts that already exist; if one is new, propose it first. Keep proposals small and explain why in one line.
- Garmin: workouts run on their watch from .fit files they download in the Library ("Update watch"). Each workout shows its version and what the watch has. After a saved change, remind them once to update the watch. If propose_workout returns garmin_warnings, mention the important ones in a few words.
- ${plan?.items.length ? "" : "They have no plan yet: ask 2-3 short questions (goal, pain areas, equipment, days per week), then propose a starter week."}
- Travel: when they say they're traveling (gear: gym or bodyweight, jog yes/no, return date), call propose_plan_change with kind 'travel'. Bodyweight: use TRV1-TRV3 style workouts that exist. Gym: you can use CC/EZ2/EZ1 from the library. Jogging: add an easy run item with no workouts (e.g. title 'Easy run 20-30 min', note pace/RPE, keep pain <= 3). Size the number of items to the trip length when known. TRV4 Drive Reset is for drive/flight days. Mention the return date in your reply.
- Plan items with no workouts (like an easy run or a rest day) are fine: describe them in title and note.
- Red flags (pain at rest or at night, catching or clicking deep in a joint, numbness, limping that won't settle) -> suggest PT or sports med.`;
}

const rowSchema = {
  type: "object",
  properties: {
    exercise: { type: "string" },
    sets_reps: { type: "string", description: "e.g. '3 x 12 each side @ 20 lb' or '40s'" },
    tip: { type: "string", description: "swap/cue/limit, e.g. 'swap to dead bug if shoulder >3/10'. Start with 'Ramp: 5 @ 95, 5 @ 115.' for warm-up sets." },
    garmin: { type: "string", description: "Only for an exercise that is not already in the library: Garmin exercise as CATEGORY/NAME from the FIT profile, e.g. 'SQUAT/GOBLET_SQUAT', 'CRUNCH/BICYCLE_CRUNCH'." },
  },
  required: ["exercise", "sets_reps"],
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_session",
    description: "Log a workout, tour or rest day. Set completes_up_next true when it is the 'Up next' plan item so the plan advances. For a plan item with several workouts, call once per workout and set completes_up_next only once.",
    input_schema: {
      type: "object",
      properties: {
        what: { type: "string", description: "Workout name from the library, 'Tour', 'Rest', or short free text like 'Run'" },
        date: { type: "string", description: "YYYY-MM-DD, default today" },
        pain_during: { type: "integer", minimum: 0, maximum: 10 },
        feel: { type: "string", enum: [...FEELS] },
        vert_ft: { type: "integer", description: "Tours only" },
        notes: { type: "string" },
        completes_up_next: { type: "boolean" },
      },
      required: ["what"],
    },
  },
  {
    name: "pain_check",
    description: "Record today's (or a given day's) 0-10 pain for one tracked area, e.g. 'Right hip flexor' or 'Low back'. Creates the area if it isn't tracked yet. Also fills a tour's next-morning pain when it is the primary area.",
    input_schema: { type: "object", properties: { area: { type: "string" }, pain: { type: "integer", minimum: 0, maximum: 10 }, date: { type: "string" }, note: { type: "string" } }, required: ["area", "pain"] },
  },
  {
    name: "add_pain_area",
    description: "Start tracking a body area that hurts (or turn it back on). The first area becomes the primary one unless primary is false.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "e.g. 'Left shoulder', 'Low back'" }, primary: { type: "boolean" } }, required: ["name"] },
  },
  {
    name: "propose_workout",
    description: "Suggest a new workout or a change to an existing one (exercises, sets/reps, weights, tips, notes, name, category, set/circuit grouping). Shows a diff card; nothing is saved until the person taps Save. Give the FULL new workout, not just the changes.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the new/updated workout" },
        base_workout: { type: "string", description: "Exact name of the existing workout this changes (from the library). Omit for a brand new workout." },
        save_as: { type: "string", enum: ["update", "copy"], description: "'update' (default) changes base_workout; 'copy' saves a separate new workout based on it." },
        category: { type: "string", description: "Short code like REHAB, STR, EZ, CC" },
        reason: { type: "string", description: "One line on why (tie to their pain/log)" },
        notes: { type: "string" },
        blocks: {
          type: "array",
          description: "Display tiles. A block with a label is a set/circuit tile (e.g. 'Circuit · 3 rounds'); omit label for a plain list.",
          items: { type: "object", properties: { label: { type: "string" }, rows: { type: "array", items: rowSchema } }, required: ["rows"] },
        },
      },
      required: ["name", "reason", "blocks"],
    },
  },
  {
    name: "propose_plan_change",
    description: "Suggest a replacement weekly plan (home or travel). Shows a card; nothing is saved until the person taps Save. Every workout named must already exist in their library or be saved first. Give the FULL plan.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["home", "travel"] },
        reason: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "string", description: "Mon, Tue, ... or a label" },
              title: { type: "string" },
              workouts: { type: "array", items: { type: "string" }, description: "Existing workout names" },
              kind: { type: "string", enum: ["workout", "tour", "rest"] },
              note: { type: "string" },
            },
            required: ["day", "title"],
          },
        },
      },
      required: ["kind", "reason", "items"],
    },
  },
  {
    name: "set_phase",
    description: "Switch between 'calm' (no tours) and 'build' (weekly plan). Only when asked or clearly qualified.",
    input_schema: { type: "object", properties: { phase: { type: "string", enum: ["calm", "build"] } }, required: ["phase"] },
  },
  {
    name: "set_travel",
    description: "Turn travel mode on (hotel set) or off (back to the home plan).",
    input_schema: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] },
  },
  { name: "skip_up_next", description: "Skip the current Up next plan item without logging it.", input_schema: { type: "object", properties: {} } },
  { name: "start_next_week", description: "Clear the checklist and start the next week.", input_schema: { type: "object", properties: {} } },
];

type Input = Record<string, unknown>;

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: claims } = await sb.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  const userText = (body?.text ?? "").trim().slice(0, 2000);
  if (!userText) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // save the user's message first, then rebuild the conversation from the database
  // so the coach remembers earlier chats (and other devices)
  const stamp = (i: number) => new Date(Date.now() + i).toISOString();
  const { error: insErr } = await sb.from("coach_messages").insert({ user_id: userId, role: "user", content: userText, created_at: stamp(0) });
  if (insErr) return NextResponse.json({ error: "Couldn't save that message" }, { status: 500 });
  const { data: past } = await sb.from("coach_messages").select("role, content").eq("user_id", userId).in("role", ["user", "assistant"]).is("proposal", null).neq("content", "").order("created_at", { ascending: false }).limit(14);
  const history = (past ?? []).reverse() as { role: "user" | "assistant"; content: string }[];
  while (history.length && history[0].role !== "user") history.shift();

  const actions: string[] = [];
  const proposals: Proposal[] = [];
  let data = await loadAll(sb, userId);

  async function runTool(name: string, i: Input): Promise<unknown> {
    switch (name) {
      case "log_session": {
        const date = typeof i.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : todayISO();
        await logEntries(sb, data, [{
          what: String(i.what),
          date,
          pain_during: Number.isInteger(i.pain_during) ? clampPain(i.pain_during) : null,
          feel: FEELS.includes(i.feel as Feel) ? (i.feel as Feel) : null,
          vert_ft: i.vert_ft ? Number(i.vert_ft) : null,
          notes: i.notes ? String(i.notes) : "",
        }]);
        let advanced = false;
        const n = upNext(data);
        if (i.completes_up_next && n.type === "item") {
          await markDone(sb, data.state, n.item.key, date);
          advanced = true;
        }
        actions.push(`Logged: ${i.what}${Number.isInteger(i.pain_during) ? ` · pain ${clampPain(i.pain_during)}/10` : ""}${advanced ? " · up next moved on" : ""}`);
        return { ok: true, advanced };
      }
      case "pain_check": {
        const p = clampPain(i.pain);
        const areaId = await addPainArea(sb, userId!, String(i.area));
        await savePainCheck(sb, userId!, areaId, p, typeof i.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : undefined, typeof i.note === "string" ? i.note.slice(0, 200) : undefined);
        actions.push(`${i.area}: ${p}/10`);
        return { ok: true };
      }
      case "add_pain_area": {
        await addPainArea(sb, userId!, String(i.name), i.primary === true);
        actions.push(`Tracking: ${i.name}`);
        return { ok: true };
      }
      case "propose_workout": {
        const baseName = typeof i.base_workout === "string" ? i.base_workout.trim() : "";
        const base = baseName ? data.workouts.find((w) => w.name === baseName) ?? data.workouts.find((w) => w.name.toLowerCase() === baseName.toLowerCase()) : undefined;
        if (baseName && !base) return { ok: false, reason: `No workout named "${baseName}". Use an exact name from the library, or omit base_workout for a new one.` };
        const blocks = (Array.isArray(i.blocks) ? i.blocks : []).slice(0, 12).map((b: any) => ({
          ...(b.label ? { label: String(b.label).slice(0, 80) } : {}),
          rows: (Array.isArray(b.rows) ? b.rows : []).slice(0, 20).map((r: any) => [String(r.exercise ?? "").slice(0, 80), String(r.sets_reps ?? "").slice(0, 80), String(r.tip ?? "").slice(0, 200)] as [string, string, string]),
        }));
        if (!blocks.length) return { ok: false, reason: "need at least one block of rows" };
        // keep the watch version in step: rebuild only the rows that changed
        const hints: Record<string, GarminHint> = {};
        const badHints: string[] = [];
        for (const b of (Array.isArray(i.blocks) ? i.blocks : []) as any[]) for (const r of (Array.isArray(b?.rows) ? b.rows : [])) {
          const [cat, nm] = String(r?.garmin ?? "").toUpperCase().split("/").map((x) => x.trim());
          if (!cat) continue;
          if (isGarminExercise(cat, nm ?? "")) hints[String(r.exercise)] = { category: cat, name: nm };
          else badHints.push(`${r.exercise}: ${r.garmin}`);
        }
        const { data: stepRows } = await sb.from("workouts").select("id, steps");
        const stepsOf = new Map((stepRows ?? []).map((r: { id: string; steps: GarminStep[] | null }) => [r.id, r.steps ?? []]));
        const garmin = patchSteps(base?.rundown ?? null, blocks, base ? stepsOf.get(base.id) ?? [] : null, [...stepsOf.values()].filter((x) => x.length), hints);
        const garmin_warnings = [...badHints.map((h) => `${h} is not a Garmin exercise`), ...garmin.warnings];
        proposals.push({ type: "workout", reason: String(i.reason ?? "").slice(0, 300), base_id: base?.id ?? null, mode: i.save_as === "copy" ? "copy" : "update", name: String(i.name || base?.name || "").slice(0, 60), category: String(i.category || base?.category || "CUSTOM").slice(0, 12).toUpperCase(), notes: String(typeof i.notes === "string" ? i.notes : base?.notes ?? "").slice(0, 1000), blocks, steps: garmin.steps, garmin_warnings });
        return { ok: true, note: "Shown to the person as a card. It is NOT saved until they tap Save. Once saved, the Library shows 'Update watch' for it.", ...(garmin_warnings.length ? { garmin_warnings } : {}) };
      }
      case "propose_plan_change": {
        const items: PlanItem[] = [];
        const missing: string[] = [];
        (Array.isArray(i.items) ? i.items : []).slice(0, 14).forEach((it: any, idx: number) => {
          const ids = (Array.isArray(it.workouts) ? it.workouts : []).map((n: string) => {
            const w = data.workouts.find((x) => x.name === n);
            if (!w) missing.push(n);
            return w?.id ?? "";
          }).filter(Boolean);
          const kind = it.kind === "tour" || it.kind === "rest" ? it.kind : "workout";
          items.push({ key: `p${idx + 1}`, day: String(it.day ?? "").slice(0, 20), title: String(it.title ?? "").slice(0, 80), workout_ids: ids, kind, note: String(it.note ?? "").slice(0, 300) });
        });
        if (missing.length) return { ok: false, reason: `These workouts don't exist yet: ${[...new Set(missing)].join(", ")}. Propose them with propose_workout first (or use existing names).` };
        if (!items.length) return { ok: false, reason: "need at least one item" };
        proposals.push({ type: "plan", reason: String(i.reason ?? "").slice(0, 300), kind: i.kind === "travel" ? "travel" : "home", items });
        return { ok: true, note: "Shown to the person as a card. It is NOT saved until they tap Save." };
      }
      case "set_phase":
        await setPhase(sb, data.state, i.phase === "build" ? "build" : "calm");
        actions.push(`Phase: ${i.phase === "build" ? "build" : "calm-down"}`);
        return { ok: true };
      case "set_travel":
        await setTravel(sb, data.state, !!i.on);
        actions.push(i.on ? "Travel mode on" : "Back to the home plan");
        return { ok: true };
      case "skip_up_next": {
        const t = await skipUpNext(sb, data);
        if (t) actions.push(`Skipped: ${t}`);
        return t ? { ok: true } : { ok: false, reason: "nothing to skip" };
      }
      case "start_next_week":
        await startNextWeek(sb, data.state);
        actions.push("New week started");
        return { ok: true };
      default:
        return { ok: false, reason: "unknown tool" };
    }
  }

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  try {
    let text = "";
    for (let turn = 0; turn < 6; turn++) {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: [
          { type: "text", text: libraryText(data), cache_control: { type: "ephemeral" } },
          { type: "text", text: systemPrompt(data) },
        ],
        tools: TOOLS,
        messages,
        output_config: { effort: "low" },
      });
      if (res.stop_reason === "refusal") return NextResponse.json({ rows: [{ id: `r${Date.now()}`, role: "assistant", content: "I can't help with that one.", proposal: null, proposal_status: null, created_at: stamp(1) }] });
      text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
      if (res.stop_reason !== "tool_use") break;
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of res.content) {
        if (b.type !== "tool_use") continue;
        try {
          results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await runTool(b.name, b.input as Input)) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: e instanceof Error ? e.message : "failed" });
        }
        data = await loadAll(sb, userId); // fresh state for the next tool / turn
      }
      messages.push({ role: "user", content: results });
    }
    const reply = text || "Done.";
    const toInsert = [
      ...actions.map((a) => ({ role: "act", content: a })),
      { role: "assistant", content: reply },
      ...proposals.map((p) => ({ role: "assistant", content: "", proposal: p, proposal_status: "open" })),
    ].map((r, i) => ({ user_id: userId, ...r, created_at: stamp(i + 1) }));
    const { data: rows } = await sb.from("coach_messages").insert(toInsert).select("id, role, content, proposal, proposal_status, created_at");
    return NextResponse.json({ rows: rows ?? [] });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Too many messages at once. Give it a minute." }, { status: 429 });
    console.error("chat failed", e);
    return NextResponse.json({ error: "Couldn't reach the coach. Try again." }, { status: 502 });
  }
}
