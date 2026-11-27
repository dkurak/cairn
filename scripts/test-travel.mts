// Checks for travel on/off continuity and "logging what's up next counts": npm run test:travel
import assert from "node:assert/strict";
import { canResumeTravel, creditUpNext, restartTravelSet, setTravel } from "../src/lib/actions.ts";
import { todayISO, addDays, upNext } from "../src/lib/rules.ts";

// a fake Supabase that applies plan_state updates to an object
function fakeDb(state: any) {
  return {
    state,
    from: () => ({ update: (patch: any) => ({ eq: async () => { Object.assign(state, patch); return { error: null }; } }) }),
  } as any;
}
const today = todayISO();
const items = ["TRV1 Hotel Hip", "TRV2 Hotel Full Body", "TRV1 Hotel Hip", "TRV3 Hotel Upper"].map((t, i) => ({ key: "k" + i, day: "Hotel", title: t, workout_ids: [["t1", "t2", "t1", "t3"][i]], kind: "workout", note: "" }));
const data = (state: any, log: any[] = []): any => ({
  state, log,
  workouts: [{ id: "t1", name: "TRV1 Hotel Hip" }, { id: "t2", name: "TRV2 Hotel Full Body" }, { id: "t3", name: "TRV3 Hotel Upper" }],
  plans: [{ id: "tp", owner_id: "u", name: "Travel", kind: "travel", items }],
});
const traveling = () => ({ user_id: "u", phase: "build", travel: true, active_travel_plan_id: "tp", done: {}, travel_done: { k0: addDays(today, -2), k1: addDays(today, -1) }, travel_info: { gear: "bodyweight", started: addDays(today, -5) }, week: 1 });
let n = 0;
const test = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log("ok -", name); };

await test("accidental home + back: same trip, progress kept", async () => {
  const db = fakeDb(traveling());
  await setTravel(db, { ...db.state }, false);
  assert.equal(db.state.travel, false);
  assert.equal(db.state.travel_info.ended, today);
  assert.deepEqual(Object.keys(db.state.travel_done), ["k0", "k1"]); // going home doesn't clear it
  assert.equal(canResumeTravel(db.state), true);
  await setTravel(db, { ...db.state }, true);
  assert.equal(db.state.travel, true);
  assert.deepEqual(Object.keys(db.state.travel_done), ["k0", "k1"]);
  assert.equal(db.state.travel_info.ended, undefined);
  assert.equal(db.state.travel_info.started, addDays(today, -5)); // still the same trip
  assert.equal((upNext(data(db.state)) as any).item.key, "k2");
});
await test("a trip after more than 3 days home starts the set over", async () => {
  const db = fakeDb({ ...traveling(), travel: false, travel_info: { gear: "gym", started: addDays(today, -20), ended: addDays(today, -4) } });
  assert.equal(canResumeTravel(db.state), false);
  await setTravel(db, { ...db.state }, true, { gear: "bodyweight" });
  assert.deepEqual(db.state.travel_done, {});
  assert.deepEqual(db.state.travel_info, { gear: "bodyweight", started: today });
});
await test("editing the trip while traveling keeps progress", async () => {
  const db = fakeDb(traveling());
  await setTravel(db, { ...db.state }, true, { returns: addDays(today, 5) });
  assert.deepEqual(Object.keys(db.state.travel_done), ["k0", "k1"]);
  assert.equal(db.state.travel_info.returns, addDays(today, 5));
});
await test("New trip - start over", async () => {
  const db = fakeDb(traveling());
  await restartTravelSet(db, { ...db.state });
  assert.deepEqual(db.state.travel_done, {});
  assert.equal(db.state.travel_info.started, today);
});
await test("logging what's up next counts, however it's logged", async () => {
  const db = fakeDb({ ...traveling(), travel_done: {} });
  assert.equal(await creditUpNext(db, data({ ...db.state }), ["TRV1 Hotel Hip"], today), "TRV1 Hotel Hip");
  assert.equal(db.state.travel_done.k0, today);
  assert.equal(await creditUpNext(db, data({ ...db.state }), ["EZ2 Light Full Body"], today), null); // not what's up next
  assert.equal(Object.keys(db.state.travel_done).length, 1);
});
console.log(`${n} passed`);
