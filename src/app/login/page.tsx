"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const sb = createClient();
    if (mode === "password") {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setState("error"); setMsg("That email and password didn't match. No password yet? Use the email link below, then set one in Account."); }
      else location.assign("/");
      return;
    }
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    if (error) { setState("error"); setMsg(error.message); } else setState("sent");
  }

  return (
    <main className="login">
      <h1>Cairn</h1>
      {state === "sent" ? (
        <div className="banner good"><strong>Check your email</strong><span>Tap the link to sign in.</span></div>
      ) : (
        <form onSubmit={submit} className="card">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {mode === "password" && (
            <>
              <label htmlFor="pw">Password</label>
              <input id="pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </>
          )}
          <button className="primary" disabled={state === "sending"}>
            {state === "sending" ? "One sec…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
          </button>
          {state === "error" && <span className="status" role="alert">{msg || "Couldn't sign in. Try again."}</span>}
          <button type="button" className="link" onClick={() => { setMode(mode === "password" ? "link" : "password"); setState("idle"); }}>
            {mode === "password" ? "Email me a link instead" : "Use a password instead"}
          </button>
        </form>
      )}
    </main>
  );
}
