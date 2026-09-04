import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { listVideos } from "@/lib/r2";
import { authError, requireAdmin } from "@/lib/server-auth";

type ClipInput = { title?: unknown; category?: unknown; start?: unknown; end?: unknown; good?: unknown; improve?: unknown; videoKey?: unknown };
type MatchInput = { opponent?: unknown; date?: unknown; venue?: unknown; competition?: unknown; homeScore?: unknown; awayScore?: unknown; isHome?: unknown; videoKey?: unknown };

const clean = (value: unknown, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : "";
const score = (value: unknown) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 99 ? Number(value) : null;
const preciseTime = (value: number) => Math.round(value * 100) / 100;

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [usersSnap, matchesSnap, files] = await Promise.all([
      adminDb().collection("users").orderBy("createdAt", "desc").limit(200).get(),
      adminDb().collection("matches").orderBy("date", "desc").limit(100).get(),
      listVideos(),
    ]);
    const users = usersSnap.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, email: data.email ?? "", name: data.name ?? "", approved: data.approved === true, role: data.role ?? "viewer", createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null };
    });
    const matches = matchesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return Response.json({ users, matches, files }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authError(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    if (body.action === "createMatch") return createMatch(body.match as MatchInput);
    if (body.action === "createClip") return createClip(clean(body.matchId, 80), body.clip as ClipInput);
    return Response.json({ error: "Ukjent handling" }, { status: 400 });
  } catch (error) { return authError(error); }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    if (body.action === "updateMatch") return updateMatch(clean(body.matchId, 80), body.match as MatchInput);
    if (body.action === "updateClip") return updateClip(clean(body.matchId, 80), clean(body.clipId, 80), body.clip as ClipInput);
    if (body.action !== "updateUser") return Response.json({ error: "Ukjent handling" }, { status: 400 });
    const userId = clean(body.userId, 128);
    const approved = body.approved === true;
    const role = body.role === "admin" ? "admin" : "viewer";
    if (!userId) return Response.json({ error: "Bruker mangler" }, { status: 400 });
    if (userId === admin.uid && (!approved || role !== "admin")) return Response.json({ error: "Du kan ikke fjerne din egen administratortilgang" }, { status: 400 });
    await adminDb().collection("users").doc(userId).update({ approved, role, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true });
  } catch (error) { return authError(error); }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const matchId = clean(searchParams.get("matchId"), 80);
    const clipId = clean(searchParams.get("clipId"), 80);
    if (!matchId) return Response.json({ error: "Kamp mangler" }, { status: 400 });
    if (!clipId) {
      await adminDb().collection("matches").doc(matchId).delete();
      return Response.json({ ok: true });
    }
    const ref = adminDb().collection("matches").doc(matchId);
    await adminDb().runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error("Kampen finnes ikke");
      const clips = Array.isArray(snap.data()?.clips) ? snap.data()!.clips : [];
      transaction.update(ref, { clips: clips.filter((clip: { id?: string }) => clip.id !== clipId), updatedAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ ok: true });
  } catch (error) { return authError(error); }
}

