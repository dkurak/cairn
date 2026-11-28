"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { defaultWorkoutName } from "@/lib/rules";
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
      // older messages go in front of anything already sent while this was loading
      .then(({ data: d }) => { const past = ((d ?? []) as CoachRow[]).reverse(); setRows((now) => [...past.filter((r) => !now.some((x) => x.id === r.id)), ...now]); setLoaded(true); });
  }, [sb, uid]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [rows, busy]);

  const [recovering, setRecovering] = useState(false);

  /** Show (and maybe read out) the rows a coach turn produced. */
  function showReply(rows: CoachRow[], spoken: boolean) {
    setRows((r) => [...r, ...rows.filter((x) => !r.some((y) => y.id === x.id))]);
    if (spoken || readAll) {
      const said = rows.filter((x) => x.role === "assistant" && x.content).map((x) => x.content).join("\n");
      const cards = rows.filter((x) => x.proposal).length;
      speech.speak(said + (cards ? `\nI put ${cards === 1 ? "a card" : `${cards} cards`} below for you to look over.` : ""));
    }
    if (rows.some((x) => x.role === "act")) window.dispatchEvent(new Event("cairn:reload"));
  }

  /**
   * The connection dropped (phone locked, app switched, signal) but the coach keeps going on the server and
   * saves its reply. Look for it for a few minutes, checking right away when the app comes back.
   */
  async function recover(text: string, sentAt: number, spoken: boolean) {
    setRecovering(true);
    const since = new Date(sentAt - 120_000).toISOString(); // leeway for phone vs server clocks
    const look = async () => {
      const { data: d } = await sb.from("coach_messages").select("id, role, content, proposal, proposal_status, created_at")
        .eq("user_id", uid).gte("created_at", since).order("created_at", { ascending: true }).limit(40);
      const all = (d ?? []) as CoachRow[];
      const mine = all.map((x) => x.role === "user" && x.content === text).lastIndexOf(true);
      if (mine < 0) return null; // the message itself never arrived
      const after = all.slice(mine + 1);
      return after.some((x) => x.role === "assistant") ? after : null; // the reply rows are saved together
    };
    let wake: () => void = () => {};
    const onVisible = () => { if (document.visibilityState === "visible") wake(); };
    document.addEventListener("visibilitychange", onVisible);
    try {
      for (let i = 0; i < 60; i++) { // ~5 minutes, as long as the coach can run
        const found = await look().catch(() => null);
        if (found === null && i === 0) {
          // first look: if the message never reached the server, say so instead of waiting
          const { data: d } = await sb.from("coach_messages").select("id").eq("user_id", uid).eq("role", "user").eq("content", text).gte("created_at", since).limit(1);
          if (!d?.length) return false;
        }
        if (found) { showReply(found, spoken); return true; }
        await new Promise<void>((r) => { const t = setTimeout(r, 5000); wake = () => { clearTimeout(t); r(); }; });
      }
      return false;
    } finally {
      document.removeEventListener("visibilitychange", onVisible);
      setRecovering(false);
    }
  }

  async function send(t: string, spoken = false) {
    t = t.trim();
    if (!t || busy) return;
    speech.cancel();
    setBusy(true);
    setError("");
    setRows((r) => [...r, { id: `tmp${Date.now()}`, role: "user", content: t, proposal: null, proposal_status: null, created_at: new Date().toISOString() }]);
    const sentAt = Date.now();
    try {
      let res: Response;
      try {
        res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
      } catch {
        // "Load failed": the connection dropped, not necessarily the coach
        if (!(await recover(t, sentAt, spoken))) setError("Lost the connection and the coach didn't answer. Try sending it again.");
        return;
      }
      const j = await res.json().catch(() => null);
      if (!j) { // a timeout page instead of JSON: the reply may still have been saved
        if (!(await recover(t, sentAt, spoken))) setError("The coach took too long. Try again, maybe asking for less at once.");
        return;
      }
      if (!res.ok) throw new Error(j.error || "failed");
      showReply(j.rows as CoachRow[], spoken);
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
              const plan = m.proposal?.type === "plan" ? m.proposal : m.proposal?.type === "program" ? m.proposal.first_week : undefined;
              if (s === "saved") plan?.bundled_from?.forEach((id) => void setStatus(id, "saved"));
            }} />
          ) : (
            <div key={m.id} className={`msg ${m.role === "user" ? "me" : m.role === "act" ? "act" : "ai"}`}>{m.role === "assistant" ? <Rich text={m.content} /> : m.content}</div>
          ),
        )}
        {busy && <Thinking recovering={recovering} />}
        {error && <div className="msg ai" role="alert">{error}</div>}
        {dictation.error && <div className="msg ai" role="alert">{dictation.error}</div>}
      </div>
      <div className="starters" role="group" aria-label="Ask the coach">
        {STARTERS.map((st) => (
          <button key={st.label} type="button" disabled={busy} onClick={() => (st.send ? void send(st.text) : (setText(st.text), inputRef.current?.focus()))}>{st.label}</button>
        ))}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); const t = text; setText(""); void send(t); }}>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" placeholder={dictation.listening ? "Listening…" : `Did ${defaultWorkoutName(data)}, pain 3…`} aria-label="Message the coach" />
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

/** Pulsing dots so it's clear the coach is working; a timer after a few seconds for the long ones (building a program). */
function Thinking({ recovering = false }: { recovering?: boolean }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="msg ai thinking" role="status" aria-label="The coach is thinking">
      <span className="dots" aria-hidden="true"><i /><i /><i /></span>
      <span>{recovering ? "Connection dropped - checking if the coach finished" : `Thinking${secs >= 4 ? ` · ${secs}s` : ""}`}</span>
      {!recovering && secs >= 20 && <span className="note"> - big ones (a whole program) can take a minute</span>}
    </div>
  );
}
