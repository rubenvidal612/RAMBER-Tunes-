import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  publicBaseUrl: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

function getR2Config(): R2Config {
  if (cachedConfig) return cachedConfig;
  const accountId = (process.env.R2_ACCOUNT_ID || '').toString().trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').toString().trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').toString().trim();
  const bucketName = (process.env.R2_BUCKET_NAME || '').toString().trim();
  const endpoint = ((process.env.R2_ENDPOINT || '') as string).toString().trim() || `https://${accountId}.r2.cloudflarestorage.com`;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Missing required R2 environment variables');
  }
  cachedConfig = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    publicBaseUrl: `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`,
  };
  return cachedConfig;
}

function getR2Client(): { client: S3Client; config: R2Config } {
  const config = getR2Config();
  if (cachedClient) return { client: cachedClient, config };
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return { client: cachedClient, config };
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType: string = 'audio/webm'
): Promise<string> {
  const { client, config } = getR2Client();
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);

  return `${config.publicBaseUrl}/${key}`;
}

export async function getSignedR2Url(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const { client, config } = getR2Client();
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  return await getSignedUrl(client, command, { expiresIn });
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
  const { client, config } = getR2Client();
  
  // Dividir en lotes de 1000 (límite de S3)
  const batches = [];
  for (let i = 0; i < paths.length; i += 1000) {
    batches.push(paths.slice(i, i + 1000));
  }

  let deletedCount = 0;
  for (const batch of batches) {
    const objects = batch.map(path => ({ Key: path }));
    const command = new DeleteObjectsCommand({
      Bucket: config.bucketName,
      Delete: { Objects: objects },
    });

    try {
      await client.send(command);
      deletedCount += batch.length;
    } catch (error) {
      console.error('Error deleting files from R2:', error);
    }
  }

  return deletedCount;
}
