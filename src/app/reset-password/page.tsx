"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Goal, Mail, ShieldCheck } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setMessage(""); setSending(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Hvis e-postadressen finnes i Kamprommet, er det sendt en lenke for å velge nytt passord.");
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String((err as { code?: unknown }).code) : "";
      if (code.includes("user-not-found")) setMessage("Hvis e-postadressen finnes i Kamprommet, er det sendt en lenke for å velge nytt passord.");
      else if (code.includes("invalid-email")) setError("E-postadressen ser ikke riktig ut.");
      else if (code.includes("operation-not-allowed")) setError("Tilbakestilling av passord er ikke aktivert ennå.");
      else setError("Kunne ikke sende e-post akkurat nå. Prøv igjen.");
    } finally {
      setSending(false);
    }
  }

  return <main className="login"><div className="login-glow"/><section className="login-card">
    <Link href="/" className="auth-back"><ArrowLeft/> Til innlogging</Link>
    <div className="brand login-brand"><span className="brand-mark"><Goal/></span><span><b>SAMNANGER</b><small>KAMPROM</small></span></div>
    <span className="lock"><Mail/></span>
    <h1>Nytt<br/><em>passord</em></h1>
    <p>Skriv inn e-postadressen. Du får en sikker lenke fra Firebase der du kan velge nytt passord.</p>
    <form onSubmit={submit}>
      <label>E-post<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required/></label>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      <button className="primary" type="submit" disabled={sending}>{sending ? "Sender …" : "Send lenke"}</button>
    </form>
    <small className="privacy"><ShieldCheck/> Passordet håndteres av Firebase Authentication</small>
  </section></main>;
}
