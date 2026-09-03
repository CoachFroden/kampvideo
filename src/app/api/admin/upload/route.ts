import { NextRequest } from "next/server";
import { authError, requireAdmin } from "@/lib/server-auth";
import {
  abortMultipartVideoUpload,
  completeMultipartVideoUpload,
  createMultipartVideoUpload,
  ensureUploadCors,
  sanitizeVideoKey,
  signedUploadPartUrl,
} from "@/lib/r2";

const PART_SIZE = 64 * 1024 * 1024;
const MAX_PARTS = 10_000;

function validKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith("kamper/") && !key.includes("..") && !key.startsWith("/");
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "init") {
      const fileName = String(body.fileName ?? "");
      const contentType = String(body.contentType ?? "video/mp4");
      const size = Number(body.size ?? 0);
      if (!fileName || !/\.(mp4|mov|m4v|webm)$/i.test(fileName)) {
        return Response.json({ error: "Velg en gyldig videofil" }, { status: 400 });
      }
      if (!Number.isFinite(size) || size <= 0) {
        return Response.json({ error: "Ugyldig filstørrelse" }, { status: 400 });
      }
      const partCount = Math.ceil(size / PART_SIZE);
      if (partCount > MAX_PARTS) {
        return Response.json({ error: "Videofilen er for stor" }, { status: 400 });
      }

      const origin = request.headers.get("origin") || new URL(request.url).origin;
      await ensureUploadCors(origin);
      const key = sanitizeVideoKey(fileName, String(body.date ?? ""), String(body.opponent ?? ""));
      const uploadId = await createMultipartVideoUpload(key, contentType);
      const urls = await Promise.all(
        Array.from({ length: partCount }, (_, index) => signedUploadPartUrl(key, uploadId, index + 1)),
      );
      return Response.json({ key, uploadId, partSize: PART_SIZE, urls });
    }

    if (action === "complete") {
      const key = body.key;
      const uploadId = String(body.uploadId ?? "");
      const parts = Array.isArray(body.parts) ? body.parts : [];
      if (!validKey(key) || !uploadId || !parts.length) {
        return Response.json({ error: "Ufullstendig opplastingsdata" }, { status: 400 });
      }
      const normalized = parts
        .map((part: { partNumber?: number; etag?: string }) => ({
          PartNumber: Number(part.partNumber),
          ETag: String(part.etag ?? ""),
        }))
        .filter((part: { PartNumber: number; ETag: string }) => Number.isInteger(part.PartNumber) && part.PartNumber > 0 && part.ETag);
      if (normalized.length !== parts.length) {
        return Response.json({ error: "En eller flere videodeler mangler" }, { status: 400 });
      }
      await completeMultipartVideoUpload(key, uploadId, normalized);
      return Response.json({ ok: true, key });
    }

    if (action === "abort") {
      const key = body.key;
      const uploadId = String(body.uploadId ?? "");
      if (validKey(key) && uploadId) await abortMultipartVideoUpload(key, uploadId);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Ukjent opplastingshandling" }, { status: 400 });
  } catch (error) {
    return authError(error);
  }
}
