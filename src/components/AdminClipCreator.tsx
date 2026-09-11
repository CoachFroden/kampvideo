"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, RefObject } from "react";
import type { User } from "firebase/auth";
import { Check, ChevronLeft, Clock3, Eye, LoaderCircle, Plus, RotateCcw, Scissors, X } from "lucide-react";
import styles from "./AdminClipCreator.module.css";

export type CreatedClip = {
  id: string;
  title: string;
  minute?: string;
  category?: string;
  start: number;
  end: number;
  good?: string;
  improve?: string;
};

type Props = {
  user: User;
  matchId: string;
  opponent: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  onCreated: (matchId: string, clip: CreatedClip) => void;
};

type Step = "closed" | "range" | "details";

const categories = ["Analyse", "Angrep", "Forsvar", "Press", "Overgang", "Mål", "Sjanse", "Dødball"];
const roundTime = (value: number) => Math.round(value * 10) / 10;

function formatClock(value: number, precise = true) {
  if (!Number.isFinite(value) || value < 0) return "0:00.0";
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  if (!precise) return `${minutes}:${String(Math.floor(seconds)).padStart(2, "0")}`;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

export default function AdminClipCreator({ user, matchId, opponent, videoRef, onCreated }: Props) {
  const [step, setStep] = useState<Step>("closed");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Analyse");
  const [good, setGood] = useState("");
  const [improve, setImprove] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setStep("closed");
    setPreviewing(false);
    setTitle("");
    setGood("");
    setImprove("");
    setError("");
    setNotice("");
  }, [matchId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      const now = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      setCurrent(now);
      if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
      if (previewing && now >= end - 0.04) {
        video.pause();
        video.currentTime = start;
        setCurrent(start);
        setPreviewing(false);
      }
    };

    sync();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("durationchange", sync);
    video.addEventListener("seeked", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("durationchange", sync);
      video.removeEventListener("seeked", sync);
    };
  }, [videoRef, previewing, start, end]);

  const clipLength = Math.max(0, end - start);
  const timeline = useMemo(() => {
    if (!(duration > 0)) return { start: 0, end: 0, current: 0 };
    return {
      start: Math.max(0, Math.min(100, (start / duration) * 100)),
      end: Math.max(0, Math.min(100, (end / duration) * 100)),
      current: Math.max(0, Math.min(100, (current / duration) * 100)),
    };
  }, [start, end, current, duration]);

  function openCreator() {
    const video = videoRef.current;
    if (!video) {
      setError("Start kampvideoen før du lager et klipp.");
      return;
    }
    const now = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    let nextStart = Math.max(0, now - 10);
    let nextEnd = total > 0 ? Math.min(total, now + 10) : now + 10;
    if (nextEnd - nextStart < 2 && total > 0) nextStart = Math.max(0, nextEnd - 20);
    setCurrent(now);
    if (total > 0) setDuration(total);
    setStart(roundTime(nextStart));
    setEnd(roundTime(nextEnd));
    setStep("range");
    setError("");
    setNotice("");
  }

  function closeCreator() {
    const video = videoRef.current;
    if (previewing && video) video.pause();
    setPreviewing(false);
    setStep("closed");
    setError("");
  }

  function setStartHere() {
    const video = videoRef.current;
    if (!video) return;
    const value = roundTime(Math.max(0, video.currentTime));
    setCurrent(value);
    setStart(value);
    if (value >= end) {
      const next = duration > 0 ? Math.min(duration, value + 10) : value + 10;
      setEnd(roundTime(next));
    }
  }

  function setEndHere() {
    const video = videoRef.current;
    if (!video) return;
    const value = roundTime(Math.max(0, video.currentTime));
    setCurrent(value);
    setEnd(value);
    if (value <= start) setStart(roundTime(Math.max(0, value - 10)));
  }

  function changeStart(value: number) {
    const upper = Math.max(0, end - 0.1);
    setStart(roundTime(Math.max(0, Math.min(value, upper))));
  }

  function changeEnd(value: number) {
    const max = duration > 0 ? duration : Math.max(value, end, start + 0.1);
    setEnd(roundTime(Math.max(start + 0.1, Math.min(value, max))));
  }

  function nudgeStart(delta: number) {
    changeStart(start + delta);
  }

  function nudgeEnd(delta: number) {
    changeEnd(end + delta);
  }

  async function preview() {
    const video = videoRef.current;
    if (!video || end <= start) return;
    if (previewing) {
      video.pause();
      setPreviewing(false);
      return;
    }
    video.currentTime = start;
    setCurrent(start);
    setPreviewing(true);
    try { await video.play(); }
    catch { setPreviewing(false); }
  }

  function resetRange() {
    const video = videoRef.current;
    if (!video) return;
    const now = Number.isFinite(video.currentTime) ? video.currentTime : current;
    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
    setStart(roundTime(Math.max(0, now - 10)));
    setEnd(roundTime(total > 0 ? Math.min(total, now + 10) : now + 10));
  }

  function continueToDetails() {
    if (!(end > start)) {
      setError("Sluttpunktet må være etter startpunktet.");
      return;
    }
    if (clipLength < 0.5) {
      setError("Klippet må være minst et halvt sekund langt.");
      return;
    }
    if (previewing) {
      videoRef.current?.pause();
      setPreviewing(false);
    }
    setError("");
    setStep("details");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Gi klippet en tittel.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "createClip",
          matchId,
          clip: { title, category, start, end, good, improve, videoKey: "" },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Kunne ikke lagre klippet");
      onCreated(matchId, payload.clip as CreatedClip);
      setNotice(`Klippet «${title.trim()}» ble lagret.`);
      setTitle("");
      setCategory("Analyse");
      setGood("");
      setImprove("");
      setStep("closed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lagre klippet");
    } finally {
      setSaving(false);
    }
  }

  if (step === "closed") {
    return <section className={styles.launcher} aria-label="Admin klippverktøy">
      <div><span>ADMINVERKTØY</span><b>Fant du en situasjon du vil ta vare på?</b><small>Spol til situasjonen i spilleren og marker start og slutt direkte her.</small></div>
      <button type="button" onClick={openCreator}><Scissors/> Lag klipp</button>
      {notice && <p className={styles.notice}><Check/> {notice}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </section>;
  }

  if (step === "range") {
    return <section className={styles.panel} aria-label="Marker klipp">
      <header className={styles.header}>
        <div><span>NYTT KLIPP · STEG 1 AV 2</span><h3>Marker situasjonen</h3><p>Bruk den vanlige videotidslinjen over. Når du står riktig, setter du start eller slutt.</p></div>
        <button type="button" className={styles.iconButton} onClick={closeCreator} aria-label="Avbryt"><X/></button>
      </header>

      <div className={styles.now}><Clock3/><span>Spilleren står på</span><b>{formatClock(current)}</b></div>

      <div className={styles.timeline} aria-label={`Valgt område ${formatClock(start)} til ${formatClock(end)}`}>
        <div className={styles.track}>
          <span className={styles.selection} style={{ left: `${timeline.start}%`, width: `${Math.max(0, timeline.end - timeline.start)}%` }}/>
          <span className={`${styles.dot} ${styles.startDot}`} style={{ left: `${timeline.start}%` }}/>
          <span className={`${styles.dot} ${styles.endDot}`} style={{ left: `${timeline.end}%` }}/>
          <span className={styles.playhead} style={{ left: `${timeline.current}%` }}/>
        </div>
        <div className={styles.trackLabels}><span>0:00</span><b>{formatClock(start, false)} – {formatClock(end, false)} · {clipLength.toFixed(1)} s</b><span>{duration > 0 ? formatClock(duration, false) : "–"}</span></div>
      </div>

      <div className={styles.timeGrid}>
        <div className={styles.timeCard}>
          <div className={styles.timeHeading}><span>START</span><b>{formatClock(start)}</b></div>
          <button type="button" className={styles.setButton} onClick={setStartHere}>Sett start her</button>
          {duration > 0 && <input aria-label="Juster starttid" type="range" min="0" max={duration} step="0.1" value={start} onChange={e => changeStart(Number(e.target.value))}/>} 
          <div className={styles.nudges}><button type="button" onClick={() => nudgeStart(-1)}>−1 s</button><button type="button" onClick={() => nudgeStart(-0.1)}>−0,1</button><button type="button" onClick={() => nudgeStart(0.1)}>+0,1</button><button type="button" onClick={() => nudgeStart(1)}>+1 s</button></div>
        </div>

        <div className={styles.timeCard}>
          <div className={styles.timeHeading}><span>SLUTT</span><b>{formatClock(end)}</b></div>
          <button type="button" className={styles.setButton} onClick={setEndHere}>Sett slutt her</button>
          {duration > 0 && <input aria-label="Juster sluttid" type="range" min="0" max={duration} step="0.1" value={end} onChange={e => changeEnd(Number(e.target.value))}/>} 
          <div className={styles.nudges}><button type="button" onClick={() => nudgeEnd(-1)}>−1 s</button><button type="button" onClick={() => nudgeEnd(-0.1)}>−0,1</button><button type="button" onClick={() => nudgeEnd(0.1)}>+0,1</button><button type="button" onClick={() => nudgeEnd(1)}>+1 s</button></div>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={resetRange}><RotateCcw/> 20 s rundt nå</button>
        <button type="button" className={styles.secondary} onClick={() => void preview()}><Eye/> {previewing ? "Stopp forhåndsvisning" : "Forhåndsvis"}</button>
        <button type="button" className={styles.primary} onClick={continueToDetails}>Neste: detaljer <Plus/></button>
      </div>
    </section>;
  }

  return <section className={styles.panel} aria-label="Detaljer for klipp">
    <header className={styles.header}>
      <div><span>NYTT KLIPP · STEG 2 AV 2</span><h3>Beskriv situasjonen</h3><p>{opponent} · {formatClock(start)}–{formatClock(end)} · {clipLength.toFixed(1)} sekunder</p></div>
      <button type="button" className={styles.iconButton} onClick={closeCreator} aria-label="Avbryt"><X/></button>
    </header>

    <form onSubmit={save} className={styles.form}>
      <label className={styles.wide}>Tittel<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Gjenvinning og gjennombrudd" required autoFocus/></label>
      <label>Kategori<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
      <div className={styles.rangeSummary}><span>VALGT OMRÅDE</span><b>{formatClock(start)} → {formatClock(end)}</b><small>{clipLength.toFixed(1)} sekunder</small></div>
      <label className={styles.wide}>Dette er bra<textarea value={good} onChange={e => setGood(e.target.value)} placeholder="Hva gjør laget eller spilleren godt i situasjonen?" rows={3}/></label>
      <label className={styles.wide}>Dette bør forbedres<textarea value={improve} onChange={e => setImprove(e.target.value)} placeholder="Hva bør gjøres annerledes eller trenes mer på?" rows={3}/></label>
      {error && <p className={`${styles.error} ${styles.wide}`}>{error}</p>}
      <div className={`${styles.actions} ${styles.wide}`}>
        <button type="button" className={styles.secondary} onClick={() => setStep("range")}><ChevronLeft/> Tilbake til utvalg</button>
        <button type="submit" className={styles.primary} disabled={saving}>{saving ? <LoaderCircle className={styles.spin}/> : <Check/>}{saving ? "Lagrer …" : "Lagre klipp"}</button>
      </div>
    </form>
  </section>;
}
