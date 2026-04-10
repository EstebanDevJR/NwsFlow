import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '@paymentflow/shared';

const s3Client = new S3Client({
  endpoint: config.s3Endpoint,
  region: config.s3Region || 'us-east-1',
  credentials: {
    accessKeyId: config.s3AccessKey || '',
    secretAccessKey: config.s3SecretKey || '',
  },
  forcePathStyle: config.s3ForcePathStyle || false,
});

const BUCKET = config.s3Bucket || 'paymentflow';

export function buildS3Uri(key: string, bucket = BUCKET): string {
  return `s3://${bucket}/${key}`;
}

export function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  if (!uri.startsWith('s3://')) return null;
  const raw = uri.slice('s3://'.length);
  const slashIndex = raw.indexOf('/');
  if (slashIndex <= 0 || slashIndex === raw.length - 1) return null;
  return {
    bucket: raw.slice(0, slashIndex),
    key: raw.slice(slashIndex + 1),
  };
}

export async function uploadFile(
  key: string,
  body: Buffer | ReadableStream,
  contentType: string,
  bucket = BUCKET
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);
  return buildS3Uri(key, bucket);
}

export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
  bucket = BUCKET
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn = 3600,
  bucket = BUCKET
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteFile(key: string, bucket = BUCKET): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(command);
}

export function isS3Configured(): boolean {
  return !!(config.s3Endpoint && config.s3AccessKey && config.s3SecretKey);
}
