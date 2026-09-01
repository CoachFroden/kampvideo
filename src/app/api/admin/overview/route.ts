import { adminDb } from "@/lib/firebase-admin";
import { authError, requireAdmin } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const [matchesSnapshot, usersSnapshot] = await Promise.all([
      adminDb().collection("matches").limit(100).get(),
      adminDb().collection("users").limit(200).get(),
    ]);

    const matches = matchesSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          dateIso: typeof data.dateIso === "string" ? data.dateIso : "",
        };
      })
      .sort((a, b) => String(b.dateIso ?? "").localeCompare(String(a.dateIso ?? "")));

    const users = usersSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          uid: doc.id,
          email: typeof data.email === "string" ? data.email : "Ukjent e-post",
          name: typeof data.name === "string" ? data.name : "",
          approved: data.approved === true,
          role: typeof data.role === "string" ? data.role : "viewer",
        };
      })
      .sort((a, b) => Number(a.approved) - Number(b.approved) || a.email.localeCompare(b.email, "nb"));

    return Response.json(
      { matches, users },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return authError(error);
  }
}
