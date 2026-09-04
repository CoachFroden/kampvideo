"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { ArrowLeft, CalendarDays, Check, CircleUserRound, Clock3, Film, FolderOpen, Goal, LoaderCircle, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UploadCloud, Users, Video, X } from "lucide-react";

type Clip = { id: string; title: string; category: string; start: number; end: number; minute: string; good?: string; improve?: string; videoKey?: string };
type Match = { id: string; opponent: string; date: string; venue?: string; competition?: string; homeScore: number; awayScore: number; isHome?: boolean; videoKey: string; clips?: Clip[] };
type ManagedUser = { id: string; email: string; name: string; approved: boolean; role: "viewer" | "admin"; createdAt?: string | null };
type VideoFile = { key: string; size: number; modified?: string | null };
type AdminData = { users: ManagedUser[]; matches: Match[]; files: VideoFile[] };
type Tab = "matches" | "clips" | "users";
type UploadInit = { key: string; uploadId: string; partSize: number; urls: string[] };

const emptyData: AdminData = { users: [], matches: [], files: [] };

async function api(user: User, path: string, init?: RequestInit) {
  const token = await user.getIdToken();
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
}

function putVideoPart(url: string, blob: Blob, signal: AbortSignal, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => onProgress(event.lengthComputable ? event.loaded : 0);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`R2 avviste en videodel (${xhr.status})`));
        return;
      }
      const etag = xhr.getResponseHeader("etag");
      if (!etag) {
        reject(new Error("R2 svarte uten ETag. Prøv opplastingen på nytt."));
        return;
      }
      onProgress(blob.size);
      resolve(etag);
    };
    xhr.onerror = () => reject(new Error("Nettverksfeil under opplasting til R2"));
    xhr.onabort = () => reject(new DOMException("Opplastingen ble avbrutt", "AbortError"));
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.addEventListener("loadend", () => signal.removeEventListener("abort", abort));
    xhr.send(blob);
  });
}

async function uploadVideoToR2(
  user: User,
  file: File,
  date: string,
  opponent: string,
  signal: AbortSignal,
  onProgress: (percent: number, uploaded: number) => void,
) {
  let upload: UploadInit | null = null;
  try {
    const initResponse = await api(user, "/api/admin/upload", {
      method: "POST",
      body: JSON.stringify({ action: "init", fileName: file.name, contentType: file.type || "video/mp4", size: file.size, date, opponent }),
    });
    const initPayload = await initResponse.json();
    if (!initResponse.ok) throw new Error(initPayload.error ?? "Kunne ikke starte videoopplastingen");
    upload = initPayload as UploadInit;

    const loadedByPart = new Map<number, number>();
    const parts: { partNumber: number; etag: string }[] = new Array(upload.urls.length);
    const report = (index: number, loaded: number) => {
      loadedByPart.set(index, loaded);
      const uploaded = [...loadedByPart.values()].reduce((sum, value) => sum + value, 0);
      onProgress(Math.min(100, Math.round((uploaded / file.size) * 100)), uploaded);
    };

    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        if (signal.aborted) throw new DOMException("Opplastingen ble avbrutt", "AbortError");
        const index = nextIndex++;
        if (index >= upload!.urls.length) return;
        const start = index * upload!.partSize;
        const end = Math.min(start + upload!.partSize, file.size);
        const blob = file.slice(start, end);
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const etag = await putVideoPart(upload!.urls[index], blob, signal, (loaded) => report(index, loaded));
            parts[index] = { partNumber: index + 1, etag };
            break;
          } catch (error) {
            lastError = error;
            if (signal.aborted) throw error;
            report(index, 0);
            if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
          }
        }
        if (!parts[index]) throw lastError instanceof Error ? lastError : new Error("En videodel kunne ikke lastes opp");
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, upload.urls.length) }, () => worker()));
    const completeResponse = await api(user, "/api/admin/upload", {
      method: "POST",
      body: JSON.stringify({ action: "complete", key: upload.key, uploadId: upload.uploadId, parts }),
    });
    const completePayload = await completeResponse.json();
    if (!completeResponse.ok) throw new Error(completePayload.error ?? "Kunne ikke ferdigstille videoopplastingen");
    onProgress(100, file.size);
    return upload.key;
  } catch (error) {
    if (upload) {
      try {
        await api(user, "/api/admin/upload", { method: "POST", body: JSON.stringify({ action: "abort", key: upload.key, uploadId: upload.uploadId }) });
      } catch { /* R2 rydder også uferdige multipart-opplastinger automatisk */ }
    }
    throw error;
  }
}