async function createMatch(input: MatchInput) {
  const opponent = clean(input.opponent);
  const date = clean(input.date, 10);
  const videoKey = clean(input.videoKey, 500);
  const homeScore = score(input.homeScore);
  const awayScore = score(input.awayScore);
  if (!opponent || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !videoKey || homeScore === null || awayScore === null) {
    return Response.json({ error: "Fyll inn motstander, dato, resultat og videofil" }, { status: 400 });
  }
  const files = await listVideos();
  if (!files.some((file) => file.key === videoKey)) return Response.json({ error: "Videofilen finnes ikke i R2" }, { status: 400 });
  const doc = await adminDb().collection("matches").add({
    opponent, date, dateIso: date, videoKey, homeScore, awayScore,
    venue: clean(input.venue), competition: clean(input.competition) || "G14 · Seriekamp",
    isHome: input.isHome !== false, clips: [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ ok: true, id: doc.id });
}

async function validateClipVideo(videoKey: string) {
  if (!videoKey) return true;
  const files = await listVideos();
  return files.some((file) => file.key === videoKey);
}

async function createClip(matchId: string, input: ClipInput) {
  const title = clean(input.title);
  const category = clean(input.category, 60) || "Analyse";
  const videoKey = clean(input.videoKey, 500);
  const start = Number(input.start);
  const end = Number(input.end);
  if (!matchId || !title || !Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) {
    return Response.json({ error: "Klippet må ha tittel og gyldig start- og sluttid" }, { status: 400 });
  }
  if (!(await validateClipVideo(videoKey))) return Response.json({ error: "Videofilen til klippet finnes ikke i R2" }, { status: 400 });

  const ref = adminDb().collection("matches").doc(matchId);
  const clip = {
    id: crypto.randomUUID(),
    title,
    category,
    start: preciseTime(start),
    end: preciseTime(end),
    minute: videoKey ? "Eget klipp" : formatTime(start),
    good: clean(input.good, 1200),
    improve: clean(input.improve, 1200),
    ...(videoKey ? { videoKey } : {}),
  };
  await ref.update({ clips: FieldValue.arrayUnion(clip), updatedAt: FieldValue.serverTimestamp() });
  return Response.json({ ok: true, clip });
}

async function updateMatch(matchId: string, input: MatchInput) {
  const opponent = clean(input.opponent);
  const date = clean(input.date, 10);
  const videoKey = clean(input.videoKey, 500);
  const homeScore = score(input.homeScore);
  const awayScore = score(input.awayScore);
  if (!matchId || !opponent || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !videoKey || homeScore === null || awayScore === null) {
    return Response.json({ error: "Fyll inn motstander, dato, resultat og videofil" }, { status: 400 });
  }
  const files = await listVideos();
  if (!files.some((file) => file.key === videoKey)) return Response.json({ error: "Videofilen finnes ikke i R2" }, { status: 400 });
  const ref = adminDb().collection("matches").doc(matchId);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Kampen finnes ikke" }, { status: 404 });
  await ref.update({
    opponent, date, dateIso: date, videoKey, homeScore, awayScore,
    venue: clean(input.venue), competition: clean(input.competition) || "G14 · Seriekamp",
    isHome: input.isHome !== false, updatedAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ ok: true });
}

async function updateClip(matchId: string, clipId: string, input: ClipInput) {
  const title = clean(input.title);
  const category = clean(input.category, 60) || "Analyse";
  const videoKey = clean(input.videoKey, 500);
  const start = Number(input.start);
  const end = Number(input.end);
  if (!matchId || !clipId || !title || !Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) {
    return Response.json({ error: "Klippet må ha tittel og gyldig start- og sluttid" }, { status: 400 });
  }
  if (!(await validateClipVideo(videoKey))) return Response.json({ error: "Videofilen til klippet finnes ikke i R2" }, { status: 400 });

  const ref = adminDb().collection("matches").doc(matchId);
  let found = false;
  await adminDb().runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error("Kampen finnes ikke");
    const clips = Array.isArray(snap.data()?.clips) ? snap.data()!.clips : [];
    const next = clips.map((clip: { id?: string; videoKey?: string }) => {
      if (clip.id !== clipId) return clip;
      found = true;
      const previousVideoKey = clean(clip.videoKey, 500);
      const nextClip: Record<string, unknown> = {
        ...clip,
        title,
        category,
        start: preciseTime(start),
        end: preciseTime(end),
        minute: videoKey ? "Eget klipp" : formatTime(start),
        good: clean(input.good, 1200),
        improve: clean(input.improve, 1200),
      };
      if (videoKey) nextClip.videoKey = videoKey;
      else delete nextClip.videoKey;
      if (previousVideoKey !== videoKey) nextClip.annotations = [];
      return nextClip;
    });
    if (found) transaction.update(ref, { clips: next, updatedAt: FieldValue.serverTimestamp() });
  });
  if (!found) return Response.json({ error: "Klippet finnes ikke" }, { status: 404 });
  return Response.json({ ok: true });
}

function formatTime(seconds: number) {
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}