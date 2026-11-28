"use client";
import { useApp } from "./AppProvider";
import { ConfirmButton, SectionCard } from "./ui";
import { canResumeTravel, restartTravelSet, setPhase } from "@/lib/actions";
import { primaryArea } from "@/lib/rules";
import { shortDate as fmt } from "@/lib/format";
import { optPhase } from "@/lib/optimistic";

/** Where you're training and what mode you're in: the two switches that change what the plan shows. */
export default function RightNow() {
  const { data, sb, run, askCoach, openTravel } = useApp();
  const { state } = data;
  const primary = primaryArea(data.areas);
  const t = state.travel_info;
  const trip = [t?.gear ? (t.gear === "gym" ? "hotel gym" : "bodyweight") : null, t?.jog ? "jogging" : null, t?.returns ? `back ${fmt(t.returns)}` : null].filter(Boolean).join(" · ");

  return (
    <SectionCard title="Right now">
      <div className="kv">
        <div>
          <span className="k">Training</span>
          <span>{state.travel ? `Traveling${t?.started ? ` since ${fmt(t.started)}` : ""}${trip ? ` · ${trip}` : ""}` : "At home"}</span>
          <div className="row">
            {state.travel ? (
              <>
                <button onClick={openTravel}>Edit trip</button>
                <button onClick={() => askCoach("Update my travel plan for this trip.", false)}>Tweak travel plan</button>
                <ConfirmButton confirmLabel="Tap again to start over" onConfirm={() => void run(() => restartTravelSet(sb, state))}>New trip - start over</ConfirmButton>
              </>
            ) : (
              <button onClick={openTravel}>{canResumeTravel(state) ? "Back on the road - continue the trip" : "I'm traveling"}</button>
            )}
          </div>
        </div>
        {/* rehab mode follows whatever area this person is protecting, not one specific injury */}
        {(primary || state.phase === "calm") && (
          <div>
            <span className="k">{primary ? primary.name : "Mode"}</span>
            <span>
              {state.phase === "calm"
                ? `Calm-down: gentle days only${primary ? ` until it's 3/10 or less` : ""}. Tours and the weekly plan are paused.`
                : "Building: the weekly plan and tours are on."}
            </span>
            <div className="row">
              {state.phase === "calm"
                ? <button onClick={() => run(() => setPhase(sb, state, "build"), undefined, optPhase("build"))}>Start the plan</button>
                : <button onClick={() => run(() => setPhase(sb, state, "calm"), undefined, optPhase("calm"))}>Flared? Back to calm-down</button>}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
