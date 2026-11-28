// What the screen should look like the instant someone taps, before the save comes back. Pure: AppData in, AppData out.
// Pass one of these as the third argument of `run(...)`; if the save fails the app reloads the real data.
import type { AppData, Feel, LogEntry, Program, ProgramStatus } from "./types";

export const optFeel = (date: string, feel: Feel) => (d: AppData): AppData =>
  ({ ...d, checkins: [...d.checkins.filter((c) => c.date !== date), { date, feel }] });

export const optPain = (areaId: string, date: string, pain: number) => (d: AppData): AppData => {
  const old = d.checks.find((c) => c.area_id === areaId && c.date === date);
  return { ...d, checks: [...d.checks.filter((c) => c !== old), { id: old?.id ?? `tmp-${areaId}-${date}`, area_id: areaId, date, pain, note: old?.note ?? "" }] };
};

export const optAreaActive = (areaId: string, active: boolean) => (d: AppData): AppData =>
  ({ ...d, areas: d.areas.map((a) => (a.id === areaId ? { ...a, active } : a)) });

/** Tick (value) or untick (null) a plan item in whichever checklist is showing. */
export const optDone = (key: string, val: string | null) => (d: AppData): AppData => {
  const field = d.state.travel ? "travel_done" : "done";
  const next = { ...(d.state[field] ?? {}) };
  if (val == null) delete next[key]; else next[key] = val;
  return { ...d, state: { ...d.state, [field]: next } };
};

export const optPhase = (phase: AppData["state"]["phase"]) => (d: AppData): AppData => ({ ...d, state: { ...d.state, phase } });
export const optTravel = (travel: boolean) => (d: AppData): AppData => ({ ...d, state: { ...d.state, travel } });

export const optEntry = (id: string, patch: Partial<LogEntry>) => (d: AppData): AppData =>
  ({ ...d, log: d.log.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
export const optEntryGone = (id: string) => (d: AppData): AppData => ({ ...d, log: d.log.filter((e) => e.id !== id) });

/** Starting a program pauses the one that was active. */
export const optProgramStatus = (id: string, status: ProgramStatus) => (d: AppData): AppData =>
  ({ ...d, programs: d.programs.map((p: Program) => (p.id === id ? { ...p, status } : status === "active" && p.status === "active" ? { ...p, status: "paused" } : p)) });
export const optProgramGone = (id: string) => (d: AppData): AppData => ({ ...d, programs: d.programs.filter((p) => p.id !== id) });
