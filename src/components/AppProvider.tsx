"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { loadAll, logEntries, markDone, patchState, setTravel } from "@/lib/actions";
import { todayISO } from "@/lib/rules";
import type { Proposal } from "@/lib/proposals";
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
      const base = p.base_id ? workouts.find((w) => w.id === p.base_id) : undefined;
      if (base && base.owner_id === uid) {
        const { error } = await sb.from("workouts").update({ name: p.name, category: p.category, rundown: p.blocks, notes: p.notes, updated_by: uid }).eq("id", base.id);
        if (error) throw error;
      } else {
        let name = p.name;
        for (let n = 2; workouts.some((w) => w.owner_id === uid && w.name === name); n++) name = `${p.name} (${n})`;
        const { error } = await sb.from("workouts").insert({ owner_id: uid, name, category: p.category, steps: [], rundown: p.blocks, notes: p.notes, updated_by: uid });
        if (error) throw error;
      }
    } else {
      const existing = plans.find((pl) => pl.kind === p.kind);
      let planId = existing?.id;
      if (existing) {
        const { error } = await sb.from("plans").update({ items: p.items }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data: row, error } = await sb.from("plans").insert({ owner_id: uid, name: p.kind === "travel" ? "Travel" : "My week", kind: p.kind, items: p.items }).select("id").single();
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
