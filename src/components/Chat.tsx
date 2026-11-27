"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import ProposalCard from "./ProposalCard";
import { useDictation, useSpeech } from "./voice";
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

const INTRO = 'Tell me what you did or how something feels and I\'ll log it. Or describe the week you want and I\'ll build it, or ask for a check-in on how your training lines up with your goals.';

// one tap to the bigger coaching asks
const STARTERS: { label: string; text: string; send: boolean }[] = [
  { label: "Check in on my last 5 days", text: "Check in on my last 5 days - what have I been working on, and does it line up with my goals?", send: true },
  { label: "Plan my week", text: "Plan my week. Here's what I want to do: ", send: false },
  { label: "My goals", text: "Here's what I'm training for: ", send: false },
];

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
  // voice: replies to a spoken message are read aloud; the speaker toggle reads every reply
  const speech = useSpeech();
  const [readAll, setReadAll] = useState(false);
  useEffect(() => { try { setReadAll(localStorage.getItem("cairn.readReplies") === "1"); } catch {} }, []);
  const toggleReadAll = () => {
    const v = !readAll;
    setReadAll(v);
    if (!v) speech.cancel(); else speech.unlock();
    try { localStorage.setItem("cairn.readReplies", v ? "1" : "0"); } catch {}
  };
  const dictation = useDictation((t) => setText(t), (t) => { setText(""); void send(t, true); });
  useEffect(() => { if (coachOpen) setTimeout(() => inputRef.current?.focus(), 250); }, [coachOpen]);

  useEffect(() => {
    sb.from("coach_messages").select("id, role, content, proposal, proposal_status, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(60)
      .then(({ data: d }) => { setRows(((d ?? []) as CoachRow[]).reverse()); setLoaded(true); });
  }, [sb, uid]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [rows, busy]);

  async function send(t: string, spoken = false) {
    t = t.trim();
    if (!t || busy) return;
    speech.cancel();
    setBusy(true);
    setError("");
    setRows((r) => [...r, { id: `tmp${Date.now()}`, role: "user", content: t, proposal: null, proposal_status: null, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "failed");
      setRows((r) => [...r, ...(j.rows as CoachRow[])]);
      if (spoken || readAll) {
        const said = (j.rows as CoachRow[]).filter((x) => x.role === "assistant" && x.content).map((x) => x.content).join("\n");
        const cards = (j.rows as CoachRow[]).filter((x) => x.proposal).length;
        speech.speak(said + (cards ? `\nI put ${cards === 1 ? "a card" : `${cards} cards`} below for you to look over.` : ""));
      }
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
            <ProposalCard key={`${m.id}:${m.proposal_status}`} proposal={m.proposal} data={data} status={m.proposal_status} onSave={saveProposal} onStatus={(s) => {
              void setStatus(m.id, s);
              // a saved plan also saved the workout cards it bundled
              if (s === "saved" && m.proposal?.type === "plan") m.proposal.bundled_from?.forEach((id) => void setStatus(id, "saved"));
            }} />
          ) : (
            <div key={m.id} className={`msg ${m.role === "user" ? "me" : m.role === "act" ? "act" : "ai"}`}>{m.role === "assistant" ? <Rich text={m.content} /> : m.content}</div>
          ),
        )}
        {busy && <div className="msg ai">Thinking…</div>}
        {error && <div className="msg ai" role="alert">{error}</div>}
        {dictation.error && <div className="msg ai" role="alert">{dictation.error}</div>}
      </div>
      <div className="starters" role="group" aria-label="Ask the coach">
        {STARTERS.map((st) => (
          <button key={st.label} type="button" disabled={busy} onClick={() => (st.send ? void send(st.text) : (setText(st.text), inputRef.current?.focus()))}>{st.label}</button>
        ))}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); const t = text; setText(""); void send(t); }}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" placeholder={dictation.listening ? "Listening…" : "Did SKI1, pain 3…"} aria-label="Message the coach" />
        {speech.supported && (
          <button type="button" className={`iconbtn ${readAll ? "on" : ""}`} onClick={speech.speaking ? speech.cancel : toggleReadAll}
            aria-pressed={readAll} aria-label={speech.speaking ? "Stop reading" : readAll ? "Stop reading replies aloud" : "Read replies aloud"} title={speech.speaking ? "Stop" : readAll ? "Reading replies aloud" : "Read replies aloud"}>
            {speech.speaking ? <StopIcon /> : <SpeakerIcon on={readAll} />}
          </button>
        )}
        {dictation.supported && (
          <button type="button" className={`iconbtn mic ${dictation.listening ? "live" : ""}`} disabled={busy}
            onClick={() => { if (dictation.listening) dictation.stop(); else { speech.cancel(); speech.unlock(); dictation.start(); } }}
            aria-pressed={dictation.listening} aria-label={dictation.listening ? "Stop listening" : "Talk to the coach"}>
            <MicIcon />
          </button>
        )}
        <button type="submit" disabled={busy}>Send</button>
      </form>
    </div>
  );
}

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {on ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l4 6M21 9l-4 6" />}
  </svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
