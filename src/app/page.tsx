"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import ClipPlayer from "@/components/ClipPlayer";
import { ArrowRight, CalendarDays, ChevronRight, CirclePlay, Clock3, Film, Goal, LockKeyhole, LogOut, MapPin, Play, Search, Settings, ShieldCheck, Sparkles, Trophy, Users, X } from "lucide-react";

type Clip = { id: string; title: string; minute?: string; category?: string; start?: number; end?: number; good?: string; improve?: string };
type Match = { id: string; opponent: string; date: string; venue?: string; homeScore?: number; awayScore?: number; isHome?: boolean; competition?: string; clips?: Clip[] };
type ArchiveFilter = "all" | "win" | "draw" | "loss";

async function api(user: User, path: string, init?: RequestInit) {
  const token = await user.getIdToken();
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
}

function resultOf(match: Match): ArchiveFilter | "unknown" {
  if (typeof match.homeScore !== "number" || typeof match.awayScore !== "number") return "unknown";
  if (match.homeScore > match.awayScore) return "win";
  if (match.homeScore < match.awayScore) return "loss";
  return "draw";
}

function formatDate(date: string) {
  if (!date) return "Dato ikke satt";
  return new Date(`${date}T12:00:00`).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);
  const [role, setRole] = useState("viewer");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [activeClip, setActiveClip] = useState<Clip | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showMatches, setShowMatches] = useState(false);
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");

  useEffect(() => onAuthStateChanged(auth, async current => {
    setUser(current); setVideoUrl(""); setActiveClip(null);
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

  function chooseMatch(match: Match) {
    setSelected(match);
    setVideoUrl("");
    setActiveClip(null);
    setShowMatches(false);
    window.setTimeout(() => document.getElementById("selected-match")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function play(match: Match, clip?: Clip, fullMatchStart?: number) {
    if (!user) return;
    setSelected(match); setVideoUrl(""); setActiveClip(clip ?? null); setShowMatches(false);
    const response = await api(user, "/api/video-url", { method: "POST", body: JSON.stringify({ matchId: match.id, clipId: clip?.id }) });
    const data = await response.json();
    if (!response.ok) { setActiveClip(null); setError(data.error ?? "Kunne ikke åpne videoen."); return; }
    const startFragment = !clip && typeof fullMatchStart === "number" && fullMatchStart > 0 ? `#t=${fullMatchStart}` : "";
    setVideoUrl(`${data.url}${startFragment}`);
    if (clip) window.setTimeout(() => document.getElementById("selected-match")?.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    await signOut(auth);
  }

  const filteredMatches = useMemo(() => {
    const q = archiveQuery.trim().toLowerCase();
    return matches.filter(match => {
      const matchesFilter = archiveFilter === "all" || resultOf(match) === archiveFilter;
      const haystack = `${match.opponent} ${match.competition ?? ""} ${match.venue ?? ""} ${match.date}`.toLowerCase();
      return matchesFilter && (!q || haystack.includes(q));
    });
  }, [matches, archiveFilter, archiveQuery]);

  const resultCounts = useMemo(() => ({
    win: matches.filter(match => resultOf(match) === "win").length,
    draw: matches.filter(match => resultOf(match) === "draw").length,
    loss: matches.filter(match => resultOf(match) === "loss").length,
  }), [matches]);

  if (loading) return <main className="center"><div className="loader"/><span>Sikrer kamprommet …</span></main>;
  if (!user) return <Login email={email} password={password} error={error} setEmail={setEmail} setPassword={setPassword} onEmail={emailLogin} onGoogle={() => signInWithPopup(auth, new GoogleAuthProvider())}/>;
  if (!approved) return <Pending user={user} logout={logout}/>;

  const allClips = matches.reduce((sum, match) => sum + (match.clips?.length ?? 0), 0);
  const isLatest = selected?.id === matches[0]?.id;
  const hasBoundedClip = activeClip && typeof activeClip.start === "number" && typeof activeClip.end === "number" && activeClip.end > activeClip.start;

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
      <section className="section-head"><div><span>{isLatest ? "NYESTE KAMP" : "VALGT KAMP"}</span><h2>{selected?.opponent ? `Samnanger – ${selected.opponent}` : "Kampvideo"}</h2></div><button type="button" className={`ghost archive-toggle ${showMatches ? "active" : ""}`} onClick={() => setShowMatches(value => !value)}>{showMatches ? <><X/> Lukk arkiv</> : <>Alle kamper <ArrowRight/></>}</button></section>

      {showMatches && <section className="match-archive" aria-label="Kamparkiv">
        <div className="archive-head">
          <div><span className="eyebrow">KAMPARKIV</span><h2>Alle kamper</h2><p>Finn en kamp etter motstander, dato eller arena.</p></div>
          <div className="archive-record"><b>{resultCounts.win}</b><span>SEIRE</span><i>·</i><b>{resultCounts.draw}</b><span>UAVGJORT</span><i>·</i><b>{resultCounts.loss}</b><span>TAP</span></div>
        </div>

        <div className="archive-tools">
          <label className="archive-search"><Search/><input value={archiveQuery} onChange={e => setArchiveQuery(e.target.value)} placeholder="Søk motstander, arena …"/></label>
          <div className="archive-filters" role="group" aria-label="Filtrer kamper">
            <button className={archiveFilter === "all" ? "active" : ""} onClick={() => setArchiveFilter("all")}>Alle <b>{matches.length}</b></button>
            <button className={archiveFilter === "win" ? "active" : ""} onClick={() => setArchiveFilter("win")}>Seier <b>{resultCounts.win}</b></button>
            <button className={archiveFilter === "draw" ? "active" : ""} onClick={() => setArchiveFilter("draw")}>Uavgjort <b>{resultCounts.draw}</b></button>
            <button className={archiveFilter === "loss" ? "active" : ""} onClick={() => setArchiveFilter("loss")}>Tap <b>{resultCounts.loss}</b></button>
          </div>
        </div>

        {filteredMatches.length ? <div className="archive-grid">
          {filteredMatches.map((match, index) => {
            const result = resultOf(match);
            const latest = match.id === matches[0]?.id;
            const selectedMatch = match.id === selected?.id;
            return <button type="button" className={`archive-card ${selectedMatch ? "selected" : ""}`} key={match.id} onClick={() => chooseMatch(match)}>
              <div className="archive-card-top">
                <div className="archive-date"><b>{match.date ? new Date(`${match.date}T12:00:00`).getDate() : "–"}</b><span>{match.date ? new Date(`${match.date}T12:00:00`).toLocaleDateString("nb-NO", { month: "short" }).replace(".", "") : ""}</span></div>
                <div className="archive-tags">{latest && <span className="latest-tag">NYESTE</span>}{result !== "unknown" && <span className={`result-tag ${result}`}>{result === "win" ? "SEIER" : result === "draw" ? "UAVGJORT" : "TAP"}</span>}</div>
              </div>
              <small className="archive-competition">{match.competition ?? "Kamp"}</small>
              <div className="archive-fixture"><span>SAMNANGER</span><b>{match.homeScore ?? "–"}<i>–</i>{match.awayScore ?? "–"}</b><span>{match.opponent.toUpperCase()}</span></div>
              <div className="archive-meta"><span><CalendarDays/>{formatDate(match.date)}</span>{match.venue && <span><MapPin/>{match.venue}</span>}</div>
              <div className="archive-card-foot"><span>{match.isHome === false ? "Bortekamp" : "Hjemmekamp"}</span><span>{match.clips?.length ?? 0} klipp</span><strong>Åpne kamp <ChevronRight/></strong></div>
            </button>;
          })}
        </div> : <div className="archive-empty"><Search/><b>Ingen kamper funnet</b><span>Prøv et annet søk eller filter.</span></div>}
      </section>}

      {selected && <section className="featured" id="selected-match">
        <div className="video-wrap">
          {videoUrl ? hasBoundedClip ? <ClipPlayer src={videoUrl} clip={activeClip!} onOpenFullMatch={() => void play(selected, undefined, activeClip?.start)}/> : <video src={videoUrl} controls autoPlay playsInline controlsList="nodownload" onContextMenu={e => e.preventDefault()}/> : <button className="poster" onClick={() => void play(selected)}><span className="big-play"><Play fill="currentColor"/></span><small>SE HELE KAMPEN</small></button>}
          <div className="score"><span>SAM</span><b>{selected.homeScore ?? "–"}<i>:</i>{selected.awayScore ?? "–"}</b><span>{selected.opponent?.slice(0,3).toUpperCase()}</span></div>
        </div>
        <div className="match-info"><span className="pill">{activeClip ? "Trenerklipp" : selected.competition ?? "Seriekamp"}</span><h3>{activeClip ? activeClip.title : <>Samnanger <em>mot</em><br/>{selected.opponent}</>}</h3>{activeClip ? <><p><Clock3/> {activeClip.minute || `${Math.round(activeClip.start ?? 0)}–${Math.round(activeClip.end ?? 0)} sek`}</p><p><Film/> Klippet stopper automatisk ved sluttiden</p></> : <><p><CalendarDays/> {selected.date || "Dato ikke satt"}</p><p><Users/> {selected.venue ?? "Arena ikke satt"}</p></>}<button className="primary" onClick={() => void play(selected)}><Play fill="currentColor"/> Spill av hele kampen</button></div>
      </section>}
      <section className="section-head clips-title"><div><span>NØKKELSITUASJONER</span><h2>Klipp fra kampen</h2></div></section>
      <section className="clips">{selected?.clips?.length ? selected.clips.map((clip, index) => <button className="clip" key={clip.id} onClick={() => void play(selected, clip)}><span className={`clip-no n${index%3}`}>{String(index+1).padStart(2,"0")}</span><span className="clip-text"><small>{clip.category ?? "Analyse"} · {clip.minute ?? ""}</small><b>{clip.title}</b>{(clip.good || clip.improve) && <span className="viewer-notes">{clip.good && <span className="viewer-note good"><strong>Dette er bra</strong>{clip.good}</span>}{clip.improve && <span className="viewer-note improve"><strong>Dette bør forbedres</strong>{clip.improve}</span>}</span>}</span><span className="clip-play"><Play fill="currentColor"/></span><ChevronRight/></button>) : <p className="muted">Ingen klipp er markert i denne kampen ennå.</p>}</section>
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
