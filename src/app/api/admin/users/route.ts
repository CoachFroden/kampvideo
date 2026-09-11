import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { authError, requireAdmin } from "@/lib/server-auth";

const clean = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as {
      action?: unknown;
      uid?: unknown;
      email?: unknown;
      name?: unknown;
      role?: unknown;
      approved?: unknown;
    };

    if (body.action === "createUser") {
      const email = clean(body.email, 200).toLowerCase();
      const name = clean(body.name, 100);
      const role = body.role === "admin" ? "admin" : "viewer";
      const approved = body.approved !== false;
      if (!name || name.length < 2) return Response.json({ error: "Skriv inn brukerens navn." }, { status: 400 });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Skriv inn en gyldig e-postadresse." }, { status: 400 });

      try {
        await adminAuth().getUserByEmail(email);
        return Response.json({ error: "Det finnes allerede en konto med denne e-postadressen." }, { status: 409 });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
        if (code && !code.includes("user-not-found")) throw error;
      }

      const temporaryPassword = `${randomBytes(32).toString("base64url")}Aa1!`;
      const created = await adminAuth().createUser({ email, displayName: name, password: temporaryPassword, emailVerified: false });
      try {
        await adminDb().collection("users").doc(created.uid).set({
          email,
          name,
          approved,
          role,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: admin.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        await adminAuth().deleteUser(created.uid).catch(() => undefined);
        throw error;
      }
      return Response.json({ ok: true, uid: created.uid, email, approved, role });
    }

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
