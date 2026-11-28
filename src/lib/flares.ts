// Pain as episodes, not a line: most of the time an area is calm, and what matters is when it flared, how bad and how long.
// A flare is any day at 4/10 or more ("sharp, changes how you walk"). Flare days within 3 days of each other are one episode.
import type { AppData, LogEntry, PainArea } from "./types";
import { addDays, primaryArea } from "./rules";
import { daysBetween } from "./format";

export const FLARE_AT = 4;
const GAP = 3;

export type Episode = { start: string; end: string; peak: number; days: number; sessions: number; ongoing: boolean };
export type AreaFlares = {
  area: PainArea;
  series: { date: string; pain: number }[];   // worst reading per day (checks, plus session pain for the primary area)
  episodes: Episode[];                        // newest first, all time
  latest: { date: string; pain: number } | null;
  calmDays: number | null;                    // days since the last flare day; null if it has never flared
  flaring: boolean;
  /** the tour that proves a flared primary area is back: after the last flare, pain during 3 or less and 0 the next morning */
  validatedBy: LogEntry | null;
  isPrimary: boolean;
};

export function areaFlares(data: Pick<AppData, "areas" | "checks" | "log">, today: string): AreaFlares[] {
  const primary = primaryArea(data.areas as PainArea[]);
  return data.areas.filter((a) => a.active).map((area) => {
    const worst = new Map<string, number>();
    const put = (d: string, p: number) => worst.set(d, Math.max(worst.get(d) ?? -1, p));
    for (const c of data.checks) if (c.area_id === area.id) put(c.date, c.pain);
    const sessionDays = new Set<string>();
    if (primary?.id === area.id) for (const e of data.log) if ((e.kind === "workout" || e.kind === "tour") && e.pain_during != null) { put(e.date, e.pain_during); if (e.pain_during >= FLARE_AT) sessionDays.add(e.date); }
    const series = [...worst.entries()].map(([date, pain]) => ({ date, pain })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const flareDays = series.filter((p) => p.pain >= FLARE_AT).map((p) => p.date);
    const raw: { start: string; end: string }[] = [];
    for (const d of flareDays) {
      const last = raw[raw.length - 1];
      if (last && daysBetween(last.end, d) <= GAP) last.end = d; else raw.push({ start: d, end: d });
    }
    const latest = series[series.length - 1] ?? null;
    const episodes: Episode[] = raw.map((r) => {
      const inside = series.filter((p) => p.date >= r.start && p.date <= r.end);
      return {
        ...r, peak: Math.max(...inside.map((p) => p.pain)), days: daysBetween(r.start, r.end) + 1,
        sessions: [...sessionDays].filter((d) => d >= r.start && d <= r.end).length,
        ongoing: !!latest && latest.pain >= FLARE_AT && r.end === flareDays[flareDays.length - 1],
      };
    }).reverse();
    const lastFlare = flareDays[flareDays.length - 1] ?? null;
    const lastFlareDay = flareDays[flareDays.length - 1] ?? null;
    const validatedBy = lastFlareDay && primary?.id === area.id
      ? data.log.find((e) => e.kind === "tour" && e.date > lastFlareDay && (e.pain_during ?? 9) <= 3 && e.pain_next_am === 0) ?? null
      : null;
    return { validatedBy, isPrimary: primary?.id === area.id, area, series, episodes, latest, calmDays: lastFlare ? Math.max(0, daysBetween(lastFlare, today)) : null, flaring: !!latest && latest.pain >= FLARE_AT };
  });
}

/** Episodes that touch a date window. */
export const episodesIn = (a: AreaFlares, start: string, end: string) => a.episodes.filter((e) => e.end >= start && e.start <= end);
