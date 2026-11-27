import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addPainArea, loadAll, setGoals, logEntries, markDone, savePainCheck, setPhase, setTravel, skipUpNext, startNextWeek, clampPain } from "@/lib/actions";
import { activePlan, checksFor, doneMap, itemWorkoutIds, primaryArea, sortedLog, todayISO, tours, upNext } from "@/lib/rules";
import type { PlanProposal, ProgramProposal, Proposal, WorkoutProposal } from "@/lib/proposals";
import { digest, digestLine } from "@/lib/review";
import { activeProgram, needsNewWeek, programLine, programPosition } from "@/lib/programs";
import { parseCriteria, parsePhases, parsePrefs, programChanges } from "@/lib/programInput";
import { isGarminExercise, patchSteps, type GarminHint, type GarminStep } from "@/lib/garmin/steps";
import { watchStatus } from "@/lib/garmin/status";
import { FEELS, PAIN_SCALE, type AppData, type Feel, type PlanItem, type ProgramStatus } from "@/lib/types";

export const maxDuration = 300; // building a week with new workouts can take a while

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
  return `You are the Cairn coach, the assistant inside ${profile.display_name}'s workout log. Casual and practical. Use "-" never em dashes. You are not a doctor.
Length: logging and quick answers 1-3 short lines. Check-ins, reviews and new programs can run longer (up to ~15 short lines), using **bold** section labels and "- " bullets.
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
Goals: ${profile.goals ? `"${profile.goals}" (set ${profile.goals_updated_at?.slice(0, 10) ?? "earlier"})` : "NOT SET YET - infer them from the log and ask them to confirm."}
Goal programs (one active drives the weekly plan; the rest are a bank): ${data.programs.length ? "\n- " + data.programs.map((p) => programLine(p, data)).join("\n- ") : "none yet"}
${(() => {
  const ap = activeProgram(data);
  const hp = data.plans.find((x) => x.kind === "home");
  if (!ap) return "No active program.";
  const due = needsNewWeek(data, hp);
  return `Home plan is ${hp?.program_id === ap.id ? `week ${hp.program_week} of "${ap.title}"` : `not written for "${ap.title}"`}.${due ? ` It's now week ${due.pos.week} (${due.pos.phase ?? "-"}): offer to build this week's plan.` : ""}`;
})()}
Training summary:
- ${[5, 14, 28].map((d) => digestLine(digest(data, d))).join("\n- ")}

How to work:
- Reports of something done or a pain number: call the matching tool, then confirm in one line. If a number is missing, log what you have and ask for it. Never invent numbers.
- When they mention pain somewhere new, call add_pain_area, then ask for today's 0-10 (call pain_check once they answer). Ask how it's trending when it helps.
- Workouts: answer questions about any workout from the library above - never guess its content. To change one, call propose_workout with base_workout set to its exact name and the FULL new rundown: copy every row you are not changing word for word (same exercise, sets_reps and tip text, same block labels and order) so the diff only shows real changes. Keep its notes unless the change is to the notes. Use save_as 'copy' only when they want a separate variant. For a brand new workout, omit base_workout. The person sees a diff card and taps Save; nothing saves until they do, so never say it's saved. Base changes on their pain trend and log. To change the weekly plan, call propose_plan_change (new workouts proposed in this conversation can be named and are bundled in). Explain why in one line.
- Garmin: workouts run on their watch from .fit files they download in the Library ("Update watch"). Each workout shows its version and what the watch has. After a saved change, remind them once to update the watch. If propose_workout returns garmin_warnings, mention the important ones in a few words.
- ${plan?.items.length ? "" : "They have no plan yet: ask 2-3 short questions (goal, pain areas, equipment, days per week), then propose a starter week."}
- Travel: when they say they're traveling (gear: gym or bodyweight, jog yes/no, return date), call propose_plan_change with kind 'travel'. Bodyweight: use TRV1-TRV3 style workouts that exist. Gym: you can use CC/EZ2/EZ1 from the library. Jogging: add an easy run item with no workouts (e.g. title 'Easy run 20-30 min', note pace/RPE, keep pain <= 3). Size the number of items to the trip length when known. TRV4 Drive Reset is for drive/flight days. Mention the return date in your reply.
- Plan items with no workouts (like an easy run or a rest day) are fine: describe them in title and note.
- Goals: when they tell you what they're training for (or confirm your guess), call set_goals with a short summary in their words (sport/event and date, priorities, limits like the hip, days per week, equipment). Update it when things change. Use the goals in every review and plan.
- Check-ins ("how am I doing", "check in", "review my week", the start of a new week, or after they describe what they've been doing): use the training summary (call review_training for other windows or more detail) and answer in three parts:
  **Last 5 days** - what they actually did: sessions, the focus split (strength / ski prep / circuits / easy / tours), pain and feel, gaps or streaks. Specific, with names and numbers.
  **vs your goals** - if goals are set, say plainly where it lines up and where it doesn't (e.g. no strength in 10 days, intensity piling up while hip pain rises, too little easy work). If goals aren't set, say what the pattern suggests ("Looks like you're building toward touring with hip-safe strength - is that right?") and ask them to confirm.
  **Next** - 2-3 concrete suggestions tied to their plan and library, and offer to turn them into a plan card. End with at most one question.
- Goal programs: when they name something to get ready for or work toward ("big ski day Jan 18", "beach next month, swim long distances", "ski all day anytime", "add a few pounds of muscle", "raise my max squat"), set up a program. First ask, in ONE short message, only what you can't infer: when is it (or is it ongoing), how many weeks they want to train for it, days per week and minutes per session, how much variety they want vs repeating sessions, rest days, where/equipment (pool access for swimming, gym or home), and anything that hurts. Then call propose_program with phases that fit the goal and its date:
  event with a date: base > build > peak > taper (taper the last 5-10 days, volume down, intensity kept); multi-day/long events need back-to-back long days in build.
  ski all day / general readiness (ongoing): a repeating 3-4 week cycle of leg endurance, hip and core strength, uphill aerobic work and one easier week.
  strength (e.g. max squat): 3 progressive weeks + 1 deload, repeated, test in the last week; small jumps (2.5-5%), hip pain rule overrides the numbers.
  muscle gain: 8-12 weeks, 3-5 days, 6-12 reps near failure, progressive volume, deload every 4th week; mention eating a bit more and protein, briefly (not a dietitian).
  swimming distance: technique + aerobic base, then longer continuous swims; open-water safety note if it's the ocean.
  rehab or anything that's done when the body says so (kind "milestone"): no fixed end. Set criteria the app can check from their log, e.g. pain_streak (daily checks of the area <= 1 for 7 days in a row), sessions (4 sessions with pain <= 2 in the last 10 days), tour (a short tour with pain <= 3 during and 0 next morning) - plus manual ones if needed. target_date is only a hoped-for date. Phases run in order and the last one holds until the checks are met, e.g. Calm (settle, isometrics) > Load (strength back, pain <= 2) > Return (short tour, then normal plan). An injury mid-program: offer a rehab milestone that pauses the current program and resumes it when done.
  Phase weeks must add up to the program length. With activate true, also build week 1 in the same turn (propose_workout for anything new, then propose_plan_change) - it's bundled into the program card. Keep their pain rule and hip swaps in every phase.
- Running a program: each new week, build that week's plan from the active program's current phase, their log and pain trend, with propose_plan_change (it's tied to the program week automatically). Progress loads week to week, ease off when pain or feel says so, and say in a line what changed vs last week. Check-ins report against the active program too (week, phase, on track or not). To switch, pause, finish or restart a program, call set_program_status. If an event date has passed, ask how it went and offer to mark it done.
- Pivots: when plans change mid-program (new date, a check is wrong or too easy, phases need stretching, fewer days a week, a manual check is now met), call propose_program_update with ONLY the fields that change - don't start a new program for an adjustment. Phases and criteria are full lists when you send them; preferences merge. Progress (start date, current week, checks so far) carries on. Say in one line why. If the change also affects this week, follow with propose_plan_change.
- Finishing a milestone: when the program line says ALL MET, tell them and offer to call it done. They can also call it done early - it's their call; say plainly which checks are still unproven (e.g. "hip's been 0-1 for 3 days, the usual bar is 7 plus a clean short tour") and let them decide. When done, ask in a few words how it went (save as outcome), then offer to resume the program it paused and, if they're in the calm phase, to switch to build.
- Building a week from a description ("3 strength days, 2 easy, a tour Saturday", "more upper body this week"): if one or two things that change the plan are missing (days available, equipment, time per session), ask them first in one message. Otherwise build it: prefer workouts already in the library; create new ones with propose_workout only when nothing fits (full rundown, hip swaps in tips); then call propose_plan_change once with the whole week. You can name the new workouts you just proposed in the plan - they are bundled into one card and saved together. Say in 2-4 lines how the week serves their goals and their pain rule.
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
    description: "Suggest a replacement weekly plan (home or travel). Shows one card; nothing is saved until the person taps Save. Workouts must be library names, or names of new workouts you proposed with propose_workout in this conversation (those get bundled into this card and saved with it). Give the FULL plan.",
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
    name: "propose_program",
    description: "Suggest a goal program (shows a card; nothing saves until they tap Start/Save). Ask the setup questions first. With activate true, also propose week 1 (propose_workout for new ones, then propose_plan_change) in the same turn - it's bundled into this card.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, e.g. 'Jan 18 big ski day', 'Ski all day', 'Beach swim', 'Squat 1.5x BW'" },
        goal: { type: "string", description: "What they want, in their words, plus how you'll measure it" },
        kind: { type: "string", enum: ["event", "ongoing", "milestone"], description: "event: done on a date; ongoing: no end; milestone: done when the criteria are met (rehab)" },
        target_date: { type: "string", description: "YYYY-MM-DD. Required for events; for a milestone, an optional hoped-for date" },
        criteria: {
          type: "array",
          description: "Milestones only: how we'll know it's done. The app checks these from the log.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["pain_streak", "sessions", "tour", "manual"] },
              label: { type: "string", description: "Short, e.g. 'Hip 0-1 for 7 days'" },
              max: { type: "integer", description: "pain_streak: highest daily check that counts" },
              days: { type: "integer", description: "pain_streak: days in a row; sessions: look-back window" },
              area: { type: "string", description: "pain_streak: pain area name (default the primary one)" },
              max_pain: { type: "integer", description: "sessions/tour: highest pain during that counts" },
              count: { type: "integer", description: "sessions: how many" },
              min_vert: { type: "integer", description: "tour: minimum vert in ft" },
            },
            required: ["kind", "label"],
          },
        },
        weeks: { type: "integer", minimum: 1, maximum: 52, description: "Program length. For an event starting now, weeks until the date." },
        days_per_week: { type: "integer", minimum: 1, maximum: 7 },
        phases: { type: "array", items: { type: "object", properties: { name: { type: "string" }, weeks: { type: "integer", minimum: 1 }, focus: { type: "string" } }, required: ["name", "weeks", "focus"] } },
        preferences: { type: "object", properties: { session_minutes: { type: "integer" }, variety: { type: "string" }, rest_days: { type: "string" }, equipment: { type: "string" }, limits: { type: "string" } } },
        notes: { type: "string" },
        activate: { type: "boolean", description: "true = start now (pauses the current active program); false = keep in the bank" },
        reason: { type: "string", description: "One line on why this shape fits them" },
      },
      required: ["title", "goal", "kind", "phases", "activate", "reason"],
    },
  },
  {
    name: "propose_program_update",
    description: "Change a saved program in place (shows a before/after card; nothing saves until they tap Save). Send only the fields that change. phases and criteria replace the whole list; preferences merge (a key set to \"\" removes it). Progress carries on.",
    input_schema: {
      type: "object",
      properties: {
        program: { type: "string", description: "Title of the saved program to change" },
        reason: { type: "string", description: "One line on why" },
        title: { type: "string" },
        goal: { type: "string" },
        kind: { type: "string", enum: ["event", "ongoing", "milestone"] },
        target_date: { type: "string", description: "YYYY-MM-DD, or empty to clear" },
        weeks: { type: "integer" },
        days_per_week: { type: "integer" },
        phases: { type: "array", items: { type: "object", properties: { name: { type: "string" }, weeks: { type: "integer" }, focus: { type: "string" } }, required: ["name", "weeks", "focus"] } },
        criteria: { type: "array", description: "Full list, same shape as propose_program. A manual check can carry met: true.", items: { type: "object", properties: { kind: { type: "string", enum: ["pain_streak", "sessions", "tour", "manual"] }, label: { type: "string" }, max: { type: "integer" }, days: { type: "integer" }, area: { type: "string" }, max_pain: { type: "integer" }, count: { type: "integer" }, min_vert: { type: "integer" }, met: { type: "boolean" } }, required: ["kind", "label"] } },
        preferences: { type: "object", properties: { session_minutes: { type: "integer" }, variety: { type: "string" }, rest_days: { type: "string" }, equipment: { type: "string" }, limits: { type: "string" } } },
        notes: { type: "string" },
      },
      required: ["program", "reason"],
    },
  },
  {
    name: "set_program_status",
    description: "Start, pause, finish or shelve a saved program by title. Starting one pauses the current active program. With done, pass outcome (how it went, in their words).",
    input_schema: { type: "object", properties: { title: { type: "string" }, status: { type: "string", enum: ["active", "paused", "done", "idea"] }, outcome: { type: "string" } }, required: ["title", "status"] },
  },
  {
    name: "set_goals",
    description: "Save what they are training for, in a few sentences (event/season and date, priorities, limits, days per week, equipment). Replaces the previous goals. Only after they state or confirm them.",
    input_schema: { type: "object", properties: { goals: { type: "string" } }, required: ["goals"] },
  },
  {
    name: "review_training",
    description: "Detailed training summary for the last N days (sessions with dates, focus split, tours and vert, pain, feel, pain-area checks, notes). Use for check-ins beyond what the summary shows.",
    input_schema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 180 } }, required: ["days"] },
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
      case "propose_program": {
        const today = todayISO();
        const kind = i.kind === "event" ? "event" : i.kind === "milestone" ? "milestone" : "ongoing";
        const criteria = parseCriteria(i.criteria);
        if (kind === "milestone" && !criteria.length) return { ok: false, reason: "A milestone needs criteria - how will we know it's done?" };
        const target = typeof i.target_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.target_date) ? i.target_date : null;
        if (kind === "event" && !target) return { ok: false, reason: "An event program needs target_date (YYYY-MM-DD). Ask for the date if you don't have it." };
        if (target && target < today) return { ok: false, reason: "That date has passed." };
        const phases = parsePhases(i.phases);
        if (!phases.length) return { ok: false, reason: "Give at least one phase." };
        const sum = phases.reduce((a, x) => a + x.weeks, 0);
        const toDate = target && kind === "event" ? Math.max(1, Math.ceil((Math.round((+new Date(target + "T12:00:00") - +new Date(today + "T12:00:00")) / 86400000) + 1) / 7)) : null;
        const weeks = Number.isInteger(i.weeks) ? Math.max(1, Math.min(52, Number(i.weeks))) : toDate ?? (kind === "event" ? sum : null);
        if (i.activate && toDate && Math.abs(sum - toDate) > 1) return { ok: false, reason: `Starting now, there are ${toDate} weeks until ${target}, but the phases add up to ${sum}. Adjust the phase weeks.` };
        const preferences = parsePrefs(i.preferences);
        const prog: ProgramProposal = {
          type: "program", reason: String(i.reason ?? "").slice(0, 300), title: String(i.title ?? "").slice(0, 60), goal: String(i.goal ?? "").slice(0, 600),
          kind, target_date: target, criteria, weeks: kind === "milestone" ? null : weeks, days_per_week: Number.isInteger(i.days_per_week) ? Number(i.days_per_week) : null, phases, preferences,
          notes: String(i.notes ?? "").slice(0, 600), activate: !!i.activate,
        };
        // week 1 proposed earlier in this turn? fold it in
        const wk = prog.activate ? proposals.findIndex((p) => p.type === "plan" && p.kind === "home") : -1;
        if (wk >= 0) { prog.first_week = { ...(proposals[wk] as PlanProposal), program_week: 1 }; proposals.splice(wk, 1); }
        proposals.push(prog);
        return { ok: true, note: `Shown as a program card${prog.first_week ? " with week 1 bundled in" : prog.activate ? ". Now build week 1 with propose_plan_change (it gets bundled into the card)" : ""}. Nothing is saved until they tap it.` };
      }
      case "propose_program_update": {
        const name = String(i.program ?? "").toLowerCase();
        const prog = data.programs.find((p) => p.title.toLowerCase() === name) ?? data.programs.find((p) => p.title.toLowerCase().includes(name));
        if (!prog) return { ok: false, reason: `No program called "${i.program}". Saved: ${data.programs.map((p) => p.title).join(", ") || "none"}.` };
        const fields = Object.fromEntries(Object.entries(i).filter(([k]) => k !== "program" && k !== "reason"));
        const ch = programChanges(prog, fields, todayISO());
        if ("error" in ch) return { ok: false, reason: ch.error };
        // a second update to the same program in this turn replaces the first
        const prev = proposals.findIndex((p) => p.type === "program_update" && p.program_id === prog.id);
        if (prev >= 0) proposals.splice(prev, 1);
        proposals.push({ type: "program_update", reason: String(i.reason ?? "").slice(0, 300), program_id: prog.id, title: prog.title, ...ch });
        return { ok: true, changes: Object.keys(ch.after), note: "Shown as a before/after card. Nothing is saved until they tap Save." };
      }
      case "set_program_status": {
        const name = String(i.title ?? "").toLowerCase();
        const prog = data.programs.find((p) => p.title.toLowerCase() === name) ?? data.programs.find((p) => p.title.toLowerCase().includes(name));
        if (!prog) return { ok: false, reason: `No program called "${i.title}". Saved: ${data.programs.map((p) => p.title).join(", ") || "none"}.` };
        const status = (["active", "paused", "done", "idea"].includes(String(i.status)) ? i.status : "paused") as ProgramStatus;
        const wasActive = data.programs.find((p) => p.status === "active" && p.id !== prog.id);
        if (status === "active" && wasActive) {
          await sb.from("programs").update({ status: "paused" }).eq("id", wasActive.id);
          await sb.from("programs").update({ resumes_id: wasActive.id }).eq("id", prog.id);
        }
        const restart = status === "active" && (!prog.start_date || prog.status === "done" || prog.status === "idea");
        const done = status === "done" ? { completed_at: new Date().toISOString(), ...(i.outcome ? { outcome: String(i.outcome).slice(0, 600) } : {}) } : {};
        const { error } = await sb.from("programs").update({ status, ...(restart ? { start_date: todayISO() } : {}), ...done }).eq("id", prog.id);
        if (error) throw error;
        actions.push(`${prog.title}: ${status === "active" ? "started" : status === "done" ? "done ✓" : status}`);
        const resumes = status === "done" && prog.resumes_id ? data.programs.find((p) => p.id === prog.resumes_id && p.status === "paused") : undefined;
        if (status === "active") return { ok: true, week: programPosition({ ...prog, status, start_date: restart ? todayISO() : prog.start_date }).week, note: "Offer to build this week's plan for it." };
        if (resumes) return { ok: true, note: `It had paused "${resumes.title}". Offer to resume it (set_program_status active)${data.state.phase === "calm" ? " and to switch from calm-down to build (set_phase)" : ""}.` };
        return { ok: true, ...(status === "done" && data.state.phase === "calm" ? { note: "They're still in the calm phase: offer to switch to build." } : {}) };
      }
      case "set_goals": {
        await setGoals(sb, userId!, String(i.goals ?? ""));
        actions.push("Goals saved");
        return { ok: true };
      }
      case "review_training": {
        const days = Math.max(1, Math.min(180, Number(i.days) || 7));
        return digest(data, days);
      }
      case "propose_plan_change": {
        const items: PlanItem[] = [];
        const missing: string[] = [];
        const bundled: WorkoutProposal[] = [];
        const bundledFrom: string[] = []; // earlier cards (open) that this plan now includes
        const findNew = async (n: string) => {
          const here = proposals.find((p): p is WorkoutProposal => p.type === "workout" && !p.base_id && p.name.toLowerCase() === n.toLowerCase());
          if (here) return { p: here, msgId: null as string | null };
          const { data: open } = await sb.from("coach_messages").select("id, proposal").eq("user_id", userId!).eq("proposal_status", "open").not("proposal", "is", null).order("created_at", { ascending: false }).limit(30);
          const row = (open ?? []).find((r: any) => r.proposal?.type === "workout" && !r.proposal.base_id && String(r.proposal.name).toLowerCase() === n.toLowerCase());
          return row ? { p: row.proposal as WorkoutProposal, msgId: row.id as string } : null;
        };
        const rawItems = (Array.isArray(i.items) ? i.items : []).slice(0, 14);
        for (const [idx, it] of rawItems.entries() as IterableIterator<[number, any]>) {
          const ids: string[] = [];
          for (const n of (Array.isArray(it.workouts) ? it.workouts : []) as string[]) {
            const w = data.workouts.find((x) => x.name === n) ?? data.workouts.find((x) => x.name.toLowerCase() === String(n).toLowerCase());
            if (w) { ids.push(w.id); continue; }
            const nw = await findNew(String(n));
            if (!nw) { missing.push(n); continue; }
            if (!bundled.includes(nw.p)) bundled.push(nw.p);
            if (nw.msgId && !bundledFrom.includes(nw.msgId)) bundledFrom.push(nw.msgId);
            ids.push(`new:${nw.p.name}`);
          }
          const kind = it.kind === "tour" || it.kind === "rest" ? it.kind : "workout";
          items.push({ key: `p${idx + 1}`, day: String(it.day ?? "").slice(0, 20), title: String(it.title ?? "").slice(0, 80), workout_ids: ids, kind, note: String(it.note ?? "").slice(0, 300) });
        }
        if (missing.length) return { ok: false, reason: `These workouts don't exist yet: ${[...new Set(missing)].join(", ")}. Propose each with propose_workout first (no base_workout), then name it here.` };
        if (!items.length) return { ok: false, reason: "need at least one item" };
        // the bundled workouts live on the plan card now, not as separate cards
        for (const b of bundled) { const k = proposals.indexOf(b); if (k >= 0) proposals.splice(k, 1); }
        const planKind = i.kind === "travel" ? "travel" : "home";
        const plan: PlanProposal = { type: "plan", reason: String(i.reason ?? "").slice(0, 300), kind: planKind, items, ...(bundled.length ? { new_workouts: bundled, bundled_from: bundledFrom } : {}) };
        // week 1 of a program proposed in this turn: it rides on the program card
        const prog = planKind === "home" ? proposals.find((p): p is ProgramProposal => p.type === "program" && p.activate && !p.first_week) : undefined;
        if (prog) {
          prog.first_week = { ...plan, program_week: 1 };
          return { ok: true, note: `Bundled into the "${prog.title}" program card as week 1. Nothing is saved until they tap Start.` };
        }
        // otherwise a home plan belongs to the active program's current week
        const ap = planKind === "home" ? activeProgram(data) : undefined;
        if (ap) { plan.program_id = ap.id; plan.program_week = programPosition(ap).week; }
        proposals.push(plan);
        return { ok: true, note: `Shown to the person as one card${bundled.length ? ` with ${bundled.length} new workout(s) bundled in` : ""}${ap ? ` (week ${plan.program_week} of "${ap.title}")` : ""}. It is NOT saved until they tap Save.` };
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
    for (let turn = 0; turn < 8; turn++) {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: [
          { type: "text", text: libraryText(data), cache_control: { type: "ephemeral" } },
          { type: "text", text: systemPrompt(data) },
        ],
        tools: TOOLS,
        messages,
        output_config: { effort: "medium" },
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
