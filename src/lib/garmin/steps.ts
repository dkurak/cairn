// Garmin steps (workouts.steps) and keeping them in sync with the rundown (what people see and edit).
// Edits touch only the rows that changed: unchanged rows keep their hand-built watch steps
// (ramps, R/L sides, rests). Changed or new rows are rebuilt from the row text.
import EX from "./exercises.json";
import type { RundownBlock, RundownRow } from "../types";

const EXERCISES = EX as Record<string, { id: number; names: Record<string, number> }>;

export type ExerciseStep = {
  type: "exercise";
  title: string; // exercise name shown on the watch (ExerciseTitle)
  step_name: string; // step label, e.g. "DB row R"
  garmin_category: string;
  garmin_name: string;
  intensity: "active" | "warmup" | "cooldown";
  reps?: number;
  seconds?: number;
  weight_lb?: number;
  notes?: string;
};
export type RestStep = { type: "rest"; seconds: number };
export type RepeatStep = { type: "repeat"; times: number; steps: (ExerciseStep | RestStep)[] };
export type GarminStep = ExerciseStep | RestStep | RepeatStep;

export type GarminHint = { category: string; name: string };

// ---------- row text -> numbers ----------

export type ParsedRow = { sets: number; reps?: number; seconds?: number; lb?: number; sides: boolean; extraR: boolean };

/** "3 x 15 each side @ 5 lb + extra R set", "40s", "6 min @ 50 lb", "5 @ 135 lb", "1 round" */
export function parseSetsReps(text: string): ParsedRow {
  const t = text.toLowerCase();
  const setsM = t.match(/^\s*(\d+)\s*x\s*/);
  const sets = setsM ? Math.max(1, Number(setsM[1])) : 1;
  const rest = setsM ? t.slice(setsM[0].length) : t;
  const lbM = rest.match(/@\s*(\d+(?:\.\d+)?)\s*lb/);
  const timeM = rest.match(/^\s*(\d+(?:\.\d+)?)\s*(s|sec|secs|min|mins)\b/);
  const repsM = !timeM && !/round/.test(rest) ? rest.match(/^\s*(\d+)\b/) : null;
  return {
    sets,
    seconds: timeM ? Math.round(Number(timeM[1]) * (timeM[2].startsWith("m") ? 60 : 1)) : undefined,
    reps: repsM ? Number(repsM[1]) : undefined,
    lb: lbM ? Number(lbM[1]) : undefined,
    sides: /each (side|leg|arm)/.test(rest),
    extraR: /extra r\b/.test(rest),
  };
}

const RAMP_RE = /^\s*ramp:\s*([^.]*)\.?\s*/i;
/** Tip minus the "Ramp: ..." lead-in, cut to the 64 bytes the watch shows. */
function notesFromTip(tip: string) {
  const n = tip.replace(RAMP_RE, "").trim();
  return n ? cutBytes(n, 64) : undefined;
}
function rampsFromTip(tip: string) {
  const m = tip.match(RAMP_RE);
  if (!m) return [];
  return m[1].split(",").map((p) => p.trim().match(/^(\d+)\s*@\s*(\d+(?:\.\d+)?)/)).filter(Boolean).map((x) => ({ reps: Number(x![1]), lb: Number(x![2]) }));
}
function cutBytes(s: string, max: number) {
  const enc = new TextEncoder();
  while (enc.encode(s).length > max) s = s.slice(0, -1);
  return s;
}
const stepName = (title: string, suffix = "") => cutBytes(title, 32 - suffix.length) + suffix;

/** "Circuit · 3 rounds" -> 3 */
export function blockRounds(label?: string) {
  const m = label?.match(/(\d+)\s*rounds?/i);
  return m ? Number(m[1]) : 1;
}
const blockRestOff = (label?: string) => {
  const m = label?.match(/(\d+)\s*s\s*off/i);
  return m ? Number(m[1]) : undefined;
};

// ---------- Garmin exercise ids ----------

export const isGarminExercise = (cat: string, name: string) => EXERCISES[cat]?.names[name] !== undefined;

const norm = (s: string) => s.trim().toLowerCase();
const exercisesIn = (steps: GarminStep[]): ExerciseStep[] => steps.flatMap((s) => (s.type === "repeat" ? exercisesIn(s.steps) : s.type === "exercise" ? [s] : []));

