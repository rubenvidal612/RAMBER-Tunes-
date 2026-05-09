import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  throw new Error('Missing required R2 environment variables');
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType: string = 'audio/webm'
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await r2Client.send(command);

  return `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;
}

export async function getSignedR2Url(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(r2Client, command, { expiresIn });
}

export async function uploadWebmToR2(
  key: string,
  webmBlob: Blob
): Promise<string> {
  return uploadToR2(key, webmBlob, 'audio/webm');
}

export function generateR2Key(prefix: string, userId: string, filename: string): string {
  const timestamp = Date.now();
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${prefix}/${userId}/${timestamp}_${safeFilename}`;
}

export async function deleteFromR2(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  
  const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  
  // Dividir en lotes de 1000 (límite de S3)
  const batches = [];
  for (let i = 0; i < paths.length; i += 1000) {
    batches.push(paths.slice(i, i + 1000));
  }

  let deletedCount = 0;
  for (const batch of batches) {
    const objects = batch.map(path => ({ Key: path }));
    const command = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: { Objects: objects },
    });

    try {
      await r2Client.send(command);
      deletedCount += batch.length;
    } catch (error) {
      console.error('Error deleting files from R2:', error);
    }
  }

  return deletedCount;
}