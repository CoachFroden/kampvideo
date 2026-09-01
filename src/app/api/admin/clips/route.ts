import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { authError, requireAdmin } from "@/lib/server-auth";

type NewClip = {
  matchId?: unknown;
  title?: unknown;
  category?: unknown;
  minute?: unknown;
  start?: unknown;
  end?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as NewClip;
    const matchId = text(body.matchId, 160);
    const title = text(body.title, 160);
    const start = Number(body.start);
    const end = Number(body.end);

    if (!matchId || !title || !Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) {
      return Response.json({ error: "Fyll inn kamp, tittel og et gyldig start- og sluttidspunkt." }, { status: 400 });
    }

    const ref = adminDb().collection("matches").doc(matchId);
    const clip = {
      id: crypto.randomUUID(),
      title,
      category: text(body.category, 80) || "Analyse",
      minute: text(body.minute, 12),
      start: Math.floor(start),
      end: Math.floor(end),
      createdBy: admin.uid,
    };

    await adminDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("MATCH_NOT_FOUND");
      const clips = Array.isArray(snapshot.data()?.clips) ? snapshot.data()!.clips : [];
      transaction.update(ref, {
        clips: [...clips, clip],
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return Response.json({ clip }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "MATCH_NOT_FOUND") {
      return Response.json({ error: "Kampen finnes ikke lenger." }, { status: 404 });
    }
    return authError(error);
  }
}
