"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { ArrowLeft, CalendarDays, Check, CircleUserRound, Clock3, Film, FolderOpen, Goal, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, Users, Video } from "lucide-react";

type Clip = { id: string; title: string; category: string; start: number; end: number; minute: string };
type Match = { id: string; opponent: string; date: string; venue?: string; competition?: string; homeScore: number; awayScore: number; isHome?: boolean; videoKey: string; clips?: Clip[] };
type ManagedUser = { id: string; email: string; name: string; approved: boolean; role: "viewer" | "admin"; createdAt?: string | null };
type VideoFile = { key: string; size: number; modified?: string | null };
type AdminData = { users: ManagedUser[]; matches: Match[]; files: VideoFile[] };
type Tab = "matches" | "clips" | "users";

const emptyData: AdminData = { users: [], matches: [], files: [] };

async function api(user: User, path: string, init?: RequestInit) {
  const token = await user.getIdToken();
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AdminData>(emptyData);
  const [tab, setTab] = useState<Tab>("matches");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (current: User) => {
    setLoading(true); setError("");
    try {
      const response = await api(current, "/api/admin");
      if (response.status === 403) { window.location.href = "/"; return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Kunne ikke hente administrasjonsdata");
      setData(payload);
    } catch (err) { setError(err instanceof Error ? err.message : "Noe gikk galt"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => onAuthStateChanged(auth, (current) => {
    if (!current) { window.location.href = "/"; return; }
    setUser(current); void load(current);
  }), [load]);

  async function mutate(init: RequestInit, success: string, path = "/api/admin") {
    if (!user) return false;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await api(user, path, init);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setNotice(success); await load(user); return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Noe gikk galt"); return false; }
    finally { setSaving(false); }
  }

  const waiting = useMemo(() => data.users.filter((item) => !item.approved).length, [data.users]);
  return <main className="admin-shell">
    <header className="admin-topbar">
      <Link href="/" className="admin-back"><ArrowLeft/> Til kamprommet</Link>
      <div className="brand"><span className="brand-mark"><Goal/></span><span><b>SAMNANGER</b><small>ADMIN</small></span></div>
      <span className="secure"><ShieldCheck/> Kun administrator</span>
    </header>

    <section className="admin-hero">
      <div><span className="eyebrow">KONTROLLSENTER</span><h1>Administrer<br/><em>kamprommet</em></h1><p>Kamper, trenerklipp og tilgang samlet på ett sted.</p></div>
      <div className="admin-summary">
        <article><Film/><b>{data.matches.length}</b><span>kamper</span></article>
        <article><Video/><b>{data.matches.reduce((sum, item) => sum + (item.clips?.length ?? 0), 0)}</b><span>klipp</span></article>
        <article><Users/><b>{waiting}</b><span>venter</span></article>
      </div>
    </section>

    <nav className="admin-tabs" aria-label="Administrasjon">
      <button className={tab === "matches" ? "active" : ""} onClick={() => setTab("matches")}><CalendarDays/> Kamper</button>
      <button className={tab === "clips" ? "active" : ""} onClick={() => setTab("clips")}><Clock3/> Klipp</button>
      <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><CircleUserRound/> Brukere {waiting > 0 && <i>{waiting}</i>}</button>
      <button className="refresh" onClick={() => user && load(user)} title="Oppdater"><RefreshCw/></button>
    </nav>

    {error && <div className="admin-alert error">{error}</div>}
    {notice && <div className="admin-alert success"><Check/> {notice}</div>}
    {loading ? <div className="admin-loading"><LoaderCircle/> Henter kontrollsenteret …</div> : <>
      {tab === "matches" && <MatchesPanel data={data} saving={saving} mutate={mutate}/>} 
      {tab === "clips" && <ClipsPanel matches={data.matches} saving={saving} mutate={mutate}/>} 
      {tab === "users" && <UsersPanel users={data.users} saving={saving} mutate={mutate}/>} 
    </>}
  </main>;
}

function MatchesPanel({ data, saving, mutate }: { data: AdminData; saving: boolean; mutate: (init: RequestInit, success: string, path?: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ opponent: "", date: "", venue: "Hagabotnane kunstgress", competition: "G14 · Seriekamp", homeScore: "", awayScore: "", isHome: true, videoKey: "" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate({ method: "POST", body: JSON.stringify({ action: "createMatch", match: form }) }, "Kampen ble lagt til");
    if (ok) setForm((value) => ({ ...value, opponent: "", date: "", homeScore: "", awayScore: "", videoKey: "" }));
  }
  return <section className="admin-grid">
    <form className="admin-card admin-form" onSubmit={submit}>
      <div className="admin-card-head"><span className="admin-icon lime"><Plus/></span><div><small>NY KAMP</small><h2>Legg til kamp</h2></div></div>
      <div className="form-grid">
        <label className="wide">Motstander<input value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} placeholder="Bønes 2" required/></label>
        <label>Dato<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required/></label>
        <label>Bane<input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })}/></label>
        <label>Kampform<input value={form.competition} onChange={(e) => setForm({ ...form, competition: e.target.value })}/></label>
        <label className="score-input">Samnanger<input type="number" min="0" max="99" value={form.homeScore} onChange={(e) => setForm({ ...form, homeScore: e.target.value })} required/></label>
        <label className="score-input">Motstander<input type="number" min="0" max="99" value={form.awayScore} onChange={(e) => setForm({ ...form, awayScore: e.target.value })} required/></label>
        <label className="wide file-select">Videofil<select value={form.videoKey} onChange={(e) => setForm({ ...form, videoKey: e.target.value })} required><option value="">Velg fil fra R2 …</option>{data.files.map((file) => <option key={file.key} value={file.key}>{file.key} · {formatBytes(file.size)}</option>)}</select><FolderOpen/></label>
        <label className="toggle wide"><input type="checkbox" checked={form.isHome} onChange={(e) => setForm({ ...form, isHome: e.target.checked })}/><span/> Samnanger er hjemmelag</label>
      </div>
      <button className="admin-primary" disabled={saving}>{saving ? <LoaderCircle/> : <Plus/>} Legg til kamp</button>
    </form>
    <div className="admin-card list-card">
      <div className="admin-card-head"><span className="admin-icon violet"><Film/></span><div><small>ARKIV</small><h2>Registrerte kamper</h2></div></div>
      <div className="admin-list">{data.matches.length === 0 ? <p className="admin-empty">Ingen kamper registrert.</p> : data.matches.map((match) => <article key={match.id} className="match-row"><div className="match-date"><b>{new Date(`${match.date}T12:00:00`).getDate()}</b><span>{new Date(`${match.date}T12:00:00`).toLocaleDateString("nb-NO", { month: "short" })}</span></div><div className="row-main"><small>{match.competition}</small><b>Samnanger {match.homeScore}–{match.awayScore} {match.opponent}</b><span>{match.videoKey}</span></div><button type="button" className="icon-danger" title="Slett kamp" disabled={saving} onClick={() => confirm(`Slette kampen mot ${match.opponent}?`) && mutate({ method: "DELETE" }, "Kampen ble slettet", `/api/admin?matchId=${encodeURIComponent(match.id)}`)}><Trash2/></button></article>)}</div>
    </div>
  </section>;
}

