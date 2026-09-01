import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebase-admin";

export async function requireUser(request: Request, requireApproved = true) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const decoded = await adminAuth().verifyIdToken(header.slice(7), true);
  const ref = adminDb().collection("users").doc(decoded.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      approved: false,
      role: "viewer",
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  const data = snap.exists ? snap.data()! : { approved: false, role: "viewer" };
  if (requireApproved && data.approved !== true) throw new Error("PENDING_APPROVAL");
  return {
    uid: decoded.uid,
    email: decoded.email,
    approved: data.approved === true,
    role: typeof data.role === "string" ? data.role : "viewer",
  };
}

export async function requireSession(request: Request, requireApproved = true) {
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)kampvideo_session=([^;]+)/)?.[1];
  if (!cookie) throw new Error("UNAUTHENTICATED");
  const decoded = await adminAuth().verifySessionCookie(decodeURIComponent(cookie), true);
  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  const data = snap.data();
  if (!data || (requireApproved && data.approved !== true)) throw new Error("PENDING_APPROVAL");
  return { uid: decoded.uid, email: decoded.email, approved: data.approved === true, role: data.role ?? "viewer" };
}

export function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const status = message === "UNAUTHENTICATED" ? 401 : message === "PENDING_APPROVAL" ? 403 : 500;
  return Response.json({ error: message }, { status });
}
