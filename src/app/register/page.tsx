"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Goal, ShieldCheck, UserPlus } from "lucide-react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

function messageFor(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code.includes("email-already-in-use")) return "Det finnes allerede en konto med denne e-postadressen. Logg inn eller bruk Glemt passord.";
  if (code.includes("invalid-email")) return "E-postadressen ser ikke riktig ut.";
  if (code.includes("weak-password")) return "Passordet er for svakt. Bruk minst 8 tegn.";
  if (code.includes("operation-not-allowed")) return "Registrering med e-post og passord er ikke aktivert ennå.";
  return error instanceof Error ? error.message : "Kunne ikke opprette kontoen.";
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const cleanName = name.trim();
    if (cleanName.length < 2) { setError("Skriv inn navnet ditt."); return; }
    if (password.length < 8) { setError("Passordet må være minst 8 tegn."); return; }
    if (password !== confirmPassword) { setError("Passordene er ikke like."); return; }

    setSaving(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: cleanName });
      const token = await credential.user.getIdToken(true);
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: cleanName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Kunne ikke registrere profilen.");
      router.replace("/");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  return <main className="login"><div className="login-glow"/><section className="login-card">
    <Link href="/" className="auth-back"><ArrowLeft/> Til innlogging</Link>
    <div className="brand login-brand"><span className="brand-mark"><Goal/></span><span><b>SAMNANGER</b><small>KAMPROM</small></span></div>
    <span className="lock"><UserPlus/></span>
    <h1>Opprett<br/><em>konto</em></h1>
    <p>Registrer deg med e-post og passord. Kontoen må godkjennes av en administrator før kampene blir synlige.</p>
    <form onSubmit={submit}>
      <label>Navn<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required/></label>
      <label>E-post<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required/></label>
      <label>Passord<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required/></label>
      <label>Gjenta passord<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} required/></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary" type="submit" disabled={saving}>{saving ? "Oppretter …" : <>Opprett konto <ArrowRight/></>}</button>
    </form>
    <small className="privacy"><ShieldCheck/> Ingen får tilgang til video før kontoen er godkjent</small>
  </section></main>;
}