function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error("Kunne ikke lese lengden på videoklippet."));
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Kunne ikke lese videoklippet. Prøv MP4-format."));
    };
    video.src = url;
  });
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
      {tab === "matches" && <MatchesPanel data={data} user={user} saving={saving} mutate={mutate}/>} 
      {tab === "clips" && <ClipsPanel matches={data.matches} user={user} saving={saving} mutate={mutate}/>} 
      {tab === "users" && <UsersPanel users={data.users} saving={saving} mutate={mutate}/>} 
    </>}
  </main>;
}

function MatchesPanel({ data, user, saving, mutate }: { data: AdminData; user: User | null; saving: boolean; mutate: (init: RequestInit, success: string, path?: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ opponent: "", date: "", venue: "Hagabotnane kunstgress", competition: "G14 · Seriekamp", homeScore: "", awayScore: "", isHome: true, videoKey: "" });
  const [editingId, setEditingId] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    setEditingId("");
    setForm({ opponent: "", date: "", venue: "Hagabotnane kunstgress", competition: "G14 · Seriekamp", homeScore: "", awayScore: "", isHome: true, videoKey: "" });
    setVideoFile(null); setUploadProgress(0); setUploadedBytes(0); setUploadError("");
  }
  function edit(match: Match) {
    setEditingId(match.id);
    setVideoFile(null); setUploadProgress(0); setUploadedBytes(0); setUploadError("");
    setForm({ opponent: match.opponent, date: match.date, venue: match.venue ?? "", competition: match.competition ?? "", homeScore: String(match.homeScore), awayScore: String(match.awayScore), isHome: match.isHome !== false, videoKey: match.videoKey });
    window.scrollTo({ top: 300, behavior: "smooth" });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setUploadError("");
    let videoKey = form.videoKey;

    if (!editingId && videoFile) {
      setUploading(true); setUploadProgress(0); setUploadedBytes(0);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        videoKey = await uploadVideoToR2(user, videoFile, form.date, form.opponent, controller.signal, (percent, uploaded) => {
          setUploadProgress(percent); setUploadedBytes(uploaded);
        });
        setForm((current) => ({ ...current, videoKey }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") setUploadError("Opplastingen ble avbrutt.");
        else setUploadError(error instanceof Error ? error.message : "Videoopplastingen feilet");
        return;
      } finally {
        abortRef.current = null; setUploading(false);
      }
    }

    if (!videoKey) {
      setUploadError("Velg en MP4-fil fra PC-en, eller velg en eksisterende fil fra R2.");
      return;
    }

    const ok = await mutate({ method: editingId ? "PATCH" : "POST", body: JSON.stringify({ action: editingId ? "updateMatch" : "createMatch", matchId: editingId, match: { ...form, videoKey } }) }, editingId ? "Kampen ble oppdatert" : "Videoen ble lastet opp og kampen ble lagt til");
    if (ok) reset();
  }
  return <section className="admin-grid">
    <form className="admin-card admin-form" onSubmit={submit}>
      <div className="admin-card-head"><span className="admin-icon lime">{editingId ? <Pencil/> : <Plus/>}</span><div><small>{editingId ? "REDIGERER" : "NY KAMP"}</small><h2>{editingId ? "Rediger kamp" : "Legg til kamp"}</h2></div></div>
      <div className="form-grid">
        <label className="wide">Motstander<input value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} placeholder="Bønes 2" required/></label>
        <label>Dato<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required/></label>
        <label>Bane<input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })}/></label>
        <label>Kampform<input value={form.competition} onChange={(e) => setForm({ ...form, competition: e.target.value })}/></label>
        <label className="score-input">Samnanger<input type="number" min="0" max="99" value={form.homeScore} onChange={(e) => setForm({ ...form, homeScore: e.target.value })} required/></label>
        <label className="score-input">Motstander<input type="number" min="0" max="99" value={form.awayScore} onChange={(e) => setForm({ ...form, awayScore: e.target.value })} required/></label>

        {!editingId && <div className="wide upload-zone">
          <div className="upload-zone-title"><UploadCloud/><span><b>Last opp kampvideo</b><small>Komprimer gjerne i HandBrake først. Deretter velger du bare MP4-filen her.</small></span></div>
          <label className="upload-picker">
            <input type="file" accept="video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,.webm" disabled={uploading || saving} onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null;
              setVideoFile(chosen); setUploadError(""); setUploadProgress(0); setUploadedBytes(0);
              if (chosen) setForm((current) => ({ ...current, videoKey: "" }));
            }}/>
            <UploadCloud/><span>{videoFile ? <><b>{videoFile.name}</b><small>{formatBytes(videoFile.size)}</small></> : <><b>Velg videofil fra PC</b><small>MP4, MOV, M4V eller WebM</small></>}</span>
          </label>
          {uploading && <div className="upload-progress-wrap">
            <div className="upload-progress-head"><span>Laster direkte til privat R2 …</span><b>{uploadProgress}%</b></div>
            <div className="upload-progress"><span style={{ width: `${uploadProgress}%` }}/></div>
            <small>{formatBytes(uploadedBytes)} av {videoFile ? formatBytes(videoFile.size) : ""}</small>
            <button type="button" className="upload-cancel" onClick={() => abortRef.current?.abort()}><X/> Avbryt opplasting</button>
          </div>}
        </div>}

        <label className="wide file-select existing-file">{editingId ? "Videofil" : "Eller velg en fil som allerede ligger i R2"}<select value={form.videoKey} disabled={uploading} onChange={(e) => { setForm({ ...form, videoKey: e.target.value }); if (e.target.value) setVideoFile(null); }}><option value="">Velg eksisterende R2-fil …</option>{data.files.map((file) => <option key={file.key} value={file.key}>{file.key} · {formatBytes(file.size)}</option>)}</select><FolderOpen/></label>
        <label className="toggle wide"><input type="checkbox" checked={form.isHome} onChange={(e) => setForm({ ...form, isHome: e.target.checked })}/><span/> Samnanger er hjemmelag</label>
      </div>
      {uploadError && <div className="upload-inline-error">{uploadError}</div>}
      <button className="admin-primary" disabled={saving || uploading}>{uploading || saving ? <LoaderCircle/> : editingId ? <Check/> : <UploadCloud/>} {uploading ? `Laster opp video · ${uploadProgress}%` : saving ? "Lagrer …" : editingId ? "Lagre endringer" : videoFile ? "Last opp og legg til kamp" : "Legg til kamp"}</button>
      {editingId && <button type="button" className="admin-cancel" onClick={reset}><X/> Avbryt redigering</button>}
    </form>
    <div className="admin-card list-card">
      <div className="admin-card-head"><span className="admin-icon violet"><Film/></span><div><small>ARKIV</small><h2>Registrerte kamper</h2></div></div>
      <div className="admin-list">{data.matches.length === 0 ? <p className="admin-empty">Ingen kamper registrert.</p> : data.matches.map((match) => <article key={match.id} className="match-row"><div className="match-date"><b>{new Date(`${match.date}T12:00:00`).getDate()}</b><span>{new Date(`${match.date}T12:00:00`).toLocaleDateString("nb-NO", { month: "short" })}</span></div><div className="row-main"><small>{match.competition}</small><b>Samnanger {match.homeScore}–{match.awayScore} {match.opponent}</b><span>{match.videoKey}</span></div><div className="row-actions"><button type="button" className="icon-edit" title="Rediger kamp" disabled={saving || uploading} onClick={() => edit(match)}><Pencil/></button><button type="button" className="icon-danger" title="Slett kamp" disabled={saving || uploading} onClick={() => confirm(`Slette kampen mot ${match.opponent}?`) && mutate({ method: "DELETE" }, "Kampen ble slettet", `/api/admin?matchId=${encodeURIComponent(match.id)}`)}><Trash2/></button></div></article>)}</div>
    </div>
  </section>;
}

