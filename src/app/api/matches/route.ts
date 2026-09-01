import { adminDb } from "@/lib/firebase-admin";
import { authError, requireUser } from "@/lib/server-auth";

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
