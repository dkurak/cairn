import { Tag } from "./ui";
import type { WeekPlan, WeekStatus } from "@/lib/programWeeks";

/** "On track" / "Behind" / "Done" ... plus a pain flag when a session went over 3/10. */
export function WeekStatusTag({ status }: { status: WeekStatus | null }) {
  if (!status) return null;
  return (
    <span className="row nowrap gap-6">
      <Tag tone={status.tone}>{status.label}</Tag>
      {status.painFlag && <Tag tone="warn" title="A session went over 3/10 this week">Pain flag</Tag>}
    </span>
  );
}

/** Where a week's plan comes from: a draft, the copy that was followed, or the plan you're following right now. */
export function WeekSourceTag({ plan }: { plan: WeekPlan }) {
  if (plan.source === "draft") return <Tag tone="accent">Draft</Tag>;
  if (plan.source === "current") return <Tag>Current plan</Tag>;
  if (plan.source === "live") return <Tag>As planned</Tag>;
  return null;
}
