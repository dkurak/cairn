"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { loadAll, logEntries, markDone, patchState, setTravel } from "@/lib/actions";
import { todayISO } from "@/lib/rules";
import { workoutSaveTarget, type Proposal } from "@/lib/proposals";
import type { AppData, TravelInfo } from "@/lib/types";
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

/** Workout writes include change_note (migration 0005). Before that migration, retry without it. */
async function writeWorkout(sb: SupabaseClient, row: Record<string, unknown>, id?: string) {
  const go = (r: Record<string, unknown>) => (id ? sb.from("workouts").update(r).eq("id", id).select("id").single() : sb.from("workouts").insert(r).select("id").single());
  let res = await go(row);
  if (res.error && /change_note/.test(res.error.message)) { const { change_note: _, ...rest } = row; res = await go(rest); }
  if (res.error) throw res.error;
  return res.data as { id: string };
}

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
    } catch {
      setStatus(fail);
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
    } else {
      // workouts designed for this plan get saved first (as this person's own), then the plan points at them
      const newIds = new Map<string, string>();
      for (const w of p.new_workouts ?? []) {
        let name = w.name;
        for (let n = 2; workouts.some((x) => x.owner_id === uid && x.name === name); n++) name = `${w.name} (${n})`;
        const row = await writeWorkout(sb, { owner_id: uid, name, category: w.category, steps: w.steps ?? [], rundown: w.blocks, notes: w.notes, change_note: w.reason, updated_by: uid });
        newIds.set(`new:${w.name}`, row.id);
      }
      const items = p.items.map((it) => ({ ...it, workout_ids: it.workout_ids.map((id) => newIds.get(id) ?? id).filter((id) => !id.startsWith("new:")) }));
      const existing = plans.find((pl) => pl.kind === p.kind);
      let planId = existing?.id;
      if (existing) {
        const { error } = await sb.from("plans").update({ items }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: row, error } = await sb.from("plans").insert({ owner_id: uid, name: p.kind === "travel" ? "Travel" : "My week", kind: p.kind, items }).select("id").single();
        if (error) throw error;
        planId = row.id;
      }
      await patchState(sb, uid, p.kind === "home" ? { active_home_plan_id: planId, done: {} } : { active_travel_plan_id: planId, travel_done: {} });
    }
  }), [data, run, sb, uid]);

  async function startTravel(info: TravelInfo) {
    const ok = await run(() => setTravel(sb, data.state, true, info));
    setTravelSheet(false);
    if (!ok) return;
    const gear = info.gear === "gym" ? "a hotel gym" : "bodyweight only (no gym)";
    askCoach(`I'm traveling${info.returns ? ` until ${info.returns}` : ""}. I have ${gear}${info.jog ? " and want to fit in some jogging" : ""}. Can you set up my travel plan?`);
  }

  const value: Ctx = { data, sb, uid, today, status, setStatus, run, openLog: setSheet, openTravel: () => setTravelSheet(true), saveProposal, askCoach, coachOpen, setCoachOpen, outbox, clearOutbox: () => setOutbox(null) };

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
              if (sheet.itemKey) await markDone(sb, data.state, sheet.itemKey, v.date);
            }, "Couldn't save. Check your connection and tap Save again.");
            if (ok) setSheet(null);
            return ok;
          }}
        />
      )}
    </AppCtx.Provider>
  );
}
