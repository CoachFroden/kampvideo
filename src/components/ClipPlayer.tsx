"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Circle,
  Expand,
  ExternalLink,
  Minimize,
  Minus,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { auth } from "@/lib/firebase-client";

type Point = { x: number; y: number };
type Tool = "arrow" | "line" | "circle" | "freehand" | "text";

type Drawing = {
  id: string;
  type: Tool;
  color: string;
  strokeWidth: number;
  start?: Point;
  end?: Point;
  points?: Point[];
  text?: string;
};

type AnnotationFrame = {
  id: string;
  time: number;
  drawings: Drawing[];
};

type Clip = {
  id: string;
  title: string;
  minute?: string;
  category?: string;
  start?: number;
  end?: number;
  matchId?: string;
  annotations?: AnnotationFrame[];
};

type Props = {
  src: string;
  clip: Clip;
  onOpenFullMatch: () => void;
};

type OverlayRect = { left: number; top: number; width: number; height: number };
type DragState = { pointerId: number; drawing: Drawing };

const SVG_SIZE = 1000;

function clock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function nearestFrame(frames: AnnotationFrame[], time: number, tolerance = 0.3) {
  let best: AnnotationFrame | undefined;
  let bestDistance = Infinity;
  for (const frame of frames) {
    const distance = Math.abs(frame.time - time);
    if (distance <= tolerance && distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  return best;
}

function svgPoint(point: Point) {
  return { x: point.x * SVG_SIZE, y: point.y * SVG_SIZE };
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function renderDrawing(drawing: Drawing) {
  const strokeWidth = Math.max(2, drawing.strokeWidth);
  const common = {
    stroke: drawing.color,
    strokeWidth,
    vectorEffect: "non-scaling-stroke" as const,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (drawing.type === "line" && drawing.start && drawing.end) {
    const start = svgPoint(drawing.start);
    const end = svgPoint(drawing.end);
    return <line key={drawing.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...common}/>;
  }

  if (drawing.type === "arrow" && drawing.start && drawing.end) {
    const start = svgPoint(drawing.start);
    const end = svgPoint(drawing.end);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = 28;
    const left = {
      x: end.x - headLength * Math.cos(angle - Math.PI / 6),
      y: end.y - headLength * Math.sin(angle - Math.PI / 6),
    };
    const right = {
      x: end.x - headLength * Math.cos(angle + Math.PI / 6),
      y: end.y - headLength * Math.sin(angle + Math.PI / 6),
    };
    return <g key={drawing.id}>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...common}/>
      <polyline points={`${left.x},${left.y} ${end.x},${end.y} ${right.x},${right.y}`} {...common}/>
    </g>;
  }

  if (drawing.type === "circle" && drawing.start && drawing.end) {
    const start = svgPoint(drawing.start);
    const end = svgPoint(drawing.end);
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    return <ellipse key={drawing.id} cx={cx} cy={cy} rx={rx} ry={ry} {...common}/>;
  }

  if (drawing.type === "freehand" && drawing.points && drawing.points.length > 1) {
    const points = drawing.points.map(point => {
      const value = svgPoint(point);
      return `${value.x},${value.y}`;
    }).join(" ");
    return <polyline key={drawing.id} points={points} {...common}/>;
  }

  if (drawing.type === "text" && drawing.start && drawing.text) {
    const start = svgPoint(drawing.start);
    return <text
      key={drawing.id}
      x={start.x}
      y={start.y}
      fill={drawing.color}
      stroke="#06100b"
      strokeWidth="4"
      vectorEffect="non-scaling-stroke"
      paintOrder="stroke"
      fontSize="44"
      fontWeight="700"
      fontFamily="DM Sans, sans-serif"
    >{drawing.text}</text>;
  }

  return null;
}

export default function ClipPlayer({ src, clip, onOpenFullMatch }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenFramesRef = useRef(new Set<string>());
  const lastTimeRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);

  const start = Math.max(0, Number(clip.start ?? 0));
  const end = Math.max(start, Number(clip.end ?? start));
  const duration = Math.max(0, end - start);

  const [relativeTime, setRelativeTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [frames, setFrames] = useState<AnnotationFrame[]>(() => Array.isArray(clip.annotations) ? clip.annotations : []);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTime, setEditorTime] = useState(0);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState("#b8ff3d");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [draftDrawings, setDraftDrawings] = useState<Drawing[]>([]);
  const [previewDrawing, setPreviewDrawing] = useState<Drawing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [overlayRect, setOverlayRect] = useState<OverlayRect>({ left: 0, top: 0, width: 0, height: 0 });

  const orderedFrames = useMemo(() => [...frames].sort((a, b) => a.time - b.time), [frames]);
  const activeFrame = activeFrameId ? frames.find(frame => frame.id === activeFrameId) : undefined;
  const visibleDrawings = editorOpen
    ? [...draftDrawings, ...(previewDrawing ? [previewDrawing] : [])]
    : activeFrame?.drawings ?? [];
  const fullscreenActive = isFullscreen || pseudoFullscreen;

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function showControls(autoHide = true) {
    setControlsVisible(true);
    clearHideTimer();
    if (!autoHide || editorOpen) return;
    hideTimerRef.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, 5000);
  }

  function updateOverlayRect() {
    const shell = shellRef.current;
    const video = videoRef.current;
    if (!shell || !video) return;
    const shellRect = shell.getBoundingClientRect();
    if (!shellRect.width || !shellRect.height || !video.videoWidth || !video.videoHeight) {
      setOverlayRect({ left: 0, top: 0, width: shellRect.width, height: shellRect.height });
      return;
    }

    const videoAspect = video.videoWidth / video.videoHeight;
    const shellAspect = shellRect.width / shellRect.height;
    if (shellAspect > videoAspect) {
      const height = shellRect.height;
      const width = height * videoAspect;
      setOverlayRect({ left: (shellRect.width - width) / 2, top: 0, width, height });
    } else {
      const width = shellRect.width;
      const height = width / videoAspect;
      setOverlayRect({ left: 0, top: (shellRect.height - height) / 2, width, height });
    }
  }

  useEffect(() => {
    setRelativeTime(0);
    setPlaying(false);
    setReady(false);
    setControlsVisible(true);
    setEditorOpen(false);
    setActiveFrameId(null);
    setFrames(Array.isArray(clip.annotations) ? clip.annotations : []);
    setPseudoFullscreen(false);
    seenFramesRef.current.clear();
    lastTimeRef.current = 0;
    clearHideTimer();
    return clearHideTimer;
  }, [src, clip.id, start, end]);

  useEffect(() => {
    let cancelled = false;
    async function checkAdmin() {
      const user = auth.currentUser;
      if (!user || !clip.matchId) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!cancelled) setIsAdmin(response.ok && data.role === "admin");
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    }
    void checkAdmin();
    return () => { cancelled = true; };
  }, [clip.id, clip.matchId]);

  useEffect(() => {
    if (playing) showControls(true);
    else {
      clearHideTimer();
      setControlsVisible(true);
    }
  }, [playing]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
      window.setTimeout(updateOverlayRect, 0);
    };
    const resize = () => window.setTimeout(updateOverlayRect, 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pseudoFullscreen) setPseudoFullscreen(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      document.removeEventListener("keydown", keydown);
    };
  }, [pseudoFullscreen]);

  useEffect(() => {
    if (!pseudoFullscreen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.setTimeout(updateOverlayRect, 0);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.setTimeout(updateOverlayRect, 0);
    };
  }, [pseudoFullscreen]);

  function clampIntoClip(video: HTMLVideoElement) {
    if (video.currentTime < start || video.currentTime > end) video.currentTime = start;
  }

  async function startPlayback() {
    const video = videoRef.current;
    if (!video || duration <= 0 || editorOpen) return;
    if (video.currentTime >= end - 0.08 || video.currentTime < start) {
      video.currentTime = start;
      setRelativeTime(0);
      lastTimeRef.current = 0;
      seenFramesRef.current.clear();
    }
    setActiveFrameId(null);
    showControls(true);
    try { await video.play(); } catch { /* User can press play if autoplay is blocked. */ }
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video || editorOpen) return;
    showControls(true);
    if (video.paused) void startPlayback();
    else video.pause();
  }

  function seek(relative: number) {
    const video = videoRef.current;
    if (!video || editorOpen) return;
    showControls(true);
    const bounded = Math.min(duration, Math.max(0, relative));
    video.currentTime = start + bounded;
    setRelativeTime(bounded);
    lastTimeRef.current = bounded;
    seenFramesRef.current.clear();
    const frame = nearestFrame(orderedFrames, bounded);
    setActiveFrameId(frame?.id ?? null);
  }

  function replay() {
    const video = videoRef.current;
    if (!video || editorOpen) return;
    showControls(true);
    video.currentTime = start;
    setRelativeTime(0);
    lastTimeRef.current = 0;
    setActiveFrameId(null);
    seenFramesRef.current.clear();
    void video.play().catch(() => undefined);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    showControls(true);
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  async function toggleFullscreen() {
    showControls(true);
    const shell = shellRef.current;

    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      window.setTimeout(updateOverlayRect, 0);
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    // iPhone's native video fullscreen only contains the <video> element.
    // Our tactical drawings live in a DOM overlay, so native fullscreen would hide them.
    // Keep the whole player in the page and make that element fullscreen instead.
    if (isIOS() || !shell?.requestFullscreen) {
      setPseudoFullscreen(true);
      window.setTimeout(updateOverlayRect, 0);
      return;
    }

    try {
      await shell.requestFullscreen();
    } catch {
      setPseudoFullscreen(true);
      window.setTimeout(updateOverlayRect, 0);
    }
  }

  function openEditor() {
    const video = videoRef.current;
    if (!video || !isAdmin || !clip.matchId) return;
    video.pause();
    const time = Math.min(duration, Math.max(0, video.currentTime - start));
    const existing = nearestFrame(orderedFrames, time, 0.35);
    const frameTime = existing?.time ?? time;
    if (existing) video.currentTime = start + frameTime;
    setRelativeTime(frameTime);
    lastTimeRef.current = frameTime;
    setEditorTime(frameTime);
    setEditingFrameId(existing?.id ?? null);
    setDraftDrawings(existing?.drawings ? [...existing.drawings] : []);
    setPreviewDrawing(null);
    setActiveFrameId(existing?.id ?? null);
    setSaveMessage("");
    setEditorOpen(true);
    clearHideTimer();
    setControlsVisible(true);
  }

  function closeEditor() {
    dragRef.current = null;
    setPreviewDrawing(null);
    setEditorOpen(false);
    setSaveMessage("");
    const frame = nearestFrame(orderedFrames, relativeTime, 0.35);
    setActiveFrameId(frame?.id ?? null);
  }

  function pointFromEvent(event: ReactPointerEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function beginDrawing(event: ReactPointerEvent<SVGSVGElement>) {
    if (!editorOpen || saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);

    if (tool === "text") {
      const value = window.prompt("Skriv teksten som skal vises på bildet:")?.trim();
      if (!value) return;
      setDraftDrawings(current => [...current, {
        id: crypto.randomUUID(),
        type: "text",
        color,
        strokeWidth,
        start: point,
        text: value.slice(0, 120),
      }]);
      return;
    }

    const drawing: Drawing = tool === "freehand"
      ? { id: crypto.randomUUID(), type: tool, color, strokeWidth, points: [point] }
      : { id: crypto.randomUUID(), type: tool, color, strokeWidth, start: point, end: point };
    dragRef.current = { pointerId: event.pointerId, drawing };
    setPreviewDrawing(drawing);
  }

  function moveDrawing(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    const drawing = drag.drawing;
    if (drawing.type === "freehand") {
      const next = { ...drawing, points: [...(drawing.points ?? []), point] };
      dragRef.current = { ...drag, drawing: next };
      setPreviewDrawing(next);
    } else {
      const next = { ...drawing, end: point };
      dragRef.current = { ...drag, drawing: next };
      setPreviewDrawing(next);
    }
  }

  function finishDrawing(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
    const drawing = drag.drawing;
    dragRef.current = null;
    setPreviewDrawing(null);

    const valid = drawing.type === "freehand"
      ? (drawing.points?.length ?? 0) > 1
      : !!drawing.start && !!drawing.end &&
        (Math.abs(drawing.end.x - drawing.start.x) > 0.002 || Math.abs(drawing.end.y - drawing.start.y) > 0.002);
    if (valid) setDraftDrawings(current => [...current, drawing]);
  }

  async function saveAnnotations() {
    const user = auth.currentUser;
    if (!user || !clip.matchId || saving) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/annotations", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          matchId: clip.matchId,
          clipId: clip.id,
          frameId: editingFrameId,
          time: editorTime,
          drawings: draftDrawings,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Kunne ikke lagre tegningen.");
      const nextFrames = Array.isArray(data.annotations) ? data.annotations as AnnotationFrame[] : [];
      setFrames(nextFrames);
      clip.annotations = nextFrames;
      const saved = nearestFrame(nextFrames, editorTime, 0.35);
      setActiveFrameId(saved?.id ?? null);
      setEditingFrameId(saved?.id ?? null);
      setSaveMessage(draftDrawings.length ? "Lagret" : "Analysepunkt slettet");
      setEditorOpen(false);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Kunne ikke lagre tegningen.");
    } finally {
      setSaving(false);
    }
  }

  return <div
    className={`clip-player ${controlsVisible ? "ui-visible" : "ui-hidden"} ${editorOpen ? "annotation-editing" : ""} ${pseudoFullscreen ? "pseudo-fullscreen" : ""}`}
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
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "true");
        video.currentTime = start;
        setRelativeTime(0);
        lastTimeRef.current = 0;
        setReady(true);
        updateOverlayRect();
        showControls(true);
        void video.play().catch(() => undefined);
      }}
      onSeeking={event => clampIntoClip(event.currentTarget)}
      onSeeked={event => {
        const rel = Math.min(duration, Math.max(0, event.currentTarget.currentTime - start));
        lastTimeRef.current = rel;
        const frame = nearestFrame(orderedFrames, rel);
        if (event.currentTarget.paused && !editorOpen) setActiveFrameId(frame?.id ?? null);
      }}
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
          lastTimeRef.current = duration;
          return;
        }

        const nextRelative = Math.min(duration, Math.max(0, video.currentTime - start));
        const previous = lastTimeRef.current;
        setRelativeTime(nextRelative);

        if (!editorOpen && !video.paused && nextRelative >= previous) {
          const frame = orderedFrames.find(item =>
            !seenFramesRef.current.has(item.id) && item.time >= previous - 0.01 && item.time <= nextRelative + 0.12
          );
          if (frame) {
            seenFramesRef.current.add(frame.id);
            video.currentTime = start + frame.time;
            video.pause();
            setRelativeTime(frame.time);
            lastTimeRef.current = frame.time;
            setActiveFrameId(frame.id);
            return;
          }
        }
        lastTimeRef.current = nextRelative;
      }}
      onPlay={() => {
        setPlaying(true);
        if (!editorOpen) setActiveFrameId(null);
      }}
      onPause={event => {
        setPlaying(false);
        if (!editorOpen) {
          const rel = Math.min(duration, Math.max(0, event.currentTarget.currentTime - start));
          const frame = nearestFrame(orderedFrames, rel, 0.4);
          setActiveFrameId(frame?.id ?? null);
        }
      }}
      onClick={togglePlayback}
    />

    <div
      className={`annotation-stage ${editorOpen ? "editing" : ""}`}
      style={{ left: overlayRect.left, top: overlayRect.top, width: overlayRect.width, height: overlayRect.height }}
    >
      <svg
        className="annotation-svg"
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        preserveAspectRatio="none"
        onPointerDown={beginDrawing}
        onPointerMove={moveDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
      >
        {visibleDrawings.map(renderDrawing)}
      </svg>
    </div>

    <div className="clip-mode-badge">
      <span>{clip.category ?? "KLIPP"}</span>
      <b>{clip.title}</b>
      {clip.minute && <small>{clip.minute}</small>}
    </div>

    {!ready && <div className="clip-loading">Laster klippet …</div>}

    {activeFrame && !editorOpen && <button type="button" className="annotation-pause-badge" onClick={() => void startPlayback()}>
      <span>ANALYSEPUNKT</span><b>Trykk for å fortsette</b><Play fill="currentColor"/>
    </button>}

    {isAdmin && clip.matchId && !editorOpen && <button type="button" className="annotation-open-button" onClick={openEditor}>
      <Pencil/> Tegn på bildet
    </button>}

    {editorOpen && <div className="annotation-toolbar" onPointerDown={event => event.stopPropagation()}>
      <div className="annotation-toolbar-main">
        <button type="button" className={tool === "arrow" ? "active" : ""} onClick={() => setTool("arrow")} title="Pil"><ArrowUpRight/><span>Pil</span></button>
        <button type="button" className={tool === "line" ? "active" : ""} onClick={() => setTool("line")} title="Linje"><Minus/><span>Linje</span></button>
        <button type="button" className={tool === "circle" ? "active" : ""} onClick={() => setTool("circle")} title="Sirkel"><Circle/><span>Sirkel</span></button>
        <button type="button" className={tool === "freehand" ? "active" : ""} onClick={() => setTool("freehand")} title="Frihånd"><Pencil/><span>Frihånd</span></button>
        <button type="button" className={tool === "text" ? "active" : ""} onClick={() => setTool("text")} title="Tekst"><Type/><span>Tekst</span></button>
        <label className="annotation-color" title="Farge"><input type="color" value={color} onChange={event => setColor(event.target.value)}/></label>
        <label className="annotation-width" title="Strektykkelse"><span>{strokeWidth}</span><input type="range" min="2" max="10" value={strokeWidth} onChange={event => setStrokeWidth(Number(event.target.value))}/></label>
      </div>
      <div className="annotation-toolbar-actions">
        <span className="annotation-time">{clock(editorTime)}</span>
        <button type="button" onClick={() => setDraftDrawings(current => current.slice(0, -1))} disabled={!draftDrawings.length} title="Angre"><Undo2/></button>
        <button type="button" onClick={() => setDraftDrawings([])} disabled={!draftDrawings.length} title="Fjern alt"><Trash2/></button>
        <button type="button" className="save" onClick={() => void saveAnnotations()} disabled={saving}><Save/><span>{saving ? "Lagrer …" : draftDrawings.length ? "Lagre" : editingFrameId ? "Slett punkt" : "Lagre"}</span></button>
        <button type="button" onClick={closeEditor} title="Avbryt"><X/></button>
      </div>
    </div>}

    {saveMessage && !editorOpen && <div className="annotation-save-message">{saveMessage}</div>}

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
        disabled={editorOpen}
      />
      <span className="clip-clock end">{clock(duration)}</span>
      <button type="button" className="clip-control-button" onClick={replay} aria-label="Spill klippet på nytt" disabled={editorOpen}><RotateCcw/></button>
      <button type="button" className="clip-control-button" onClick={toggleMute} aria-label={muted ? "Slå på lyd" : "Demp lyd"}>{muted ? <VolumeX/> : <Volume2/>}</button>
      <button type="button" className="clip-control-button" onClick={() => void toggleFullscreen()} aria-label={fullscreenActive ? "Avslutt fullskjerm" : "Fullskjerm"}>{fullscreenActive ? <Minimize/> : <Expand/>}</button>
    </div>

    <button type="button" className="open-full-match" onClick={() => { showControls(true); onOpenFullMatch(); }}>
      <ExternalLink/> Se i hele kampen
    </button>
  </div>;
}
