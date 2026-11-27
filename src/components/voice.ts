"use client";
// Talk to the coach: browser speech-to-text in, speech synthesis out. No server, no keys.
import { useCallback, useEffect, useRef, useState } from "react";

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const recognitionCtor = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Speech to text. onFinal fires once with the whole thing when you stop talking (or tap again). */
export function useDictation(onInterim: (t: string) => void, onFinal: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<Rec | null>(null);
  const text = useRef("");
  const cb = useRef({ onInterim, onFinal });
  cb.current = { onInterim, onFinal };

  useEffect(() => setSupported(!!recognitionCtor()), []);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError("");
    text.current = "";
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false; // stops on its own after a pause
    r.onresult = (e) => {
      let finals = "", interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals += res[0].transcript;
        else interim += res[0].transcript;
      }
      text.current = (finals + interim).trim();
      cb.current.onInterim(text.current);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Mic is blocked. Allow it for this site in your browser settings, or use the keyboard mic.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError("Didn't catch that. Try again.");
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      if (text.current) cb.current.onFinal(text.current);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  useEffect(() => () => rec.current?.abort(), []);
  return { supported, listening, start, stop, error };
}

/** Markdown-ish coach text -> something that sounds right read aloud. */
export function speakable(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/(\d[\d,]*)\s*-\s*(\d[\d,]*)(?=\s*(ft|lb|min|reps|%|days|weeks|x\b))/g, "$1 to $2") // 1,000-1,500 ft -> 1,000 to 1,500 ft
    .replace(/(\d+)\/10\b/g, "$1 out of 10")
    .replace(/\s+-\s+/g, ", ")
    .replace(/\n+/g, ". ")
    .replace(/\.\s*\./g, ".");
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false); // checked after mount so server and browser render the same
  useEffect(() => setSupported("speechSynthesis" in window), []);

  /** iOS only lets a page speak after a tap: call this inside the tap that starts a voice turn. */
  const unlock = useCallback(() => {
    if (!supported) return;
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }, [supported]);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!supported || !text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    const lang = navigator.language || "en-US";
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith(lang.slice(0, 2)));
    const pick = voices.find((v) => /enhanced|premium|natural/i.test(v.name)) ?? voices.find((v) => v.lang === lang) ?? voices[0];
    if (pick) u.voice = pick;
    u.lang = pick?.lang ?? lang;
    u.rate = 1.05;
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [supported]);

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  return { supported, speaking, speak, cancel, unlock };
}
