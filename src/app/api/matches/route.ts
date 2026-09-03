import { adminDb } from "@/lib/firebase-admin";
import { authError, requireUser } from "@/lib/server-auth";

function timeToSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const numeric = Number(trimmed.replace(",", "."));
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

function normalizeClips(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const clip = item as Record<string, unknown>;
    const start = timeToSeconds(clip.start ?? clip.startTime ?? clip.startSeconds ?? clip.from);
    const end = timeToSeconds(clip.end ?? clip.endTime ?? clip.endSeconds ?? clip.to);
    return {
      ...clip,
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
    };
  });
}

export async function GET(request: Request) {
  try {
    await requireUser(request);
    const snapshot = await adminDb().collection("matches").limit(100).get();
    const matches = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          clips: normalizeClips(data.clips),
          dateIso: typeof data.dateIso === "string" ? data.dateIso : "",
        };
      })
      .sort((a, b) => {
        const left = typeof a.dateIso === "string" ? a.dateIso : "";
        const right = typeof b.dateIso === "string" ? b.dateIso : "";
        return right.localeCompare(left);
      })
      .slice(0, 50);
    return Response.json({ matches }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authError(error); }
}
