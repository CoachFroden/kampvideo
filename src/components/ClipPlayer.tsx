"use client";

import { useEffect, useRef, useState } from "react";
import { Expand, ExternalLink, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";

type Clip = {
  id: string;
  title: string;
  minute?: string;
  category?: string;
  start?: number;
  end?: number;
};

type Props = {
  src: string;
  clip: Clip;
  onOpenFullMatch: () => void;
};

function clock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function ClipPlayer({ src, clip, onOpenFullMatch }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = Math.max(0, Number(clip.start ?? 0));
  const end = Math.max(start, Number(clip.end ?? start));
  const duration = Math.max(0, end - start);
  const [relativeTime, setRelativeTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function showControls(autoHide = true) {
    setControlsVisible(true);
    clearHideTimer();
    if (!autoHide) return;
    hideTimerRef.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 5000);
  }

  useEffect(() => {
    setRelativeTime(0);
    setPlaying(false);
    setReady(false);
    setControlsVisible(true);
    clearHideTimer();
    return clearHideTimer;
  }, [src, clip.id, start, end]);

  useEffect(() => {
    if (playing) showControls(true);
    else {
      clearHideTimer();
      setControlsVisible(true);
    }
  }, [playing]);

  function clampIntoClip(video: HTMLVideoElement) {
    if (video.currentTime < start || video.currentTime > end) video.currentTime = start;
  }

  async function startPlayback() {
    const video = videoRef.current;
    if (!video || duration <= 0) return;
    if (video.currentTime >= end - 0.08 || video.currentTime < start) {
      video.currentTime = start;
      setRelativeTime(0);
    }
    showControls(true);
    try { await video.play(); } catch { /* Autoplay can be blocked; user can press play. */ }
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    showControls(true);
    if (video.paused) void startPlayback();
    else video.pause();
  }

  function seek(relative: number) {
    const video = videoRef.current;
    if (!video) return;
    showControls(true);
    const bounded = Math.min(duration, Math.max(0, relative));
    video.currentTime = start + bounded;
    setRelativeTime(bounded);
  }

  function replay() {
    const video = videoRef.current;
    if (!video) return;
    showControls(true);
    video.currentTime = start;
    setRelativeTime(0);
    void video.play().catch(() => undefined);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    showControls(true);
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  async function fullscreen() {
    showControls(true);
    const shell = shellRef.current;
    const video = videoRef.current;
    if (shell?.requestFullscreen) {
      await shell.requestFullscreen().catch(() => undefined);
      return;
    }
    const iosVideo = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    iosVideo?.webkitEnterFullscreen?.();
  }

  return <div
    className={`clip-player ${controlsVisible ? "ui-visible" : "ui-hidden"}`}
    ref={shellRef}
    onMouseMove={() => showControls(true)}
    onPointerDown={() => showControls(true)}
  >
    <video
      ref={videoRef}
      src={src}
      autoPlay
      playsInline
      controls={false}
      controlsList="nodownload"
      onContextMenu={event => event.preventDefault()}
      onLoadedMetadata={event => {
        const video = event.currentTarget;
        video.currentTime = start;
        setRelativeTime(0);
        setReady(true);
        showControls(true);
        void video.play().catch(() => undefined);
      }}
      onSeeking={event => clampIntoClip(event.currentTarget)}
      onTimeUpdate={event => {
        const video = event.currentTarget;
        if (video.currentTime < start) {
          video.currentTime = start;
          return;
        }
        if (video.currentTime >= end - 0.04) {
          video.currentTime = end;
          video.pause();
          setRelativeTime(duration);
          return;
        }
        setRelativeTime(Math.min(duration, Math.max(0, video.currentTime - start)));
      }}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onClick={togglePlayback}
    />

    <div className="clip-mode-badge">
      <span>{clip.category ?? "KLIPP"}</span>
      <b>{clip.title}</b>
      {clip.minute && <small>{clip.minute}</small>}
    </div>

    {!ready && <div className="clip-loading">Laster klippet …</div>}

    <div className="clip-controls" onClick={event => { event.stopPropagation(); showControls(true); }}>
      <button type="button" className="clip-control-button main" onClick={togglePlayback} aria-label={playing ? "Pause" : "Spill av"}>
        {playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}
      </button>

      <span className="clip-clock">{clock(relativeTime)}</span>
      <input
        className="clip-seek"
        type="range"
        min="0"
        max={Math.max(duration, 0.1)}
        step="0.05"
        value={Math.min(relativeTime, Math.max(duration, 0.1))}
        onChange={event => seek(Number(event.target.value))}
        aria-label="Spol i klippet"
      />
      <span className="clip-clock end">{clock(duration)}</span>

      <button type="button" className="clip-control-button" onClick={replay} aria-label="Spill klippet på nytt"><RotateCcw/></button>
      <button type="button" className="clip-control-button" onClick={toggleMute} aria-label={muted ? "Slå på lyd" : "Demp lyd"}>{muted ? <VolumeX/> : <Volume2/>}</button>
      <button type="button" className="clip-control-button" onClick={() => void fullscreen()} aria-label="Fullskjerm"><Expand/></button>
    </div>

    <button type="button" className="open-full-match" onClick={() => { showControls(true); onOpenFullMatch(); }}>
      <ExternalLink/> Se i hele kampen
    </button>
  </div>;
}