/** Pick Garmin ids for an exercise title: this workout first, then the library, then the coach's hint, else a generic one. */
function garminFor(title: string, own: GarminStep[], library: GarminStep[][], hint?: GarminHint): { cat: string; name: string; generic: boolean } {
  const find = (steps: GarminStep[]) => exercisesIn(steps).find((e) => norm(e.title) === norm(title));
  const hit = find(own) ?? library.map(find).find(Boolean);
  if (hit) return { cat: hit.garmin_category, name: hit.garmin_name, generic: false };
  if (hint && isGarminExercise(hint.category, hint.name)) return { cat: hint.category, name: hint.name, generic: false };
  const cat = hint && EXERCISES[hint.category] && Object.keys(EXERCISES[hint.category].names).length ? hint.category : "TOTAL_BODY";
  return { cat, name: Object.keys(EXERCISES[cat].names)[0], generic: true };
}

/**
 * Each (category, name) pair can only carry one title in a .fit file. Generic picks can collide,
 * so move later titles to an unused name in the same category.
 */
function dedupeTitles(steps: GarminStep[]) {
  const owner = new Map<string, string>();
  for (const e of exercisesIn(steps)) {
    const key = `${e.garmin_category}:${e.garmin_name}`;
    const had = owner.get(key);
    if (!had) { owner.set(key, e.title); continue; }
    if (had === e.title) continue;
    const free = Object.keys(EXERCISES[e.garmin_category]?.names ?? {}).find((n) => !owner.has(`${e.garmin_category}:${n}`));
    if (!free) continue;
    const prevKey = key;
    for (const x of exercisesIn(steps)) if (x.title === e.title && `${x.garmin_category}:${x.garmin_name}` === prevKey) x.garmin_name = free;
    owner.set(`${e.garmin_category}:${free}`, e.title);
  }
}

// ---------- row -> steps ----------

type RowCtx = { own: GarminStep[]; library: GarminStep[][]; hint?: GarminHint; restSecs?: number; warnings: string[] };

/** The active steps for one pass through a row (R/L sides, no sets wrapper). */
function activeSteps(row: RundownRow, p: ParsedRow, g: { cat: string; name: string }): ExerciseStep[] {
  const [title, , tip] = row;
  const base = (suffix: string, withNotes: boolean): ExerciseStep => ({
    type: "exercise", title, step_name: stepName(title, suffix), garmin_category: g.cat, garmin_name: g.name, intensity: "active",
    ...(p.reps != null ? { reps: p.reps } : p.seconds != null ? { seconds: p.seconds } : {}),
    ...(p.lb ? { weight_lb: p.lb } : {}),
    ...(withNotes && notesFromTip(tip) ? { notes: notesFromTip(tip) } : {}),
  });
  return p.sides ? [base(" R", true), base(" L", false)] : [base("", true)];
}

/** Everything a row turns into on its own: ramps, then sets (repeat when > 1), extra R set, rest. */
function rowSteps(row: RundownRow, ctx: RowCtx, inCircuit: boolean): { ramps: ExerciseStep[]; main: GarminStep[] } {
  const [title, setsReps, tip] = row;
  const p = parseSetsReps(setsReps);
  const g = garminFor(title, ctx.own, ctx.library, ctx.hint);
  if (g.generic) ctx.warnings.push(`${title}: no Garmin match, shows as a custom exercise`);
  if (p.reps == null && p.seconds == null) ctx.warnings.push(`${title}: "${setsReps}" has no reps or time, so the watch step is press-lap-when-done`);
  const ramps = rampsFromTip(tip).map((r): ExerciseStep => ({
    type: "exercise", title, step_name: stepName(title, ` ramp ${r.lb}`), garmin_category: g.cat, garmin_name: g.name, intensity: "warmup", reps: r.reps, weight_lb: r.lb,
  }));
  const one = activeSteps(row, p, g);
  if (inCircuit) {
    if (p.sets > 1) ctx.warnings.push(`${title}: ${p.sets} sets inside a circuit - watch does it once per round`);
    return { ramps, main: one };
  }
  const rest = ctx.restSecs ?? 30;
  const main: GarminStep[] = p.sets > 1 ? [{ type: "repeat", times: p.sets, steps: [...one, { type: "rest", seconds: rest }] }] : [...one];
  if (p.extraR) main.push({ ...one[0], step_name: stepName(title, " R+1"), notes: "Extra right-side set" }, { type: "rest", seconds: rest });
  return { ramps, main };
}

// ---------- patch ----------

const rowKey = (r: RundownRow) => `${norm(r[0])}|${r[1].trim()}|${(r[2] ?? "").trim()}`;
const titlesOf = (s: GarminStep) => (s.type === "repeat" ? exercisesIn(s.steps).map((e) => norm(e.title)) : s.type === "exercise" ? [norm(s.title)] : []);