function ClipsPanel({ matches, saving, mutate }: { matches: Match[]; saving: boolean; mutate: (init: RequestInit, success: string, path?: string) => Promise<boolean> }) {
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [title, setTitle] = useState(""); const [category, setCategory] = useState("Analyse"); const [start, setStart] = useState(""); const [end, setEnd] = useState("");
  const selected = matches.find((item) => item.id === matchId) ?? matches[0];
  useEffect(() => { if (!matchId && matches[0]) setMatchId(matches[0].id); }, [matchId, matches]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate({ method: "POST", body: JSON.stringify({ action: "createClip", matchId, clip: { title, category, start: toSeconds(start), end: toSeconds(end) } }) }, "Klippet ble lagt til");
    if (ok) { setTitle(""); setStart(""); setEnd(""); }
  }
  return <section className="admin-grid">
    <form className="admin-card admin-form" onSubmit={submit}>
      <div className="admin-card-head"><span className="admin-icon blue"><Clock3/></span><div><small>NYTT KLIPP</small><h2>Marker situasjon</h2></div></div>
      <div className="form-grid">
        <label className="wide">Kamp<select value={matchId} onChange={(e) => setMatchId(e.target.value)} required><option value="">Velg kamp …</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.date} · Samnanger – {match.opponent}</option>)}</select></label>
        <label className="wide">Tittel<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gjenvinning og gjennombrudd" required/></label>
        <label>Kategori<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Analyse</option><option>Angrep</option><option>Forsvar</option><option>Press</option><option>Overgang</option><option>Mål</option><option>Sjanse</option><option>Dødball</option></select></label>
        <label>Starttid<input value={start} onChange={(e) => setStart(e.target.value)} placeholder="35:18" inputMode="numeric" required/></label>
        <label>Sluttid<input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="35:42" inputMode="numeric" required/></label>
      </div>
      <p className="form-help">Bruk tidspunktet som vises i videospilleren, for eksempel 35:18.</p>
      <button className="admin-primary" disabled={saving || !matches.length}>{saving ? <LoaderCircle/> : <Plus/>} Lag klipp</button>
    </form>
    <div className="admin-card list-card">
      <div className="admin-card-head"><span className="admin-icon violet"><Video/></span><div><small>{selected?.opponent?.toUpperCase() ?? "KAMP"}</small><h2>Tidskodede klipp</h2></div></div>
      <div className="admin-list">{!selected?.clips?.length ? <p className="admin-empty">Ingen klipp i denne kampen ennå.</p> : selected.clips.map((clip) => <article key={clip.id} className="clip-row"><span className="time-badge">{clip.minute}</span><div className="row-main"><small>{clip.category}</small><b>{clip.title}</b><span>{formatClock(clip.start)}–{formatClock(clip.end)}</span></div><button type="button" className="icon-danger" title="Slett klipp" disabled={saving} onClick={() => confirm(`Slette klippet «${clip.title}»?`) && mutate({ method: "DELETE" }, "Klippet ble slettet", `/api/admin?matchId=${encodeURIComponent(selected.id)}&clipId=${encodeURIComponent(clip.id)}`)}><Trash2/></button></article>)}</div>
    </div>
  </section>;
}

