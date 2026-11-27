"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";

export default function Account() {
  const { sb, data } = useApp();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { sb.auth.getUser().then(({ data: d }) => setEmail(d.user?.email ?? "")); }, [sb]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) return setMsg({ ok: false, text: "Use at least 8 characters." });
    if (pw !== pw2) return setMsg({ ok: false, text: "Those two passwords don't match." });
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setPw(""); setPw2("");
    setMsg({ ok: true, text: "Password saved. You can now sign in with email + password on any device." });
  }

  return (
    <div className="page">
      <div className="page-head"><h1>Account</h1></div>
      <section className="card">
        <h2>Signed in</h2>
        <span>{data.profile.display_name} · {email}</span>
        <div className="row">
          <button onClick={async () => { await sb.auth.signOut(); location.href = "/login"; }}>Sign out</button>
        </div>
      </section>
      <form className="card" onSubmit={save}>
        <h2>Set a password</h2>
        <span className="note">So you can sign in on your phone without waiting for an email.</span>
        <input type="text" autoComplete="username" value={email} readOnly hidden aria-hidden="true" />
        <label htmlFor="pw1">New password</label>
        <input id="pw1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ font: "inherit", padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)" }} />
        <label htmlFor="pw2">Again</label>
        <input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ font: "inherit", padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)" }} />
        <button className="primary" disabled={busy}>Save password</button>
        {msg && <span className={msg.ok ? "note" : "status"} role="status">{msg.text}</span>}
      </form>
    </div>
  );
}