export type PatchResult = { steps: GarminStep[]; changed: boolean; warnings: string[] };

/**
 * New Garmin steps for an edited rundown.
 * oldSteps/oldRundown: the workout as it is now (oldSteps may be empty for a new workout).
 * library: every workout's steps, to reuse Garmin ids for known exercises.
 * hints: Garmin ids the coach suggested, by exercise title.
 */
export function patchSteps(
  oldRundown: RundownBlock[] | null,
  newRundown: RundownBlock[],
  oldSteps: GarminStep[] | null,
  library: GarminStep[][],
  hints: Record<string, GarminHint> = {},
): PatchResult {
  const warnings: string[] = [];
  const top: GarminStep[] = structuredClone(oldSteps ?? []);
  const own = structuredClone(top);
  const oldRows = (oldRundown ?? []).flatMap((b) => b.rows);
  const oldByTitle = new Map(oldRows.map((r) => [norm(r[0]), r]));
  const oldKeys = new Set(oldRows.map(rowKey));
  const newTitles = new Set(newRundown.flatMap((b) => b.rows.map((r) => norm(r[0]))));
  const hintFor = (t: string) => hints[t] ?? Object.entries(hints).find(([k]) => norm(k) === norm(t))?.[1];
  const has = (t: string) => top.some((s) => titlesOf(s).includes(t));

  // anchors: where a removed row's steps sat, so its rebuilt steps go back in the same place
  type Anchor = { repeat: RepeatStep | null; topIndex: number; innerIndex: number; restSecs?: number };
  function remove(t: string): Anchor | null {
    let anchor: Anchor | null = null; // where the working sets were
    let rampAnchor: Anchor | null = null; // warm-up ramps sit before them; used only if there are no working sets
    for (let i = 0; i < top.length; i++) {
      const s = top[i];
      if (s.type === "repeat") {
        const ts = titlesOf(s);
        if (!ts.includes(t)) continue;
        if (ts.every((x) => x === t)) {
          // a repeat that is just this row's sets
          const restSecs = s.steps.find((x) => x.type === "rest")?.seconds;
          anchor ??= { repeat: null, topIndex: i, innerIndex: 0, restSecs };
          top.splice(i, 1); i--;
          continue;
        }
        const idx = s.steps.findIndex((x) => x.type === "exercise" && norm(x.title) === t);
        anchor ??= { repeat: s, topIndex: i, innerIndex: idx };
        s.steps = s.steps.filter((x) => !(x.type === "exercise" && norm(x.title) === t));
        if (!s.steps.some((x) => x.type === "exercise")) { top.splice(i, 1); i--; }
      } else if (s.type === "exercise" && norm(s.title) === t) {
        const ramp = s.intensity === "warmup";
        const a: Anchor = ramp ? (rampAnchor ??= { repeat: null, topIndex: i, innerIndex: 0 }) : (anchor ??= { repeat: null, topIndex: i, innerIndex: 0 });
        top.splice(i, 1);
        if (!ramp && top[i]?.type === "rest") { a.restSecs ??= (top[i] as RestStep).seconds; top.splice(i, 1); }
        i--;
      }
    }
    return anchor ?? rampAnchor;
  }

  let changed = false;
  const done = new Set<string>(); // rows already placed as part of a new block
  // 1. rows that are gone
  for (const r of oldRows) {
    const t = norm(r[0]);
    if (!newTitles.has(t) && has(t)) { remove(t); changed = true; }
  }

  // 2. changed rows: rebuild in place. 3. new rows: next to their block neighbours.
  newRundown.forEach((block, bi) => {
    const rounds = blockRounds(block.label);
    const inCircuit = rounds > 1;
    block.rows.forEach((row, ri) => {
      const t = norm(row[0]);
      if (done.has(t)) return;
      if (oldKeys.has(rowKey(row)) && (has(t) || oldSteps?.length)) return; // unchanged
      const ctx: RowCtx = { own, library, hint: hintFor(row[0]), restSecs: blockRestOff(block.label), warnings };
      const existed = oldByTitle.has(t);
      if (existed && !has(t)) {
        if (oldSteps?.length) warnings.push(`${row[0]}: no matching watch steps, left as is on the watch`);
        if (oldSteps?.length) return;
      }
      changed = true;
      const anchor = existed ? remove(t) : null;
      if (anchor) {
        ctx.restSecs ??= anchor.restSecs;
        const { ramps, main } = rowSteps(row, ctx, !!anchor.repeat);
        if (anchor.repeat) {
          const rpt = anchor.repeat;
          const at = top.indexOf(rpt) >= 0 ? top.indexOf(rpt) : anchor.topIndex;
          if (top.indexOf(rpt) < 0) top.splice(at, 0, rpt); // repeat was emptied by the removal
          rpt.steps.splice(Math.max(0, Math.min(anchor.innerIndex, rpt.steps.length)), 0, ...(main as ExerciseStep[]));
          top.splice(top.indexOf(rpt), 0, ...ramps);
        } else {
          const tail = main[main.length - 1];
          const restAfter: GarminStep[] = anchor.restSecs && tail?.type !== "rest" && !(tail?.type === "repeat") ? [{ type: "rest", seconds: anchor.restSecs }] : [];
          top.splice(anchor.topIndex, 0, ...ramps, ...main, ...restAfter);
        }
        return;
      }
      // new row: after the previous row of this block that is on the watch, else before the next one
      const siblings = block.rows.map((r) => norm(r[0]));
      const prev = siblings.slice(0, ri).reverse().find(has);
      const next = siblings.slice(ri + 1).find(has);
      const locate = (title: string) => {
        const i = top.findIndex((s) => titlesOf(s).includes(title));
        return i;
      };
      if (prev || next) {
        const i = locate((prev ?? next)!);
        const s = top[i];
        if (s.type === "repeat" && inCircuit) {
          const { ramps, main } = rowSteps(row, ctx, true);
          const idxs = s.steps.map((x, k) => (x.type === "exercise" && norm(x.title) === (prev ?? next) ? k : -1)).filter((k) => k >= 0);
          const at = prev ? idxs[idxs.length - 1] + 1 : idxs[0];
          s.steps.splice(at, 0, ...(main as ExerciseStep[]));
          top.splice(i, 0, ...ramps);
        } else {
          const { ramps, main } = rowSteps(row, ctx, false);
          let at = i;
          if (prev) { at = top.length - 1 - [...top].reverse().findIndex((x) => titlesOf(x).includes(prev)) + 1; if (top[at]?.type === "rest") at++; }
          top.splice(at, 0, ...ramps, ...main);
        }
        return;
      }
      // whole new block: build its container once, after the previous block's steps
      const fresh = block.rows.slice(ri).filter((r) => !has(norm(r[0])));
      fresh.forEach((r) => done.add(norm(r[0])));
      const ramps: ExerciseStep[] = [];
      let content: GarminStep[];
      if (inCircuit) {
        const inner = fresh.flatMap((r) => { const o = rowSteps(r, { ...ctx, hint: hintFor(r[0]) }, true); ramps.push(...o.ramps); return o.main as ExerciseStep[]; });
        content = [{ type: "repeat", times: rounds, steps: [...inner, { type: "rest", seconds: blockRestOff(block.label) ?? 60 }] }];
      } else {
        content = fresh.flatMap((r) => { const o = rowSteps(r, { ...ctx, hint: hintFor(r[0]) }, false); ramps.push(...o.ramps); return o.main; });
      }
      const prevTitles = newRundown.slice(0, bi).flatMap((b) => b.rows.map((r) => norm(r[0]))).filter(has);
      let at = top.length;
      if (prevTitles.length) {
        const last = Math.max(...prevTitles.map((pt) => top.length - 1 - [...top].reverse().findIndex((x) => titlesOf(x).includes(pt))));
        at = last + 1;
        if (top[at]?.type === "rest") at++;
      } else if (bi < newRundown.length - 1) at = 0;
      top.splice(at, 0, ...ramps, ...content);
    });
  });

  // 4. circuit rounds changed (e.g. "3 rounds" -> "4 rounds")
  newRundown.forEach((block) => {
    if (!block.label || !/round/i.test(block.label)) return;
    const rounds = blockRounds(block.label);
    const ts = block.rows.map((r) => norm(r[0]));
    const i = top.findIndex((s) => s.type === "repeat" && titlesOf(s).some((x) => ts.includes(x)));
    if (i < 0) return;
    const rpt = top[i] as RepeatStep;
    if (rpt.times === rounds) return;
    changed = true;
    if (rounds > 1) rpt.times = rounds;
    else top.splice(i, 1, ...rpt.steps.filter((x, k, a) => !(x.type === "rest" && k === a.length - 1))); // 1 round: no repeat wrapper
  });

  dedupeTitles(top);
  return { steps: top, changed, warnings: [...new Set(warnings)] };
}

/** Short one-line summary of what will be on the watch. */
export function stepCount(steps: GarminStep[]) {
  let n = 0;
  for (const s of steps) n += s.type === "repeat" ? (s.times > 1 ? 1 : 0) + s.steps.length : 1;
  return n;
}
