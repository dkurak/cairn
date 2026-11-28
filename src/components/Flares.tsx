"use client";
// Pain as flare-ups: per tracked area, how it is right now, a day strip for the range (green calm, amber aware, red flare),
// and the episodes with peak and length. A calm range just says so.
import { SectionCard, Tag } from "./ui";
import { areaFlares, episodesIn, FLARE_AT } from "@/lib/flares";
import { addDays } from "@/lib/rules";
import { dateRange, shortDate as md } from "@/lib/format";
import { useApp } from "./AppProvider";
import { setAreaActive } from "@/lib/actions";
import { optAreaActive } from "@/lib/optimistic";
import { ConfirmButton } from "./ui";
import type { AppData } from "@/lib/types";
import type { Window } from "@/lib/stats";

const colour = (p: number | undefined) => (p == null ? "var(--line)" : p >= FLARE_AT ? "var(--bad)" : p >= 1 ? "var(--warn)" : "var(--good)");

function Strip({ win, series, label }: { win: Window; series: { date: string; pain: number }[]; label: string }) {
  const days: string[] = [];
  for (let d = win.start; d <= win.end; d = addDays(d, 1)) days.push(d);
  const by = new Map(series.map((p) => [p.date, p.pain]));
  const W = 600, cw = W / days.length;
  return (
    <svg className="viz painstrip" viewBox={`0 0 ${W} 16`} width="100%" height="16" preserveAspectRatio="none" role="img" aria-label={label}>
      {days.map((d, i) => <rect key={d} x={i * cw} y={0} width={Math.max(1, cw - (cw > 4 ? 1 : 0))} height={16} fill={colour(by.get(d))} opacity={by.has(d) ? 1 : 0.5}><title>{`${md(d)}: ${by.has(d) ? `${by.get(d)}/10` : "no check"}`}</title></rect>)}
    </svg>
  );
}

export default function Flares({ data, win, today }: { data: AppData; win: Window; today: string }) {
  const { sb, run } = useApp();
  const areas = areaFlares(data, today);
  if (!areas.length) return <SectionCard title="Flare-ups"><span className="empty">Track an area on the Body tab and flare-ups will show up here.</span></SectionCard>;
  const flaredAny = areas.some((a) => episodesIn(a, win.start, win.end).length > 0);
  return (
    <SectionCard title="Flare-ups" aside={flaredAny ? undefined : <Tag tone="good">None in this range</Tag>}>
      <p className="note m0">A flare is a day at {FLARE_AT}/10 or more. Calm is the normal state - this shows when something flared, how bad, and how long.</p>
      {areas.map((a) => {
        const eps = episodesIn(a, win.start, win.end);
        const status = a.flaring ? <Tag tone="bad">Flared {a.latest!.pain}/10</Tag>
          : a.calmDays == null ? <Tag tone="good">Never flared</Tag>
          : <Tag tone="good">{a.calmDays === 0 ? "Calm today" : `Calm ${a.calmDays} day${a.calmDays === 1 ? "" : "s"}`}</Tag>;
        return (
          <div key={a.area.id} className="flarearea">
            <div className="row nowrap gap-8 between"><strong>{a.area.name}</strong>{status}</div>
            <Strip win={a.series[0] && a.series[0].date > win.start ? { ...win, start: a.series[0].date } : win} series={a.series} label={`${a.area.name} by day: calm, aware, or flared`} />
            {eps.length ? (
              <ul className="episodes">
                {eps.slice(0, 6).map((e) => (
                  <li key={e.start}>
                    <span className="pk"><strong>{e.peak}</strong>/10</span>
                    <span>{e.start === e.end ? md(e.start) : dateRange(e.start, e.end)}{e.ongoing ? " · still flared" : ""}<br /><span className="meta">{e.days} day{e.days === 1 ? "" : "s"}{e.sessions ? ` · hurt during ${e.sessions} session${e.sessions === 1 ? "" : "s"}` : ""}</span></span>
                  </li>
                ))}
              </ul>
            ) : <span className="meta">No flare-ups in this range.</span>}
            {a.episodes.length > 0 && !a.flaring && (() => {
              const calm = a.calmDays ?? 0;
              if (a.isPrimary && !a.validatedBy) return <span className="note">{calm >= 3 ? "Calm for now. A tour with pain 3/10 or less and 0 the next morning will prove it's back." : "Settling. Give it a few calm days, then test it on a tour."}</span>;
              if (calm < 7 && !a.validatedBy) return <span className="note">Calm {calm} day{calm === 1 ? "" : "s"} - a week calm and it's ready to call settled.</span>;
              return (
                <div className="row">
                  <span className="note">{a.validatedBy ? `Proved on the ${md(a.validatedBy.date)} tour (${a.validatedBy.pain_during}/10 during, 0 next morning).` : `Calm ${calm} days.`} Ready to call it settled?</span>
                  <ConfirmButton confirmLabel="Tap again to call it settled" onConfirm={() => void run(() => setAreaActive(sb, a.area.id, false), undefined, optAreaActive(a.area.id, false))}>Call it settled</ConfirmButton>
                </div>
              );
            })()}
          </div>
        );
      })}
      <div className="legend" aria-hidden="true">
        <span><span className="sw" style={{ background: "var(--good)" }} /> calm (0)</span>
        <span><span className="sw" style={{ background: "var(--warn)" }} /> aware (1-3)</span>
        <span><span className="sw" style={{ background: "var(--bad)" }} /> flare (4+)</span>
        <span><span className="sw" style={{ background: "var(--line)" }} /> no check</span>
      </div>
    </SectionCard>
  );
}
