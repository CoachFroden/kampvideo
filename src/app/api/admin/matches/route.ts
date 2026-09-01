import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { authError, requireAdmin } from "@/lib/server-auth";

type NewMatch = {
  opponent?: unknown;
  dateIso?: unknown;
  venue?: unknown;
  competition?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  isHome?: unknown;
  videoKey?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function score(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 99 ? parsed : null;
}

function displayDate(dateIso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return "";
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !year || !month || !day || Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day
  ) return "";
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as NewMatch;
    const opponent = text(body.opponent, 120);
    const dateIso = text(body.dateIso, 10);
    const date = displayDate(dateIso);
    const videoKey = text(body.videoKey, 500).replace(/^\/+/, "");

    if (!opponent || !date || !videoKey || videoKey.includes("..")) {
      return Response.json({ error: "Fyll inn motstander, dato og en gyldig R2-nøkkel." }, { status: 400 });
    }

    const ref = adminDb().collection("matches").doc();
    await ref.set({
      opponent,
      date,
      dateIso,
      venue: text(body.venue, 160),
      competition: text(body.competition, 120) || "Seriekamp",
      homeScore: score(body.homeScore),
      awayScore: score(body.awayScore),
      isHome: body.isHome !== false,
      videoKey,
      clips: [],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return authError(error);
  }
}
