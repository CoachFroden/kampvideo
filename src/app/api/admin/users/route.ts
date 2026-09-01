import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { authError, requireAdmin } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { uid?: unknown };
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    if (!uid || uid.length > 160) {
      return Response.json({ error: "Ugyldig bruker." }, { status: 400 });
    }

    const ref = adminDb().collection("users").doc(uid);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return Response.json({ error: "Brukeren finnes ikke lenger." }, { status: 404 });
    }

    await ref.update({
      approved: true,
      approvedAt: FieldValue.serverTimestamp(),
      approvedBy: admin.uid,
    });

    return Response.json({ approved: true });
  } catch (error) {
    return authError(error);
  }
}
