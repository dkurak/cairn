import type { Feel } from "@/lib/types";

/** Rough / OK / Good / Great as a small pill (colour + the word, never colour alone) */
export default function FeelPill({ feel }: { feel: Feel | null }) {
  if (!feel) return null;
  return <span className={`chip pill-${feel.toLowerCase()}`}>{feel}</span>;
}
export const VertPill = ({ ft }: { ft: number | null }) => (ft ? <span className="chip n">{ft.toLocaleString()} ft</span> : null);
