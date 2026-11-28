"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { canResumeTravel, creditUpNext, loadAll, logEntries, markDone, saveWeekDrafts, setTravel, writeLivePlan, writeRow } from "@/lib/actions";
import { programPosition } from "@/lib/programs";
import { todayISO } from "@/lib/rules";
import { workoutSaveTarget, type PlanProposal, type Proposal, type WorkoutProposal } from "@/lib/proposals";
import type { AppData, PlanItem, TravelInfo } from "@/lib/types";
import LogSheet, { type SheetSpec } from "./LogSheet";
import TravelSheet from "./TravelSheet";
import CoachDrawer from "./CoachDrawer";

type Outbox = { id: number; text: string; send: boolean } | null;
type Ctx = {
  data: AppData;
  sb: SupabaseClient;
  uid: string;
  today: string;
  status: string;
  setStatus: (s: string) => void;
  run: (fn: () => Promise<unknown>, fail?: string) => Promise<boolean>;
  openLog: (s: SheetSpec) => void;
  openTravel: () => void;
  saveProposal: (p: Proposal) => Promise<boolean>;
  /** Open the coach pane and send a message (send=false just pre-fills the box). */
  askCoach: (text: string, send?: boolean) => void;
  coachOpen: boolean;
  setCoachOpen: (o: boolean) => void;
  outbox: Outbox;
  clearOutbox: () => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
};

const programError = (e: { message?: string }) =>
  new Error(/programs|program_id/.test(e?.message ?? "") ? "Goal programs need a database update (migration 0007) first." : e?.message ?? "Couldn't save");
const writeWorkout = (sb: SupabaseClient, row: Record<string, unknown>, id?: string) => writeRow(sb, "workouts", row, id);