function ClipsPanel({ matches, user, saving, mutate }: { matches: Match[]; user: User | null; saving: boolean; mutate: (init: RequestInit, success: string, path?: string) => Promise<boolean> }) {
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Analyse");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [good, setGood] = useState("");
  const [improve, setImprove] = useState("");
  const [editingClipId, setEditingClipId] = useState("");
  const [uploadMode, setUploadMode] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [clipVideoKey, setClipVideoKey] = useState("");
  const [clipDuration, setClipDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const selected = matches.find((item) => item.id === matchId) ?? matches[0];

  useEffect(() => { if (!matchId && matches[0]) setMatchId(matches[0].id); }, [matchId, matches]);

  function resetClip() {
    setEditingClipId(""); setTitle(""); setCategory("Analyse"); setStart(""); setEnd(""); setGood(""); setImprove("");
    setUploadMode(false); setVideoFile(null); setClipVideoKey(""); setClipDuration(0); setUploadProgress(0); setUploadedBytes(0); setUploadError("");
  }

  function editClip(clip: Clip) {
    const standalone = !!clip.videoKey;
    setEditingClipId(clip.id); setTitle(clip.title); setCategory(clip.category); setStart(formatClock(clip.start)); setEnd(formatClock(clip.end));
    setGood(clip.good ?? ""); setImprove(clip.improve ?? ""); setUploadMode(standalone); setVideoFile(null); setClipVideoKey(clip.videoKey ?? "");
    setClipDuration(standalone ? Math.max(0, clip.end - clip.start) : 0); setUploadProgress(0); setUploadedBytes(0); setUploadError("");
    window.scrollTo({ top: 300, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || !selected) return;
    setUploadError("");

    let videoKey = uploadMode ? clipVideoKey : "";
    let startSeconds = uploadMode ? 0 : toSeconds(start);
    let endSeconds = uploadMode ? clipDuration : toSeconds(end);

    if (uploadMode && videoFile) {
      let duration = clipDuration;
      try {
        if (!(Number.isFinite(duration) && duration > 0)) duration = await readVideoDuration(videoFile);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Kunne ikke lese videoklippet.");
        return;
      }

      setUploading(true); setUploadProgress(0); setUploadedBytes(0);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        videoKey = await uploadVideoToR2(user, videoFile, selected.date, `${selected.opponent}-klipp`, controller.signal, (percent, uploaded) => {
          setUploadProgress(percent); setUploadedBytes(uploaded);
        });
        setClipVideoKey(videoKey);
        setClipDuration(duration);
        setVideoFile(null);
        startSeconds = 0;
        endSeconds = duration;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") setUploadError("Opplastingen ble avbrutt.");
        else setUploadError(error instanceof Error ? error.message : "Videoopplastingen feilet");
        return;
      } finally {
        abortRef.current = null; setUploading(false);
      }
    }

    if (uploadMode && !videoKey) {
      setUploadError("Velg videoklippet du lastet ned fra Veo.");
      return;
    }
    if (uploadMode && !(Number.isFinite(endSeconds) && endSeconds > 0)) {
      setUploadError("Kunne ikke lese lengden på videoklippet.");
      return;
    }

    const ok = await mutate({
      method: editingClipId ? "PATCH" : "POST",
      body: JSON.stringify({
        action: editingClipId ? "updateClip" : "createClip",
        matchId,
        clipId: editingClipId,
        clip: { title, category, start: startSeconds, end: endSeconds, good, improve, videoKey },
      }),
    }, editingClipId ? "Klippet ble oppdatert" : uploadMode ? "Videoklippet ble lastet opp og lagt til" : "Klippet ble lagt til");
    if (ok) resetClip();
  }

  return <section className="admin-grid">
    <form className="admin-card admin-form" onSubmit={submit}>
      <div className="admin-card-head"><span className="admin-icon blue">{editingClipId ? <Pencil/> : uploadMode ? <UploadCloud/> : <Clock3/>}</span><div><small>{editingClipId ? "REDIGERER" : "NYTT KLIPP"}</small><h2>{editingClipId ? "Rediger klipp" : uploadMode ? "Last opp videoklipp" : "Marker situasjon"}</h2></div></div>
      <div className="form-grid">
        <label className="wide">Kamp<select value={matchId} onChange={(e) => setMatchId(e.target.value)} required><option value="">Velg kamp …</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.date} · Samnanger – {match.opponent}</option>)}</select></label>
        <label className="toggle wide"><input type="checkbox" checked={uploadMode} disabled={uploading} onChange={(e) => { setUploadMode(e.target.checked); setUploadError(""); }}/><span/> Bruk eget videoklipp, for eksempel et Directed Clip fra Veo</label>
        <label className="wide">Tittel<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gjenvinning og gjennombrudd" required/></label>
        <label>Kategori<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Analyse</option><option>Angrep</option><option>Forsvar</option><option>Press</option><option>Overgang</option><option>Mål</option><option>Sjanse</option><option>Dødball</option></select></label>

        {!uploadMode && <>
          <label>Starttid<input value={start} onChange={(e) => setStart(e.target.value)} placeholder="35:18" inputMode="numeric" required/></label>
          <label>Sluttid<input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="35:42" inputMode="numeric" required/></label>
        </>}

        {uploadMode && <div className="wide upload-zone">
          <div className="upload-zone-title"><Video/><span><b>Videoklipp fra Veo</b><small>Velg klippet du har lastet ned. Lengden blir lest automatisk, og filen lagres privat i R2.</small></span></div>
          <label className="upload-picker">
            <input type="file" accept="video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,.webm" disabled={uploading || saving} onChange={async (e) => {
              const chosen = e.target.files?.[0] ?? null;
              setVideoFile(chosen); setClipVideoKey(""); setClipDuration(0); setUploadError(""); setUploadProgress(0); setUploadedBytes(0);
              if (!chosen) return;
              try { setClipDuration(await readVideoDuration(chosen)); }
              catch (error) { setUploadError(error instanceof Error ? error.message : "Kunne ikke lese videoklippet."); }
            }}/>
            <UploadCloud/><span>{videoFile ? <><b>{videoFile.name}</b><small>{formatBytes(videoFile.size)}{clipDuration > 0 ? ` · ${formatClock(clipDuration)}` : ""}</small></> : clipVideoKey ? <><b>Videoklipp er koblet til</b><small>{clipVideoKey}{clipDuration > 0 ? ` · ${formatClock(clipDuration)}` : ""}</small></> : <><b>Velg videoklipp fra PC</b><small>MP4, MOV, M4V eller WebM</small></>}</span>
          </label>
          {uploading && <div className="upload-progress-wrap">
            <div className="upload-progress-head"><span>Laster videoklippet direkte til privat R2 …</span><b>{uploadProgress}%</b></div>
            <div className="upload-progress"><span style={{ width: `${uploadProgress}%` }}/></div>
            <small>{formatBytes(uploadedBytes)} av {videoFile ? formatBytes(videoFile.size) : ""}</small>
            <button type="button" className="upload-cancel" onClick={() => abortRef.current?.abort()}><X/> Avbryt opplasting</button>
          </div>}
        </div>}

        <label className="wide">Dette er bra<textarea value={good} onChange={(e) => setGood(e.target.value)} placeholder="Hva gjør laget eller spilleren godt i situasjonen?" rows={3}/></label>
        <label className="wide">Dette bør forbedres<textarea value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="Hva bør gjøres annerledes eller trenes mer på?" rows={3}/></label>
      </div>
      {uploadError && <div className="upload-inline-error">{uploadError}</div>}
      <p className="form-help">{uploadMode ? "Et eget videoklipp spilles som en selvstendig video. Etter at det er lagt til kan du åpne det i kamprommet og tegne piler, linjer, sirkler og tekst på analysepunkter." : "Bruk tidspunktet som vises i videospilleren, for eksempel 35:18."}</p>
      <button className="admin-primary" disabled={saving || uploading || !matches.length}>{saving || uploading ? <LoaderCircle/> : editingClipId ? <Check/> : uploadMode ? <UploadCloud/> : <Plus/>} {uploading ? `Laster opp klipp · ${uploadProgress}%` : saving ? "Lagrer …" : editingClipId ? "Lagre endringer" : uploadMode ? "Last opp og legg til klipp" : "Lag klipp"}</button>
      {editingClipId && <button type="button" className="admin-cancel" onClick={resetClip}><X/> Avbryt redigering</button>}
    </form>
    <div className="admin-card list-card">
      <div className="admin-card-head"><span className="admin-icon violet"><Video/></span><div><small>{selected?.opponent?.toUpperCase() ?? "KAMP"}</small><h2>Klipp fra kampen</h2></div></div>
      <div className="admin-list">{!selected?.clips?.length ? <p className="admin-empty">Ingen klipp i denne kampen ennå.</p> : selected.clips.map((clip) => <article key={clip.id} className="clip-row"><span className="time-badge">{clip.videoKey ? "VIDEO" : clip.minute}</span><div className="row-main"><small>{clip.category}{clip.videoKey ? " · EGEN VIDEOFIL" : ""}</small><b>{clip.title}</b><span>{clip.videoKey ? `${formatClock(Math.max(0, clip.end - clip.start))} langt` : `${formatClock(clip.start)}–${formatClock(clip.end)}`}</span>{clip.good && <p className="clip-note good"><b>Bra:</b> {clip.good}</p>}{clip.improve && <p className="clip-note improve"><b>Forbedre:</b> {clip.improve}</p>}</div><div className="row-actions"><button type="button" className="icon-edit" title="Rediger klipp" disabled={saving || uploading} onClick={() => editClip(clip)}><Pencil/></button><button type="button" className="icon-danger" title="Slett klipp" disabled={saving || uploading} onClick={() => confirm(`Slette klippet «${clip.title}»?`) && mutate({ method: "DELETE" }, "Klippet ble slettet", `/api/admin?matchId=${encodeURIComponent(selected.id)}&clipId=${encodeURIComponent(clip.id)}`)}><Trash2/></button></div></article>)}</div>
    </div>
  </section>;
}

