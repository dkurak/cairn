// Checks for the Garmin export: npm run test:garmin
// (FIT byte parity with garmin/fitlib.py was checked by decoding both with fit-tool.)
import assert from "node:assert/strict";
import fs from "node:fs";
import { patchSteps, parseSetsReps, type GarminStep, type RepeatStep } from "../src/lib/garmin/steps.ts";
import { buildWorkoutFit } from "../src/lib/garmin/fit.ts";
import { crc32, zipFiles } from "../src/lib/garmin/zip.ts";
import type { RundownBlock } from "../src/lib/types.ts";

const raw: { name: string; steps: GarminStep[] }[] = JSON.parse(fs.readFileSync("data/workouts.json", "utf8"));
const rundowns: Record<string, RundownBlock[]> = JSON.parse(fs.readFileSync("data/workout_rundowns.json", "utf8"));
const library = raw.map((w) => w.steps);
const get = (n: string) => ({ steps: raw.find((w) => w.name === n)!.steps, rundown: rundowns[n] });
const clone = <T,>(x: T): T => structuredClone(x);
const fit = (name: string, steps: GarminStep[]) => buildWorkoutFit(name, steps, { serial: 1234567890, createdMs: Date.now() });
const flat = (steps: GarminStep[]): any[] => steps.flatMap((s) => (s.type === "repeat" ? [s, ...s.steps] : [s]));
let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; console.log("ok -", name); };

test("parse sets/reps", () => {
  assert.deepEqual(parseSetsReps("3 x 15 each side @ 5 lb + extra R set"), { sets: 3, reps: 15, seconds: undefined, lb: 5, sides: true, extraR: true });
  assert.equal(parseSetsReps("6 min @ 50 lb").seconds, 360);
  assert.equal(parseSetsReps("3 x 40s @ 12.5 lb").lb, 12.5);
  assert.equal(parseSetsReps("1 round").reps, undefined);
});

test("unchanged rundown keeps every workout's steps exactly", () => {
  for (const w of raw) {
    const r = rundowns[w.name];
    if (!r) continue;
    const out = patchSteps(r, clone(r), w.steps, library);
    assert.equal(out.changed, false, w.name);
    assert.deepEqual(out.steps, w.steps, w.name);
  }
});

test("weight change rebuilds only that row, keeps rest and position", () => {
  const { steps, rundown } = get("STR1 Squat Bench");
  const next = clone(rundown);
  next[2].rows[0][1] = "5 @ 210 lb";
  const out = patchSteps(rundown, next, steps, library);
  assert.ok(out.changed);
  const rpt = out.steps.find((s) => s.type === "repeat" && s.times === 4) as RepeatStep;
  assert.equal((rpt.steps[0] as any).title, "Bench press");
  assert.equal((rpt.steps[0] as any).weight_lb, 210);
  assert.equal((rpt.steps[0] as any).notes, "4x5 ~80% of 255 max. +5 lb when clean");
  assert.deepEqual(rpt.steps.at(-1), { type: "rest", seconds: 90 });
  assert.equal(flat(out.steps).length, flat(steps).length);
  const ramps = flat(out.steps).filter((s) => s.title === "Bench press" && s.intensity === "warmup").map((s) => s.weight_lb);
  assert.deepEqual(ramps, [135, 165]);
  fit("STR1 Squat Bench", out.steps);
});

test("row-level sets change keeps sides, extra R set and rest", () => {
  const { steps, rundown } = get("SKI1 Hip Strength");
  const next = clone(rundown);
  next[0].rows[1][1] = "5 x 45s each side + extra R set";
  const out = patchSteps(rundown, next, steps, library);
  const rpt = out.steps[2] as RepeatStep;
  assert.equal(rpt.times, 5);
  assert.deepEqual(rpt.steps.map((s: any) => s.step_name ?? s.type), ["Wall march hold R", "Wall march hold L", "rest"]);
  assert.equal((rpt.steps[0] as any).seconds, 45);
  assert.equal((rpt.steps[2] as any).seconds, 30);
  assert.equal((out.steps[3] as any).step_name, "Wall march hold R+1");
  assert.deepEqual(out.steps[4], { type: "rest", seconds: 30 });
  assert.deepEqual(out.steps.slice(5), steps.slice(5));
});

test("new row in a circuit goes after its neighbour, before the rest", () => {
  const { steps, rundown } = get("STR1 Squat Bench");
  const next = clone(rundown);
  next[3].rows.push(["Bird dog", "10 each side", "Slow, hips square"]);
  const out = patchSteps(rundown, next, steps, library, { "Bird dog": { category: "CRUNCH", name: "BICYCLE_CRUNCH" } });
  const rpt = out.steps.filter((s) => s.type === "repeat")[2] as RepeatStep;
  assert.deepEqual(rpt.steps.map((s: any) => s.step_name ?? s.type).slice(-3), ["Bird dog R", "Bird dog L", "rest"]);
  assert.equal(out.warnings.length, 0, out.warnings.join("; "));
  fit("STR1 Squat Bench", out.steps);
});

test("unknown exercise gets a custom title, no clashes", () => {
  const { steps, rundown } = get("EZ1 Upper Core");
  const next = clone(rundown);
  next[next.length - 1].rows.push(["Mystery move A", "10", ""], ["Mystery move B", "10", ""]);
  const out = patchSteps(rundown, next, steps, library);
  assert.ok(out.warnings.some((w) => w.includes("Mystery move A")));
  fit("EZ1 Upper Core", out.steps); // throws on a title clash
});

test("removed row leaves nothing behind", () => {
  const { steps, rundown } = get("STR1 Squat Bench");
  const next = clone(rundown);
  next[3].rows = next[3].rows.filter((r) => r[0] !== "Face pull");
  const out = patchSteps(rundown, next, steps, library);
  assert.ok(!flat(out.steps).some((s) => s.title === "Face pull"));
  assert.equal(flat(out.steps).length, flat(steps).length - 1);
});

test("circuit rounds change updates the repeat", () => {
  const { steps, rundown } = get("STR1 Squat Bench");
  const next = clone(rundown);
  next[3].label = "Circuit · 4 rounds";
  const out = patchSteps(rundown, next, steps, library);
  assert.deepEqual(out.steps.filter((s) => s.type === "repeat").map((s) => (s as RepeatStep).times), [5, 4, 4]);
});

test("a workout built only from its rundown exports for all 24", () => {
  for (const [name, r] of Object.entries(rundowns)) {
    const out = patchSteps(null, r, null, library);
    assert.ok(out.steps.length > 0, name);
    fit(name.slice(0, 20), out.steps);
  }
});

test("zip", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const z = zipFiles([{ name: "a.fit", data: new Uint8Array([1, 2, 3]) }]);
  assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
});

console.log(`${n} passed`);
