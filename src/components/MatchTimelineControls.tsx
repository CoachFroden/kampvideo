"use client";

import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import styles from "./MatchTimelineControls.module.css";

export type TimelineClip = {
  id: string;
  title: string;
  minute?: string;
  start?: number;
  end?: number;
  category?: string;
  good?: string;
  improve?: string;
};

type Props = {
  videoRef?: RefObject<HTMLVideoElement | null>;
  clips: TimelineClip[];
  onOpenClip: (clip: TimelineClip) => void;
  durationOverride?: number;
  currentOverride?: number;
  activeClipId?: string | null;
};

function formatClock(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function MatchTimelineControls({
  videoRef,
  clips,
  onOpenClip,
  durationOverride = 0,
  currentOverride,
  activeClipId = null,
}: Props) {
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationOverride);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  useEffect(() => {
    if (durationOverride > 0) setDuration(durationOverride);
  }, [durationOverride]);

  useEffect(() => {
    if (typeof currentOverride === "number" && Number.isFinite(currentOverride)) setCurrent(currentOverride);
  }, [currentOverride]);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const sync = () => {
      setCurrent(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
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
  }, [videoRef]);

  const markers = useMemo(() => clips
    .filter((clip) => typeof clip.start === "number" && Number.isFinite(clip.start) && clip.start >= 0)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0)), [clips]);

  const fallbackDuration = useMemo(() => markers.reduce((max, clip) => Math.max(max, Number(clip.end ?? clip.start ?? 0)), 0), [markers]);
  const timelineDuration = duration > 0 ? duration : fallbackDuration;
  const selectedClip = selectedClipId ? markers.find((clip) => clip.id === selectedClipId) ?? null : null;
  const currentPercent = timelineDuration > 0 ? Math.max(0, Math.min(100, (current / timelineDuration) * 100)) : 0;
  const canJump = Boolean(videoRef?.current);

  function jump(seconds: number) {
    const video = videoRef?.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Math.max(0, video.currentTime + seconds);
    const next = Math.max(0, Math.min(max, video.currentTime + seconds));
    video.currentTime = next;
    setCurrent(next);
  }

  return <section className={styles.shell} aria-label="Navigasjon i kampvideo">
    {canJump && <div className={styles.controls}>
      <div className={styles.jumps} role="group" aria-label="Hopp i videoen">
        <button type="button" onClick={() => jump(-5)} aria-label="5 sekunder tilbake">−5s</button>
        <button type="button" onClick={() => jump(-1)} aria-label="1 sekund tilbake">−1s</button>
        <button type="button" onClick={() => jump(1)} aria-label="1 sekund frem">+1s</button>
        <button type="button" onClick={() => jump(5)} aria-label="5 sekunder frem">+5s</button>
      </div>
      <div className={styles.clock}><b>{formatClock(current)}</b><span>/ {timelineDuration > 0 ? formatClock(timelineDuration) : "–:––"}</span></div>
    </div>}

    <div className={styles.timelineBlock}>
      <div className={styles.timelineHead}><span>KLIPPMARKØRER</span><small>{markers.length ? `${markers.length} klipp` : "Ingen klipp"}</small></div>
      <div className={styles.timeline}>
        <div className={styles.rail}/>
        {canJump && <><div className={styles.progress} style={{ width: `${currentPercent}%` }}/><div className={styles.playhead} style={{ left: `${currentPercent}%` }} aria-hidden="true"/></>}
        {timelineDuration > 0 && markers.map((clip) => {
          const position = Math.max(0, Math.min(100, ((clip.start ?? 0) / timelineDuration) * 100));
          const selected = clip.id === selectedClipId;
          const active = clip.id === activeClipId;
          return <button
            type="button"
            key={clip.id}
            className={`${styles.marker} ${selected ? styles.selected : ""} ${active ? styles.active : ""}`}
            style={{ left: `${position}%` }}
            aria-label={`${clip.title}, ${formatClock(clip.start ?? 0)}`}
            title={`${clip.title} · ${formatClock(clip.start ?? 0)}`}
            onClick={() => setSelectedClipId(selected ? null : clip.id)}
          ><span/></button>;
        })}
      </div>
      <div className={styles.timelineTimes}><span>0:00</span><span>{timelineDuration > 0 ? formatClock(timelineDuration) : "–:––"}</span></div>

      {selectedClip && <button type="button" className={styles.clipPopup} onClick={() => onOpenClip(selectedClip)}>
        <b>{selectedClip.title}</b>
        <span>{formatClock(selectedClip.start ?? 0)}</span>
      </button>}
    </div>
  </section>;
}
