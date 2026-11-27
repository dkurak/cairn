import type { Workout } from "@/lib/types";

export default function Rundown({ workout }: { workout: Workout | undefined }) {
  if (!workout?.rundown) return null;
  return (
    <>
      <div className="rundown-title">{workout.name}</div>
      {workout.rundown.map((b, i) => {
        const rows = (
          <ul className="rundown">
            {b.rows.map(([ex, sr, tip], j) => (
              <li key={j}>
                <span className="ex">{ex}</span>
                <span className="sr">{sr}</span>
                {tip ? <span className="tip">{tip}</span> : null}
              </li>
            ))}
          </ul>
        );
        return b.label ? (
          <div className="block" key={i}>
            <div className="block-label">{b.label}</div>
            {rows}
          </div>
        ) : (
          <div key={i}>{rows}</div>
        );
      })}
    </>
  );
}
