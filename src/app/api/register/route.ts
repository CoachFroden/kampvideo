import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { authError, requireUser } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request, false);
    const body = await request.json() as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    if (name.length < 2) return Response.json({ error: "Skriv inn navnet ditt." }, { status: 400 });

    await adminDb().collection("users").doc(user.uid).set({
      name,
      email: user.email ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return Response.json({ ok: true });
  } catch (error) {
    return authError(error);
  }
}
