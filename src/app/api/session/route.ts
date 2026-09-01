import { adminAuth } from "@/lib/firebase-admin";
import { authError } from "@/lib/server-auth";

const MAX_AGE_SECONDS = 60 * 60;

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();
    if (typeof idToken !== "string") return Response.json({ error: "Ugyldig token" }, { status: 400 });
    await adminAuth().verifyIdToken(idToken, true);
    const session = await adminAuth().createSessionCookie(idToken, { expiresIn: MAX_AGE_SECONDS * 1000 });
    return Response.json({ ok: true }, { headers: {
      "Set-Cookie": `kampvideo_session=${encodeURIComponent(session)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`,
      "Cache-Control": "no-store",
    }});
  } catch (error) { return authError(error); }
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: {
    "Set-Cookie": "kampvideo_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict",
    "Cache-Control": "no-store",
  }});
}
