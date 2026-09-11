"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, Goal, LoaderCircle, ShieldCheck, UserPlus } from "lucide-react";
import { User, onAuthStateChanged, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

async function api(user: User, path: string, init?: RequestInit) {
  const token = await user.getIdToken();
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
}

export default function NewUserPage() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "admin">("viewer");
  const [approved, setApproved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => onAuthStateChanged(auth, async (current) => {
    if (!current) { window.location.href = "/"; return; }
    try {
      const response = await api(current, "/api/me");
      const profile = await response.json();
      if (!response.ok || profile.role !== "admin") { window.location.href = "/"; return; }
      setUser(current);
    } catch {
      window.location.href = "/";
    }
  }), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true); setError(""); setNotice("");
    const cleanEmail = email.trim();
    try {
      const response = await api(user, "/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ action: "createUser", name: name.trim(), email: cleanEmail, role, approved }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Kunne ikke opprette brukeren.");

      try {
        await sendPasswordResetEmail(auth, cleanEmail);
        setNotice(`Brukeren er opprettet. ${cleanEmail} har fått en e-post for å velge sitt eget passord.`);
      } catch {
        setNotice(`Brukeren er opprettet, men e-posten for å velge passord kunne ikke sendes. Be brukeren bruke «Glemt passord?» på innloggingssiden.`);
      }
      setName(""); setEmail(""); setRole("viewer"); setApproved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke opprette brukeren.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="admin-shell">
    <header className="admin-topbar">
      <Link href="/admin" className="admin-back"><ArrowLeft/> Til administrasjon</Link>
      <div className="brand"><span className="brand-mark"><Goal/></span><span><b>SAMNANGER</b><small>ADMIN</small></span></div>
      <span className="secure"><ShieldCheck/> Kun administrator</span>
    </header>

    <section className="admin-hero compact-admin-hero">
      <div><span className="eyebrow">TILGANG</span><h1>Ny<br/><em>bruker</em></h1><p>Opprett kontoen her. Brukeren får en e-post der vedkommende velger sitt eget passord.</p></div>
    </section>

    {error && <div className="admin-alert error">{error}</div>}
    {notice && <div className="admin-alert success"><Check/> {notice}</div>}

    <section className="admin-grid single-admin-grid">
      <form className="admin-card admin-form" onSubmit={submit}>
        <div className="admin-card-head"><span className="admin-icon lime"><UserPlus/></span><div><small>NY KONTO</small><h2>Opprett bruker</h2></div></div>
        <div className="form-grid">
          <label className="wide">Navn<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ola Nordmann" required/></label>
          <label className="wide">E-post<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@epost.no" required/></label>
          <label>Rolle<select value={role} onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "viewer")}><option value="viewer">Bruker</option><option value="admin">Administrator</option></select></label>
          <label className="toggle"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)}/><span/> Godkjenn med en gang</label>
        </div>
        <p className="form-help">Du får aldri se brukerens passord. Kontoen får et tilfeldig, utilgjengelig startpassord, og brukeren velger sitt eget via e-posten som sendes etter opprettelsen.</p>
        <button className="admin-primary" disabled={saving || !user}>{saving ? <LoaderCircle/> : <UserPlus/>} {saving ? "Oppretter …" : "Opprett og send passordlenke"}</button>
      </form>
    </section>
  </main>;
}
