import { adminDb } from "@/lib/firebase-admin";
import { authError, requireUser } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    await requireUser(request);
    const snapshot = await adminDb().collection("matches").orderBy("date", "desc").limit(50).get();
    const matches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return Response.json({ matches }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authError(error); }
}
