"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setState("error"); setMsg(error.message); } else setState("sent");
  }

  return (
    <main className="login">
      <h1>Cairn</h1>
      {state === "sent" ? (
        <div className="banner good"><strong>Check your email</strong><span>Tap the link on this device to sign in.</span></div>
      ) : (
        <form onSubmit={submit} className="card">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <button className="primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
          {state === "error" && <span className="status" role="alert">{msg || "Couldn't send that. Try again."}</span>}
        </form>
      )}
    </main>
  );
}
