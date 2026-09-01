import { adminDb } from "@/lib/firebase-admin";
import { r2Client, videoCommand } from "@/lib/r2";
import { authError, requireSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSession(request);
    const matchId = new URL(request.url).searchParams.get("matchId");
    if (!matchId) return Response.json({ error: "Ugyldig kamp" }, { status: 400 });
    const snap = await adminDb().collection("matches").doc(matchId).get();
    if (!snap.exists) return Response.json({ error: "Kampen finnes ikke" }, { status: 404 });
    const key = snap.data()?.videoKey;
    if (typeof key !== "string") return Response.json({ error: "Video mangler" }, { status: 404 });
    const range = request.headers.get("range");
    const object = await r2Client().send(videoCommand(key, range));
    if (!object.Body) return Response.json({ error: "Tom videofil" }, { status: 502 });
    const headers = new Headers({
      "Content-Type": object.ContentType || "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    });
    if (object.ContentLength != null) headers.set("Content-Length", String(object.ContentLength));
    if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
    if (object.ETag) headers.set("ETag", object.ETag);
    return new Response(object.Body.transformToWebStream(), { status: range ? 206 : 200, headers });
  } catch (error) { return authError(error); }
}
