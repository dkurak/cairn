import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadAll } from "@/lib/actions";
import { activePlan, checksFor, primaryArea, todayISO, upNext } from "@/lib/rules";
import { digest, digestLine } from "@/lib/review";
import { activeProgram, programLine } from "@/lib/programs";
import { nudgeLine, programAhead, programNudge } from "@/lib/programWeeks";

// The short recap on Today: what you've been doing and what's next. The client caches it until something changes.
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const anthropic = new Anthropic();

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "2-3 short sentences on recent training vs their goals/program" },
    next: { type: "array", items: { type: "string" }, description: "1-3 short, concrete next steps" },
  },
  required: ["summary", "next"],
  additionalProperties: false,
};

export async function GET() {
  const sb = await createClient();
  const { data: claims } = await sb.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const data = await loadAll(sb, userId);
  const today = todayISO();
  const n = upNext(data);
  const plan = activePlan(data);
  const ap = activeProgram(data);
  const primary = primaryArea(data.areas);
  const doneToday = data.log.some((e) => e.date === today);
  const context = [
    `Today is ${today} (${new Date().toLocaleDateString("en-US", { weekday: "long" })}). ${doneToday ? "They already trained today." : "Nothing logged today yet."}`,
    `Goals: ${data.profile.goals || "not set"}`,
    ap ? `Active program: ${programLine(ap, data)}` : "No active program.",
    ap ? nudgeLine(programNudge(data, ap, today), programAhead(data, ap, today)) : "",
    `Mode: ${data.state.travel ? "traveling" : "home"}, phase ${data.state.phase}. Plan: ${plan?.items.map((i) => `${i.day} ${i.title}`).join(", ") || "none"}. Up next: ${n.type === "item" || n.type === "calm" ? n.item.title : n.type}.`,
    primary ? `${primary.name} daily checks (newest first): ${checksFor(data.checks, primary.id).slice(0, 10).map((c) => `${c.date.slice(5)}: ${c.pain}`).join(", ") || "none"}` : "",
    ...[5, 14].map((d) => digestLine(digest(data, d, today))),
    `Recent sessions: ${digest(data, 7, today).sessions_list.join("; ") || "none"}`,
  ].filter(Boolean).join("\n");

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: `You write the recap at the top of ${data.profile.display_name}'s workout app. Casual, specific, encouraging but honest. Use "-" never em dashes. Not a doctor.
summary: 2-3 short sentences on what they've actually done lately (name sessions, pain trend, consistency) and how it lines up with their goals or active program. If goals aren't set, say what the pattern suggests.
next: 1-3 short concrete steps (under 12 words each) - what to do next, tied to their plan, program and pain rule (keep pain at 3/10 or less). If the context says the plan is in place, open the summary with a short win (the plan is mapped out, name what they did). If the context says to suggest planning ahead or a re-plan, make one of the next steps "Ask the coach to plan ahead" or "Ask the coach to re-plan the rest". If they already trained today, the first step is about tomorrow or recovery.`,
      messages: [{ role: "user", content: context }],
    });
    if (res.stop_reason === "refusal") throw new Error("refused");
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const out = JSON.parse(text) as { summary: string; next: string[] };
    return NextResponse.json({ summary: String(out.summary).slice(0, 600), next: (out.next ?? []).slice(0, 3).map((s) => String(s).slice(0, 140)) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "busy" }, { status: 429 });
    console.error("recap failed", e);
    return NextResponse.json({ error: "Couldn't write a recap right now" }, { status: 502 });
  }
}
