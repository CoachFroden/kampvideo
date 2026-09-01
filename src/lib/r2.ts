import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

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

export function videoCommand(key: string, range?: string | null) {
  if (!key || key.includes("..") || key.startsWith("/")) throw new Error("Ugyldig videonøkkel");
  return new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Range: range || undefined,
  });
}

export async function listVideos() {
  const result = await r2Client().send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME }));
  return (result.Contents ?? [])
    .filter((item) => item.Key && /\.(mp4|mov|m4v|webm)$/i.test(item.Key))
    .map((item) => ({ key: item.Key!, size: item.Size ?? 0, modified: item.LastModified?.toISOString() ?? null }))
    .sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""));
}
