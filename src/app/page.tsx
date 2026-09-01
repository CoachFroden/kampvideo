"use client";

import { FormEvent, useEffect, useState } from "react";
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { ArrowRight, CalendarDays, ChevronRight, CirclePlay, Clock3, Film, Goal, LockKeyhole, LogOut, Play, Settings, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";

type Clip = { id: string; title: string; minute?: string; category?: string; start?: number; end?: number };
type Match = { id: string; opponent: string; date: string; venue?: string; homeScore?: number; awayScore?: number; isHome?: boolean; competition?: string; clips?: Clip[] };

async function api(user: User, path: string, init?: RequestInit) {
  const token = await user.getIdToken();
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);
  const [role, setRole] = useState("viewer");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, async current => {
    setUser(current); setVideoUrl("");
    if (!current) { setLoading(false); setApproved(false); return; }
    try {
      const idToken = await current.getIdToken();
      await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      const me = await api(current, "/api/me");
      const profile = await me.json();
      setApproved(profile.approved === true);
      setRole(profile.role ?? "viewer");
      if (profile.approved) {
        const response = await api(current, "/api/matches");
        const data = await response.json();
        setMatches(data.matches ?? []);
        setSelected(data.matches?.[0] ?? null);
      }
    } catch { setError("Kunne ikke kontrollere tilgangen din."); }
    finally { setLoading(false); }
  }), []);

  async function emailLogin(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch { setError("E-post eller passord stemmer ikke."); }
  }

  async function play(match: Match, clip?: Clip) {
    if (!user) return;
    setSelected(match); setVideoUrl("");
    const response = await api(user, "/api/video-url", { method: "POST", body: JSON.stringify({ matchId: match.id, clipId: clip?.id }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Kunne ikke åpne videoen."); return; }
    setVideoUrl(`${data.url}${clip?.start ? `#t=${clip.start}${clip.end ? `,${clip.end}` : ""}` : ""}`);
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    await signOut(auth);
  }

  if (loading) return <main className="center"><div className="loader"/><span>Sikrer kamprommet …</span></main>;
  if (!user) return <Login email={email} password={password} error={error} setEmail={setEmail} setPassword={setPassword} onEmail={emailLogin} onGoogle={() => signInWithPopup(auth, new GoogleAuthProvider())}/>;
  if (!approved) return <Pending user={user} logout={logout}/>;

  const allClips = matches.reduce((sum, match) => sum + (match.clips?.length ?? 0), 0);
  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark"><Goal/></span><span><b>SAMNANGER</b><small>KAMPROM</small></span></a>
      <div className="top-actions"><span className="secure"><ShieldCheck/> Sikker tilgang</span>{role === "admin" && <a className="admin-link" href="/admin"><Settings/> Administrer</a>}<button className="avatar" onClick={logout} title="Logg ut">{user.displayName?.[0] ?? user.email?.[0]?.toUpperCase() ?? "S"}<LogOut/></button></div>
    </header>

    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><Sparkles/> LAGETS PRIVATE KAMPARKIV</span><h1>Se kampen.<br/><em>Lær av øyeblikket.</em></h1><p>Alle kamper, nøkkelsituasjoner og trenerklipp samlet på ett trygt sted.</p></div>
      <div className="hero-orb"><div><Trophy/><b>{matches.length}</b><span>kamper i arkivet</span></div></div>
    </section>

    <section className="stats">
      <article><span className="stat-icon lime"><Film/></span><div><small>KAMPER</small><b>{matches.length}</b></div></article>
      <article><span className="stat-icon purple"><CirclePlay/></span><div><small>KLIPP</small><b>{allClips}</b></div></article>
      <article><span className="stat-icon blue"><Clock3/></span><div><small>SIST OPPDATERT</small><b>I dag</b></div></article>
    </section>

    {matches.length === 0 ? <section className="empty"><Film/><h2>Arkivet er klart</h2><p>Ingen kamper er registrert ennå. Første R2-film kobles til når kampdataene legges inn.</p></section> : <>
      <section className="section-head"><div><span>NYESTE KAMP</span><h2>{selected?.opponent ? `Samnanger – ${selected.opponent}` : "Kampvideo"}</h2></div><button className="ghost">Alle kamper <ArrowRight/></button></section>
      {selected && <section className="featured">
        <div className="video-wrap">
          {videoUrl ? <video src={videoUrl} controls autoPlay playsInline controlsList="nodownload" onContextMenu={e => e.preventDefault()}/> : <button className="poster" onClick={() => play(selected)}><span className="big-play"><Play fill="currentColor"/></span><small>SE HELE KAMPEN</small></button>}
          <div className="score"><span>SAM</span><b>{selected.homeScore ?? "–"}<i>:</i>{selected.awayScore ?? "–"}</b><span>{selected.opponent?.slice(0,3).toUpperCase()}</span></div>
        </div>
        <div className="match-info"><span className="pill">{selected.competition ?? "Seriekamp"}</span><h3>Samnanger <em>mot</em><br/>{selected.opponent}</h3><p><CalendarDays/> {selected.date || "Dato ikke satt"}</p><p><Users/> {selected.venue ?? "Arena ikke satt"}</p><button className="primary" onClick={() => play(selected)}><Play fill="currentColor"/> Spill av hele kampen</button></div>
      </section>}
      <section className="section-head clips-title"><div><span>NØKKELSITUASJONER</span><h2>Klipp fra kampen</h2></div></section>
      <section className="clips">{selected?.clips?.length ? selected.clips.map((clip, index) => <button className="clip" key={clip.id} onClick={() => play(selected, clip)}><span className={`clip-no n${index%3}`}>{String(index+1).padStart(2,"0")}</span><span className="clip-text"><small>{clip.category ?? "Analyse"} · {clip.minute ?? ""}</small><b>{clip.title}</b></span><span className="clip-play"><Play fill="currentColor"/></span><ChevronRight/></button>) : <p className="muted">Ingen klipp er markert i denne kampen ennå.</p>}</section>
    </>}
    {error && <div className="toast">{error}<button onClick={() => setError("")}>×</button></div>}
    <footer><LockKeyhole/> Privat laginnhold · Beskyttet med Firebase og øktbundet videostrømming</footer>
  </main>;
}

function Login({ email, password, error, setEmail, setPassword, onEmail, onGoogle }: { email:string; password:string; error:string; setEmail:(v:string)=>void; setPassword:(v:string)=>void; onEmail:(e:FormEvent)=>void; onGoogle:()=>void }) {
  return <main className="login"><div className="login-glow"/><section className="login-card"><div className="brand login-brand"><span className="brand-mark"><Goal/></span><span><b>SAMNANGER</b><small>KAMPROM</small></span></div><span className="lock"><LockKeyhole/></span><h1>Velkommen til<br/><em>kamprommet</em></h1><p>Et lukket videoarkiv for laget. Logg inn med en godkjent konto.</p><button className="google" onClick={onGoogle}><b>G</b> Fortsett med Google</button><div className="divider"><span>eller</span></div><form onSubmit={onEmail}><label>E-post<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Passord<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error && <p className="form-error">{error}</p>}<button className="primary" type="submit">Logg inn <ArrowRight/></button></form><small className="privacy"><ShieldCheck/> Tilgang gis manuelt av lagets administrator</small></section></main>;
}

function Pending({ user, logout }: { user: User; logout:()=>void }) {
  return <main className="center pending"><div className="pending-icon"><LockKeyhole/></div><span className="eyebrow">SIKKER TILGANG</span><h1>Du står på ventelisten</h1><p>Kontoen <b>{user.email}</b> er registrert, men må godkjennes av en administrator før kampene blir synlige.</p><button className="ghost" onClick={logout}><LogOut/> Logg ut</button></main>;
}
