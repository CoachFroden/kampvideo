import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function client() {
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

export async function signedVideoUrl(key: string) {
  if (!key || key.includes("..") || key.startsWith("/")) throw new Error("Ugyldig videonøkkel");
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: "inline",
  }), { expiresIn: 300 });
}
