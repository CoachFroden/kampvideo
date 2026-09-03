import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error("R2 er ikke konfigurert");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function bucketName() {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2 bucket er ikke konfigurert");
  return bucket;
}

export function videoCommand(key: string, range?: string | null) {
  if (!key || key.includes("..") || key.startsWith("/")) throw new Error("Ugyldig videonøkkel");
  return new GetObjectCommand({
    Bucket: bucketName(),
    Key: key,
    Range: range || undefined,
  });
}

export async function signedVideoUrl(key: string) {
  if (!key || key.includes("..") || key.startsWith("/")) throw new Error("Ugyldig videonøkkel");
  return getSignedUrl(r2Client(), new GetObjectCommand({
    Bucket: bucketName(),
    Key: key,
    ResponseContentDisposition: "inline",
  }), { expiresIn: 60 * 60 * 2 });
}

export async function listVideos() {
  const result = await r2Client().send(new ListObjectsV2Command({ Bucket: bucketName() }));
  return (result.Contents ?? [])
    .filter((item) => item.Key && /\.(mp4|mov|m4v|webm)$/i.test(item.Key))
    .map((item) => ({ key: item.Key!, size: item.Size ?? 0, modified: item.LastModified?.toISOString() ?? null }))
    .sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""));
}

export function sanitizeVideoKey(fileName: string, date?: string, opponent?: string) {
  const ext = (fileName.match(/\.(mp4|mov|m4v|webm)$/i)?.[0] ?? ".mp4").toLowerCase();
  const base = `${date || "kamp"}-${opponent || fileName.replace(/\.[^.]+$/, "")}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || `kamp-${Date.now()}`;
  return `kamper/${base}${ext}`;
}

export async function ensureUploadCors(origin: string) {
  if (!origin || !/^https?:\/\//i.test(origin)) return;
  const client = r2Client();
  const bucket = bucketName();
  let rules: NonNullable<Awaited<ReturnType<typeof client.send>>["CORSRules"]> = [];
  try {
    const existing = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    rules = existing.CORSRules ?? [];
  } catch {
    rules = [];
  }

  const uploadRule = rules.find((rule) => (rule.ID ?? "") === "kampvideo-browser-upload");
  if (uploadRule) {
    const origins = new Set(uploadRule.AllowedOrigins ?? []);
    origins.add(origin);
    uploadRule.AllowedOrigins = [...origins];
    uploadRule.AllowedMethods = Array.from(new Set([...(uploadRule.AllowedMethods ?? []), "PUT"]));
    uploadRule.AllowedHeaders = ["*"];
    uploadRule.ExposeHeaders = Array.from(new Set([...(uploadRule.ExposeHeaders ?? []), "ETag"]));
    uploadRule.MaxAgeSeconds = 3600;
  } else {
    rules.push({
      ID: "kampvideo-browser-upload",
      AllowedOrigins: [origin],
      AllowedMethods: ["PUT"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    });
  }

  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }));
}

export async function createMultipartVideoUpload(key: string, contentType: string) {
  const result = await r2Client().send(new CreateMultipartUploadCommand({
    Bucket: bucketName(),
    Key: key,
    ContentType: contentType || "video/mp4",
  }));
  if (!result.UploadId) throw new Error("Kunne ikke starte R2-opplasting");
  return result.UploadId;
}

export async function signedUploadPartUrl(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(r2Client(), new UploadPartCommand({
    Bucket: bucketName(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  }), { expiresIn: 60 * 60 * 2 });
}

export async function completeMultipartVideoUpload(key: string, uploadId: string, parts: CompletedPart[]) {
  await r2Client().send(new CompleteMultipartUploadCommand({
    Bucket: bucketName(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
}

export async function abortMultipartVideoUpload(key: string, uploadId: string) {
  await r2Client().send(new AbortMultipartUploadCommand({
    Bucket: bucketName(),
    Key: key,
    UploadId: uploadId,
  }));
}
