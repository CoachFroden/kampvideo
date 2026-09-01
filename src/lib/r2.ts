import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
