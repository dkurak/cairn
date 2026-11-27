// Checks for goal program math: npm run test:programs
import assert from "node:assert/strict";
import { effectivePhases, needsNewWeek, positionLabel, programPosition, programWeeks } from "../src/lib/programs.ts";
import type { Program } from "../src/lib/types.ts";

const base: Program = {
  id: "p1", user_id: "u", title: "Jan 18 big day", goal: "", kind: "event", target_date: "2027-01-18", start_date: "2026-11-27",
  weeks: null, days_per_week: 4, status: "active", notes: "", preferences: {}, created_at: "", updated_at: "",
  phases: [{ name: "Base", weeks: 3, focus: "aerobic" }, { name: "Build", weeks: 3, focus: "long days" }, { name: "Peak", weeks: 1, focus: "big day sim" }, { name: "Taper", weeks: 1, focus: "fresh legs" }],
};
let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; console.log("ok -", name); };

test("event length comes from the date", () => assert.equal(programWeeks(base), 8)); // Nov 27 -> Jan 18 = 53 days
test("week 1 on the start day, Base phase", () => {
  const p = programPosition(base, "2026-11-27");
  assert.deepEqual([p.week, p.phase, p.phaseIndex, p.daysToTarget, p.over], [1, "Base", 0, 52, false]);
});
test("week 4 is Build", () => assert.equal(programPosition(base, "2026-12-18").phase, "Build"));
test("last week is Taper, event day not over", () => {
  const p = programPosition(base, "2027-01-18");
  assert.deepEqual([p.week, p.phase, p.daysToTarget, p.over], [8, "Taper", 0, false]);
});
test("after the event it's over", () => assert.equal(programPosition(base, "2027-01-19").over, true));
test("label", () => assert.equal(positionLabel(base, programPosition(base, "2026-12-18")), "Week 4 of 8 · Build · 31 days to Jan 18"));
test("ongoing programs cycle their phases", () => {
  const p: Program = { ...base, kind: "ongoing", target_date: null, phases: [{ name: "Load", weeks: 3, focus: "" }, { name: "Easy", weeks: 1, focus: "" }] };
  assert.equal(programPosition(p, "2026-12-18").phase, "Easy"); // week 4
  assert.equal(programPosition(p, "2026-12-25").phase, "Load"); // week 5 starts the cycle again
  assert.equal(programPosition(p, "2026-12-25").over, false);
});
test("needs a new week when the plan is for an older week", () => {
  const data = { programs: [base] };
  const plan = { id: "pl", owner_id: "u", name: "", kind: "home" as const, items: [], program_id: "p1", program_week: 1 };
  assert.equal(needsNewWeek(data, plan, "2026-11-30"), null); // still week 1
  assert.equal(needsNewWeek(data, plan, "2026-12-04")?.pos.week, 2);
  assert.equal(needsNewWeek(data, { ...plan, program_id: null, program_week: null }, "2026-11-28")?.pos.week, 1); // plan not tied to it yet
  assert.equal(needsNewWeek({ programs: [{ ...base, status: "paused" }] }, plan, "2026-12-04"), null);
});
test("event started late: base is shorter, taper still lands on the date", () => {
  const late = { ...base, start_date: "2026-12-11" }; // 6 weeks out, phases add up to 8
  assert.equal(programWeeks(late), 6);
  assert.equal(programPosition(late, "2026-12-11").phase, "Base"); // week 1 = Base's last week
  assert.equal(programPosition(late, "2026-12-18").phase, "Build");
  assert.equal(programPosition(late, "2027-01-15").phase, "Taper");
});
test("event planned early: phases still end on the date", () => {
  const early = { ...base, start_date: "2026-11-13" }; // 10 weeks out, phases add up to 8
  assert.equal(programPosition(early, "2026-11-13").phase, "Base");
  assert.equal(programPosition(early, "2027-01-15").phase, "Taper");
});
test("phase bar weeks always add up to the weeks left", () => {
  assert.deepEqual(effectivePhases({ ...base, start_date: "2026-11-06" }).map((x) => x.weeks), [6, 3, 1, 1]); // 11 weeks out
  assert.deepEqual(effectivePhases({ ...base, start_date: "2026-12-11" }).map((x) => x.weeks), [1, 3, 1, 1]); // 6 weeks out
  assert.deepEqual(effectivePhases({ ...base, start_date: "2027-01-01" }).map((x) => [x.name, x.weeks]), [["Build", 1], ["Peak", 1], ["Taper", 1]]); // 3 weeks out
});
console.log(`${n} passed`);
