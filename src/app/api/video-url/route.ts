import { adminDb } from "@/lib/firebase-admin";
import { authError, requireUser } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const { matchId, clipId } = await request.json();
    if (typeof matchId !== "string") return Response.json({ error: "Ugyldig kamp" }, { status: 400 });
    const snap = await adminDb().collection("matches").doc(matchId).get();
    if (!snap.exists) return Response.json({ error: "Kampen finnes ikke" }, { status: 404 });
    const match = snap.data()!;
    if (typeof match.videoKey !== "string") return Response.json({ error: "Video mangler" }, { status: 404 });
    if (clipId) {
      const clip = Array.isArray(match.clips) ? match.clips.find((item: { id?: string }) => item.id === clipId) : null;
      if (!clip) return Response.json({ error: "Klippet finnes ikke" }, { status: 404 });
    }
    const query = new URLSearchParams({ matchId });
    return Response.json({ url: `/api/stream?${query}`, sessionBound: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authError(error); }
}
