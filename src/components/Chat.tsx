"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import ProposalCard from "./ProposalCard";
import type { CoachRow } from "@/lib/types";

// tiny markdown: **bold** and "- " bullets (the coach uses both)
function Rich({ text }: { text: string }) {
  const bold = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p));
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) { out.push(<ul key={`u${out.length}`}>{bullets.map((b, i) => <li key={i}>{bold(b)}</li>)}</ul>); bullets = []; } };
  lines.forEach((l, i) => { if (/^\s*[-•]\s+/.test(l)) bullets.push(l.replace(/^\s*[-•]\s+/, "")); else { flush(); if (l.trim()) out.push(<div key={i}>{bold(l)}</div>); } });
  flush();
  return <>{out}</>;
}

const INTRO = 'Tell me what you did or how something feels and I\'ll log it. Try: "did SKI1, pain 2, felt good", "my low back is sore", or "what should I do today?"';

export default function Chat() {
  const { data, sb, uid, outbox, clearOutbox, saveProposal, coachOpen } = useApp();
  const [rows, setRows] = useState<CoachRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const consumed = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (coachOpen) setTimeout(() => inputRef.current?.focus(), 250); }, [coachOpen]);

  useEffect(() => {
    sb.from("coach_messages").select("id, role, content, proposal, proposal_status, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(60)
      .then(({ data: d }) => { setRows(((d ?? []) as CoachRow[]).reverse()); setLoaded(true); });
  }, [sb, uid]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [rows, busy]);

  async function send(t: string) {
    t = t.trim();
    if (!t || busy) return;
    setBusy(true);
    setError("");
    setRows((r) => [...r, { id: `tmp${Date.now()}`, role: "user", content: t, proposal: null, proposal_status: null, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "failed");
      setRows((r) => [...r, ...(j.rows as CoachRow[])]);
      if ((j.rows as CoachRow[]).some((x) => x.role === "act")) window.dispatchEvent(new Event("cairn:reload"));
    } catch (e) {
      setError(e instanceof Error && e.message !== "failed" ? e.message : "Couldn't reach the coach. Try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loaded || !outbox || outbox.id === consumed.current) return;
    consumed.current = outbox.id;
    clearOutbox();
    if (outbox.send) void send(outbox.text);
    else setText(outbox.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, outbox]);

  async function setStatus(id: string, status: "saved" | "discarded") {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, proposal_status: status } : x)));
    await sb.from("coach_messages").update({ proposal_status: status }).eq("id", id);
  }

  return (
    <div className="chat-page">
      <div className="chat-log card" ref={logRef} aria-live="polite" style={{ padding: 12 }}>
        <div className="msg ai">{INTRO}</div>
        {rows.map((m) =>
          m.proposal ? (
            <ProposalCard key={m.id} proposal={m.proposal} data={data} status={m.proposal_status} onSave={saveProposal} onStatus={(s) => setStatus(m.id, s)} />
          ) : (
            <div key={m.id} className={`msg ${m.role === "user" ? "me" : m.role === "act" ? "act" : "ai"}`}>{m.role === "assistant" ? <Rich text={m.content} /> : m.content}</div>
          ),
        )}
        {busy && <div className="msg ai">Thinking…</div>}
        {error && <div className="msg ai" role="alert">{error}</div>}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); const t = text; setText(""); void send(t); }}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" placeholder="Did SKI1, pain 3…" aria-label="Message the coach" />
        <button type="submit" disabled={busy}>Send</button>
      </form>
    </div>
  );
}
