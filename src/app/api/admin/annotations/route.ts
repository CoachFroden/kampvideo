import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { authError, requireAdmin } from "@/lib/server-auth";

type Point = { x: number; y: number };
type Drawing = {
  id: string;
  type: "arrow" | "line" | "circle" | "freehand" | "text";
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
  updatedBy?: string;
  updatedAt?: number;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function number(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : null;
}

function point(value: unknown): Point | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const x = number(raw.x, 0, 1);
  const y = number(raw.y, 0, 1);
  return x === null || y === null ? null : { x, y };
}

function drawing(value: unknown): Drawing | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (type !== "arrow" && type !== "line" && type !== "circle" && type !== "freehand" && type !== "text") return null;

  const id = text(raw.id, 80) || crypto.randomUUID();
  const requestedColor = text(raw.color, 7);
  const color = /^#[0-9a-f]{6}$/i.test(requestedColor) ? requestedColor : "#b8ff3d";
  const strokeWidth = number(raw.strokeWidth, 2, 10) ?? 4;

  if (type === "freehand") {
    if (!Array.isArray(raw.points)) return null;
    const points = raw.points.slice(0, 500).map(point).filter((item): item is Point => item !== null);
    if (points.length < 2) return null;
    return { id, type, color, strokeWidth, points };
  }

  const start = point(raw.start);
  if (!start) return null;

  if (type === "text") {
    const valueText = text(raw.text, 120);
    if (!valueText) return null;
    return { id, type, color, strokeWidth, start, text: valueText };
  }

  const end = point(raw.end);
  if (!end) return null;
  return { id, type, color, strokeWidth, start, end };
}

function existingFrames(value: unknown): AnnotationFrame[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AnnotationFrame => {
    if (!item || typeof item !== "object") return false;
    const frame = item as Record<string, unknown>;
    return typeof frame.id === "string" && typeof frame.time === "number" && Array.isArray(frame.drawings);
  });
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    const matchId = text(body.matchId, 160);
    const clipId = text(body.clipId, 160);
    const frameId = text(body.frameId, 160);
    const time = Number(body.time);

    if (!matchId || !clipId || !Number.isFinite(time) || time < 0 || !Array.isArray(body.drawings) || body.drawings.length > 40) {
      return Response.json({ error: "Ugyldig analysepunkt." }, { status: 400 });
    }

    const drawings = body.drawings.map(drawing).filter((item): item is Drawing => item !== null);
    if (drawings.length !== body.drawings.length) {
      return Response.json({ error: "En eller flere tegninger er ugyldige." }, { status: 400 });
    }

    const ref = adminDb().collection("matches").doc(matchId);
    let savedAnnotations: AnnotationFrame[] = [];

    await adminDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("MATCH_NOT_FOUND");
      const data = snapshot.data()!;
      const clips = Array.isArray(data.clips) ? [...data.clips] : [];
      const clipIndex = clips.findIndex(item => item && typeof item === "object" && (item as Record<string, unknown>).id === clipId);
      if (clipIndex < 0) throw new Error("CLIP_NOT_FOUND");

      const clip = { ...(clips[clipIndex] as Record<string, unknown>) };
      const clipStart = Number(clip.start ?? 0);
      const clipEnd = Number(clip.end ?? clipStart);
      if (Number.isFinite(clipStart) && Number.isFinite(clipEnd) && clipEnd > clipStart && time > clipEnd - clipStart + 0.5) {
        throw new Error("TIME_OUTSIDE_CLIP");
      }

      const annotations = existingFrames(clip.annotations);
      const existingIndex = annotations.findIndex(frame => frame.id === frameId || Math.abs(frame.time - time) <= 0.15);

      if (drawings.length === 0) {
        if (existingIndex >= 0) annotations.splice(existingIndex, 1);
      } else {
        const nextFrame: AnnotationFrame = {
          id: existingIndex >= 0 ? annotations[existingIndex].id : crypto.randomUUID(),
          time: Math.round(time * 100) / 100,
          drawings,
          updatedBy: admin.uid,
          updatedAt: Date.now(),
        };
        if (existingIndex >= 0) annotations[existingIndex] = nextFrame;
        else annotations.push(nextFrame);
      }

      annotations.sort((a, b) => a.time - b.time);
      clip.annotations = annotations;
      clips[clipIndex] = clip;
      transaction.update(ref, { clips, updatedAt: FieldValue.serverTimestamp() });
      savedAnnotations = annotations;
    });

    return Response.json({ annotations: savedAnnotations });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "MATCH_NOT_FOUND") return Response.json({ error: "Kampen finnes ikke lenger." }, { status: 404 });
      if (error.message === "CLIP_NOT_FOUND") return Response.json({ error: "Klippet finnes ikke lenger." }, { status: 404 });
      if (error.message === "TIME_OUTSIDE_CLIP") return Response.json({ error: "Analysepunktet ligger utenfor klippet." }, { status: 400 });
    }
    return authError(error);
  }
}
