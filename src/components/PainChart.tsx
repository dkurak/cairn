import { painClass } from "@/lib/rules";

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export type PainPoint = { date: string; at?: string; p: number };

export default function PainChart({ points, label }: { points: PainPoint[]; label: string }) {
  const pts = [...points]
    .sort((a, b) => (a.date === b.date ? ((a.at ?? "") < (b.at ?? "") ? -1 : 1) : a.date < b.date ? -1 : 1))
    .slice(-20);
  if (pts.length < 2) return <p className="empty">A couple more checks and the trend shows up. Goal: 3 or below.</p>;
  const W = 480, H = 160, L = 26, R = 10, T = 10, B = 24;
  const x = (i: number) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (p: number) => T + ((10 - p) * (H - T - B)) / 10;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const color = (p: number) => (painClass(p) === "g" ? "var(--good)" : painClass(p) === "w" ? "var(--warn)" : "var(--bad)");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label} pain, last ${pts.length} entries`}>
      <rect x={L} y={y(3)} width={W - L - R} height={y(0) - y(3)} fill="var(--good-bg)" />
      {[0, 3, 5, 10].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      <path d={area} fill="var(--accent)" opacity=".08" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.p)} r={i === pts.length - 1 ? 5 : 3.5} fill={color(p.p)} />
      ))}
      <text x={L} y={H - 6}>{fmt(pts[0].date)}</text>
      <text x={W - R} y={H - 6} textAnchor="end">{fmt(pts[pts.length - 1].date)}</text>
    </svg>
  );
}