function UsersPanel({ users, saving, mutate }: { users: ManagedUser[]; saving: boolean; mutate: (init: RequestInit, success: string, path?: string) => Promise<boolean> }) {
  return <section className="admin-card users-card"><div className="admin-card-head"><span className="admin-icon lime"><Users/></span><div><small>TILGANG</small><h2>Brukere og godkjenning</h2></div></div><div className="user-list">{users.map((item) => <article key={item.id} className="user-row"><span className={`user-avatar ${item.approved ? "approved" : ""}`}>{(item.name || item.email || "?")[0].toUpperCase()}</span><div className="row-main"><b>{item.name || "Uten navn"}</b><span>{item.email}</span><small>{item.approved ? item.role === "admin" ? "Administrator" : "Godkjent bruker" : "Venter på godkjenning"}</small></div><label className="role-select"><span>Rolle</span><select value={item.role} disabled={!item.approved || saving} onChange={(e) => mutate({ method: "PATCH", body: JSON.stringify({ action: "updateUser", userId: item.id, approved: true, role: e.target.value }) }, "Rollen ble oppdatert")}><option value="viewer">Bruker</option><option value="admin">Administrator</option></select></label><button className={item.approved ? "access-button revoke" : "access-button approve"} disabled={saving} onClick={() => mutate({ method: "PATCH", body: JSON.stringify({ action: "updateUser", userId: item.id, approved: !item.approved, role: item.approved ? "viewer" : item.role }) }, item.approved ? "Tilgangen ble fjernet" : "Brukeren ble godkjent")}>{item.approved ? "Fjern tilgang" : <><Check/> Godkjenn</>}</button></article>)}</div></section>;
}

function toSeconds(value: string) {
  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return Number.NaN;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.NaN;
}
const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const formatBytes = (bytes: number) => bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(2)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