export default function AppProvider({ initial, children }: { initial: AppData; children: React.ReactNode }) {
  const sb = useMemo(() => createClient(), []);
  const [data, setData] = useState(initial);
  const [status, setStatus] = useState("");
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [travelSheet, setTravelSheet] = useState(false);
  const [outbox, setOutbox] = useState<Outbox>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const uid = initial.state.user_id;
  const today = todayISO();

  const run = useCallback(async (fn: () => Promise<unknown>, fail = "Couldn't save that. Try again.") => {
    setStatus("");
    try {
      await fn();
      setData(await loadAll(sb, uid));
      return true;
    } catch (e) {
      console.error("save failed:", e);
      // a missing database update is worth saying plainly
      setStatus(e instanceof Error && /migration/.test(e.message) ? e.message : fail);
      return false;
    }
  }, [sb, uid]);

  // the coach tools change data on the server (log, pain, plan state): refresh when it says so
  useEffect(() => {
    const h = () => void run(async () => {});
    window.addEventListener("cairn:reload", h);
    return () => window.removeEventListener("cairn:reload", h);
  }, [run]);

  const askCoach = useCallback((text: string, send = true) => {
    setOutbox({ id: Date.now(), text, send });
    setCoachOpen(true);
  }, []);

  const saveProposal = useCallback((p: Proposal) => run(async () => {
    const { workouts, plans } = data;
    if (p.type === "workout") {
      const target = workoutSaveTarget(p, data);
      if (target === "update_own" || target === "update_shared") {
        // RLS also enforces this: shared rows are admin-only
        await writeWorkout(sb, { name: p.name, category: p.category, rundown: p.blocks, ...(p.steps ? { steps: p.steps } : {}), notes: p.notes, change_note: p.reason, updated_by: uid }, p.base_id!);
      } else {
        let name = p.name;
        for (let n = 2; workouts.some((w) => w.owner_id === uid && w.name === name); n++) name = `${p.name} (${n})`;
        const row = await writeWorkout(sb, { owner_id: uid, name, category: p.category, steps: p.steps ?? [], rundown: p.blocks, notes: p.notes, change_note: p.reason, updated_by: uid });
        if (target === "fork") {
          // member changed a shared workout: point their own plans at the new private version
          for (const pl of plans.filter((x) => x.owner_id === uid && x.items.some((i) => i.workout_ids.includes(p.base_id!)))) {
            const items = pl.items.map((i) => ({ ...i, workout_ids: i.workout_ids.map((id) => (id === p.base_id ? row.id : id)) }));
            const { error: e2 } = await sb.from("plans").update({ items }).eq("id", pl.id);
            if (e2) throw e2;
          }
        }
      }
    } else if (p.type === "plan") {
      await savePlan(p);
    } else if (p.type === "program_weeks") {
      // drafts for later weeks: never the plan being followed now
      const prog = data.programs.find((x) => x.id === p.program_id);
      if (!prog) throw new Error("That program isn't here any more.");
      if (!data.weekPlansReady) throw new Error("Planning ahead needs a database update (migration 0009) first.");
      const ids = await createWorkouts(p.new_workouts);
      const { saved } = await saveWeekDrafts(sb, uid, prog.id, p.weeks.map((w) => ({ week: w.week, items: remap(w.items, ids) })), { currentWeek: programPosition(prog, todayISO()).week, note: p.reason });
      if (!saved.length) throw new Error("Those weeks have already started, so nothing was saved.");
    } else if (p.type === "program_update") {
      // in place: start date and progress are untouched
      await writeRow(sb, "programs", { ...p.after }, p.program_id).catch((e) => { throw programError(e); });
    } else {
      // a goal program: one active at a time, so starting this one pauses the current one
      const today = todayISO();
      const current = data.programs.find((x) => x.status === "active");
      if (p.activate && current) {
        const { error } = await sb.from("programs").update({ status: "paused" }).eq("id", current.id);
        if (error) throw programError(error);
      }
      const row = await writeRow(sb, "programs", {
        user_id: uid, title: p.title, goal: p.goal, kind: p.kind, target_date: p.target_date, criteria: p.criteria ?? [], resumes_id: p.activate ? current?.id ?? null : null, weeks: p.weeks, days_per_week: p.days_per_week,
        phases: p.phases, preferences: p.preferences, notes: p.notes, status: p.activate ? "active" : "idea", start_date: p.activate ? today : null,
      }).catch((e) => { throw programError(e); });
      if (p.activate && p.first_week) await savePlan({ ...p.first_week, program_id: row.id, program_week: 1 });
    }

    /** workouts designed for a plan are saved first (as this person's own); returns "new:<name>" -> real id */
    async function createWorkouts(list: WorkoutProposal[] | undefined) {
      const ids = new Map<string, string>();
      for (const w of list ?? []) {
        let name = w.name;
        for (let n = 2; workouts.some((x) => x.owner_id === uid && x.name === name); n++) name = `${w.name} (${n})`;
        const row = await writeWorkout(sb, { owner_id: uid, name, category: w.category, steps: w.steps ?? [], rundown: w.blocks, notes: w.notes, change_note: w.reason, updated_by: uid });
        ids.set(`new:${w.name}`, row.id);
      }
      return ids;
    }
    /** swap "new:<name>" ids for the real ids of the workouts just created (a function declaration: it's used above, before this point) */
    function remap(items: PlanItem[], ids: Map<string, string>): PlanItem[] {
      return items.map((it) => ({ ...it, workout_ids: it.workout_ids.map((id) => ids.get(id) ?? id).filter((id) => !id.startsWith("new:")) }));
    }

    async function savePlan(p: PlanProposal) {
      const ids = await createWorkouts(p.new_workouts);
      await writeLivePlan(sb, uid, { existing: plans.find((pl) => pl.kind === p.kind), kind: p.kind, items: remap(p.items, ids), program_id: p.program_id, program_week: p.program_week, note: p.reason });
    }
  }), [data, run, sb, uid]);

  async function startTravel(info: TravelInfo) {
    const ok = await run(() => setTravel(sb, data.state, true, info));
    setTravelSheet(false);
    if (!ok) return;
    const gear = info.gear === "gym" ? "a hotel gym" : "bodyweight only (no gym)";
    askCoach(`I'm traveling${info.returns ? ` until ${info.returns}` : ""}. I have ${gear}${info.jog ? " and want to fit in some jogging" : ""}. Can you set up my travel plan?`);
  }

  /** Traveling: back within a few days of switching home just continues that trip; otherwise ask about the new one. */
  const openTravel = useCallback(() => {
    if (canResumeTravel(data.state)) {
      void run(() => setTravel(sb, data.state, true)).then((ok) => ok && setStatus("Back to your trip - picking up the travel set where you left off."));
    } else setTravelSheet(true);
  }, [data.state, run, sb]);

  const value: Ctx = { data, sb, uid, today, status, setStatus, run, openLog: setSheet, openTravel, saveProposal, askCoach, coachOpen, setCoachOpen, outbox, clearOutbox: () => setOutbox(null) };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <CoachDrawer />
      {travelSheet && <TravelSheet onClose={() => setTravelSheet(false)} onStart={startTravel} />}
      {sheet && (
        <LogSheet
          sheet={sheet}
          options={[...data.workouts.map((w) => w.name), "Tour", "Run", "Bike", "Hike", "Other"]}
          onClose={() => setSheet(null)}
          onSave={async (v) => {
            const ok = await run(async () => {
              await logEntries(sb, data, v.whats.map((what) => ({ what, date: v.date, pain_during: v.pain, feel: v.feel, notes: v.notes, vert_ft: what === "Tour" ? v.vert : null })));
              // logged from Up next: that item is done. Logged any other way: it still counts if it's what's up next
              if (sheet.itemKey) await markDone(sb, data.state, sheet.itemKey, v.date);
              else await creditUpNext(sb, data, v.whats, v.date ?? today);
            }, "Couldn't save. Check your connection and tap Save again.");
            if (ok) setSheet(null);
            return ok;
          }}
        />
      )}
    </AppCtx.Provider>
  );
}
