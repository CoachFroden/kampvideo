"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import "./admin.css";
import {
  ArrowLeft,
  Check,
  CirclePlay,
  Clock3,
  Film,
  Goal,
  LockKeyhole,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

type Clip = {
  id: string;
  title: string;
  category?: string;
  minute?: string;
  start?: number;
  end?: number;
};

type AdminMatch = {
  id: string;
  opponent: string;
  date: string;
  dateIso?: string;
  venue?: string;
  competition?: string;
  videoKey?: string;
  clips?: Clip[];
};

type AdminUser = {
  uid: string;
  email: string;
  name?: string;
  approved: boolean;
  role: string;
};

type Overview = { matches: AdminMatch[]; users: AdminUser[] };

async function adminApi(user: User, path: string, init?: RequestInit) {
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

function clockToSeconds(value: string) {
  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return Number.NaN;
  if (parts.length === 2 && parts[1] < 60) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts[1] < 60 && parts[2] < 60) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return Number.NaN;
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  return typeof data.error === "string" && !data.error.includes("_") ? data.error : fallback;
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<Overview>({ matches: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clipMatchId, setClipMatchId] = useState("");

  async function load(current: User, quiet = false) {
    if (!quiet) setLoading(true);
    const response = await adminApi(current, "/api/admin/overview");
    if (response.status === 403) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    if (!response.ok) throw new Error("Kunne ikke hente administrasjonen.");
    const data = await response.json() as Overview;
    setOverview(data);
    setClipMatchId((selected) => selected || data.matches[0]?.id || "");
    setLoading(false);
  }

  useEffect(() => onAuthStateChanged(auth, (current) => {
    if (!current) {
      window.location.replace("/");
      return;
    }
    setUser(current);
    load(current).catch(() => {
      setError("Kunne ikke åpne administrasjonen. Prøv igjen.");
      setLoading(false);
    });
  }), []);

  const pendingUsers = useMemo(
    () => overview.users.filter((candidate) => !candidate.approved),
    [overview.users],
  );
  const approvedUsers = overview.users.filter((candidate) => candidate.approved);
  const clipCount = overview.matches.reduce((sum, match) => sum + (match.clips?.length ?? 0), 0);

  async function createMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy("match");
    setError("");
    setMessage("");

    const response = await adminApi(user, "/api/admin/matches", {
      method: "POST",
      body: JSON.stringify({
        opponent: fields.get("opponent"),
        dateIso: fields.get("dateIso"),
        venue: fields.get("venue"),
        competition: fields.get("competition"),
        isHome: fields.get("isHome") === "true",
        homeScore: fields.get("homeScore"),
        awayScore: fields.get("awayScore"),
        videoKey: fields.get("videoKey"),
      }),
    });

    if (!response.ok) {
      setError(await readError(response, "Kampen kunne ikke lagres."));
      setBusy("");
      return;
    }

    const created = await response.json() as { id: string };
    form.reset();
    setClipMatchId(created.id);
    await load(user, true);
    setMessage("Kampen er lagt til. Du kan legge inn klipp nå.");
    setBusy("");
  }

  async function createClip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const startText = String(fields.get("start") ?? "");
    const endText = String(fields.get("end") ?? "");
    const start = clockToSeconds(startText);
    const end = clockToSeconds(endText);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setError("Bruk tid som 35:18. Sluttiden må være etter starttiden.");
      return;
    }

    setBusy("clip");
    setError("");
    setMessage("");
    const response = await adminApi(user, "/api/admin/clips", {
      method: "POST",
      body: JSON.stringify({
        matchId: fields.get("matchId"),
        title: fields.get("title"),
        category: fields.get("category"),
        minute: startText,
        start,
        end,
      }),
    });

    if (!response.ok) {
      setError(await readError(response, "Klippet kunne ikke lagres."));
      setBusy("");
      return;
    }

    form.reset();
    setClipMatchId(String(fields.get("matchId") ?? ""));
    await load(user, true);
    setMessage("Klippet er lagt til i kampen.");
    setBusy("");
  }

  async function approveUser(uid: string) {
    if (!user) return;
    setBusy(`user:${uid}`);
    setError("");
    setMessage("");
    const response = await adminApi(user, "/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ uid }),
    });

    if (!response.ok) {
      setError(await readError(response, "Brukeren kunne ikke godkjennes."));
      setBusy("");
      return;
    }

    await load(user, true);
    setMessage("Brukeren er godkjent og har nå tilgang til kampvideoene.");
    setBusy("");
  }

  if (loading) {
    return <main className="admin-center"><div className="loader"/><span>Kontrollerer administratortilgang …</span></main>;
  }

  if (accessDenied) {
    return <main className="admin-center admin-denied">
      <span className="admin-lock"><LockKeyhole/></span>
      <p className="eyebrow">KUN ADMINISTRATOR</p>
      <h1>Ingen tilgang</h1>
      <p>Denne siden kan bare åpnes av en godkjent bruker med rollen admin.</p>
      <a className="ghost" href="/"><ArrowLeft/> Tilbake til kampvideo</a>
    </main>;
  }

  return <main className="admin-shell">
    <header className="admin-topbar">
      <a className="brand" href="/"><span className="brand-mark"><Goal/></span><span><b>SAMNANGER</b><small>KAMPROM ADMIN</small></span></a>
      <a className="admin-back" href="/"><ArrowLeft/> Til kampvideo</a>
    </header>

    <section className="admin-hero">
      <div>
        <span className="eyebrow"><ShieldCheck/> SIKKER ADMINISTRASJON</span>
        <h1>Kampvideo<br/><em>kontrollrom</em></h1>
        <p>Legg inn nye kamper, marker klipp og godkjenn brukere på ett sted.</p>
      </div>
      <div className="admin-stats" aria-label="Status">
        <article><Film/><span><b>{overview.matches.length}</b> kamper</span></article>
        <article><CirclePlay/><span><b>{clipCount}</b> klipp</span></article>
        <article className={pendingUsers.length ? "needs-action" : ""}><Users/><span><b>{pendingUsers.length}</b> venter</span></article>
      </div>
    </section>

    {(message || error) && <div className={`admin-notice ${error ? "error" : "success"}`} role="status">
      {error ? <LockKeyhole/> : <Check/>}<span>{error || message}</span>
    </div>}

    <nav className="admin-jump" aria-label="Administrasjon">
      <a href="#new-match"><Plus/> Ny kamp</a>
      <a href="#new-clip"><Clock3/> Nytt klipp</a>
      <a href="#users"><UserCheck/> Brukere {pendingUsers.length > 0 && <b>{pendingUsers.length}</b>}</a>
    </nav>

    <section className="admin-workspace">
      <article className="admin-card admin-form-card" id="new-match">
        <div className="admin-card-heading"><span className="admin-card-icon lime"><Film/></span><div><small>ARKIV</small><h2>Legg til kamp</h2></div></div>
        <form className="admin-form" onSubmit={createMatch}>
          <div className="admin-field-grid two">
            <label>Motstander<input name="opponent" required placeholder="Bønes 2"/></label>
            <label>Dato<input name="dateIso" type="date" required/></label>
          </div>
          <div className="admin-field-grid two">
            <label>Arena<input name="venue" placeholder="Hagabotnane kunstgress"/></label>
            <label>Turnering<input name="competition" defaultValue="Seriekamp"/></label>
          </div>
          <div className="admin-field-grid score-row">
            <label>Samnanger<input name="homeScore" type="number" min="0" max="99" inputMode="numeric" placeholder="3"/></label>
            <span>–</span>
            <label>Motstander<input name="awayScore" type="number" min="0" max="99" inputMode="numeric" placeholder="1"/></label>
            <label>Hjemme/borte<select name="isHome" defaultValue="true"><option value="true">Hjemmekamp</option><option value="false">Bortekamp</option></select></label>
          </div>
          <label>Videonøkkel i R2<input name="videoKey" required placeholder="kamper/samnanger-bones-2.mp4"/><small>Bruk hele stien og filnavnet slik det står i R2-bøtten.</small></label>
          <button className="admin-submit" disabled={busy === "match"} type="submit"><Plus/>{busy === "match" ? "Lagrer …" : "Legg til kamp"}</button>
        </form>
      </article>

      <aside className="admin-card match-list-card">
        <div className="admin-card-heading"><span className="admin-card-icon violet"><Goal/></span><div><small>OVERSIKT</small><h2>Kamper i arkivet</h2></div></div>
        <div className="admin-match-list">
          {overview.matches.length ? overview.matches.map((match) => <button type="button" key={match.id} onClick={() => setClipMatchId(match.id)}>
            <span><b>Samnanger – {match.opponent}</b><small>{match.date} · {match.clips?.length ?? 0} klipp</small></span>
            <Plus/>
          </button>) : <p className="admin-empty">Ingen kamper er registrert ennå.</p>}
        </div>
      </aside>

      <article className="admin-card admin-form-card" id="new-clip">
        <div className="admin-card-heading"><span className="admin-card-icon blue"><CirclePlay/></span><div><small>ANALYSE</small><h2>Legg til klipp</h2></div></div>
        <form className="admin-form" onSubmit={createClip}>
          <label>Kamp<select name="matchId" required value={clipMatchId} onChange={(event) => setClipMatchId(event.target.value)}><option value="" disabled>Velg kamp</option>{overview.matches.map((match) => <option key={match.id} value={match.id}>Samnanger – {match.opponent} ({match.date})</option>)}</select></label>
          <div className="admin-field-grid two">
            <label>Tittel<input name="title" required placeholder="Presset før scoringen"/></label>
            <label>Kategori<select name="category" defaultValue="Analyse"><option>Analyse</option><option>Angrep</option><option>Forsvar</option><option>Overgang</option><option>Dødball</option><option>Mål</option></select></label>
          </div>
          <div className="admin-field-grid two">
            <label>Start<input name="start" required inputMode="numeric" placeholder="35:18"/><small>Minutt:sekund</small></label>
            <label>Slutt<input name="end" required inputMode="numeric" placeholder="35:31"/><small>Minutt:sekund</small></label>
          </div>
          <button className="admin-submit blue-button" disabled={busy === "clip" || !overview.matches.length} type="submit"><CirclePlay/>{busy === "clip" ? "Lagrer …" : "Legg til klipp"}</button>
        </form>
      </article>

      <article className="admin-card users-card" id="users">
        <div className="admin-card-heading"><span className="admin-card-icon orange"><UserCheck/></span><div><small>TILGANG</small><h2>Godkjenn brukere</h2></div></div>
        <div className="pending-users">
          {pendingUsers.length ? pendingUsers.map((candidate) => <div className="admin-user" key={candidate.uid}>
            <span className="user-avatar">{candidate.email[0]?.toUpperCase() || "?"}</span>
            <span><b>{candidate.name || candidate.email}</b>{candidate.name && <small>{candidate.email}</small>}<em>Venter på tilgang</em></span>
            <button type="button" disabled={busy === `user:${candidate.uid}`} onClick={() => approveUser(candidate.uid)}><Check/>{busy === `user:${candidate.uid}` ? "Godkjenner …" : "Godkjenn"}</button>
          </div>) : <div className="all-approved"><ShieldCheck/><div><b>Ingen venter</b><span>Alle registrerte forespørsler er behandlet.</span></div></div>}
        </div>
        <details className="approved-users"><summary>{approvedUsers.length} godkjente brukere</summary><div>{approvedUsers.map((candidate) => <p key={candidate.uid}><span>{candidate.email}</span>{candidate.role === "admin" && <b>ADMIN</b>}</p>)}</div></details>
      </article>
    </section>

    <footer><LockKeyhole/> Alle endringer kontrolleres på serveren og krever administratorrolle</footer>
  </main>;
}