function UsersPanel({ users, saving, mutate }: { users: ManagedUser[]; saving: boolean; mutate: (init: RequestInit, success: string, path?: string) => Promise<boolean> }) {
  return <section className="admin-card users-card"><div className="admin-card-head"><span className="admin-icon lime"><Users/></span><div><small>TILGANG</small><h2>Brukere og godkjenning</h2></div></div><div className="user-list">{users.map((item) => <article key={item.id} className="user-row"><span className={`user-avatar ${item.approved ? "approved" : ""}`}>{(item.name || item.email || "?")[0].toUpperCase()}</span><div className="row-main"><b>{item.name || "Uten navn"}</b><span>{item.email}</span><small>{item.approved ? item.role === "admin" ? "Administrator" : "Godkjent bruker" : "Venter på godkjenning"}</small></div><label className="role-select"><span>Rolle</span><select value={item.role} disabled={!item.approved || saving} onChange={(e) => mutate({ method: "PATCH", body: JSON.stringify({ action: "updateUser", userId: item.id, approved: true, role: e.target.value }) }, "Rollen ble oppdatert")}><option value="viewer">Bruker</option><option value="admin">Administrator</option></select></label><button className={item.approved ? "access-button revoke" : "access-button approve"} disabled={saving} onClick={() => mutate({ method: "PATCH", body: JSON.stringify({ action: "updateUser", userId: item.id, approved: !item.approved, role: item.approved ? "viewer" : item.role }) }, item.approved ? "Tilgangen ble fjernet" : <><Check/> Godkjenn</>) as never}>{item.approved ? "Fjern tilgang" : <><Check/> Godkjenn</>}</button></article>)}</div></section>;
}

function toSeconds(value: string) {
  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return Number.NaN;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.NaN;
}
const formatClock = (seconds: number) => { const safe = Math.max(0, Math.floor(seconds)); return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`; };
const formatBytes = (bytes: number) => bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(2)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
