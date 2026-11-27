"use client";
import { useRef, useState } from "react";

/** Tiny tooltip: wrap a chart, call show(e, text) from marks, hide() on leave. Works for hover, focus and tap. */
export function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const show = (e: { clientX: number; clientY: number }, text: string) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: Math.min(Math.max(e.clientX - r.left, 60), r.width - 60), y: e.clientY - r.top, text });
  };
  const showAtEl = (el: Element, text: string) => {
    const r = ref.current?.getBoundingClientRect(); const b = el.getBoundingClientRect();
    if (r) setTip({ x: Math.min(Math.max(b.left - r.left + b.width / 2, 60), r.width - 60), y: b.top - r.top, text });
  };
  const hide = () => setTip(null);
  return { ref, tip, show, showAtEl, hide };
}

export function TipBubble({ tip }: { tip: { x: number; y: number; text: string } | null }) {
  if (!tip) return null;
  return (
    <div role="status" style={{ position: "absolute", left: tip.x, top: tip.y - 8, transform: "translate(-50%, -100%)", background: "var(--ink)", color: "var(--bg)", padding: "6px 10px", borderRadius: 8, fontSize: ".82rem", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 3, boxShadow: "0 2px 8px rgba(0,0,0,.2)" }}>
      {tip.text}
    </div>
  );
}
