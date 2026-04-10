import path from 'path';
import { Request } from 'express';
import { getSignedDownloadUrl, isS3Configured, parseS3Uri } from './s3.js';

/** Resolve stored paths to a fetchable URL for server-side consumers (e.g. Telegram). Uses API_PUBLIC_URL for local uploads. */
export async function resolveStoredFileUrlForBot(
  storedPath: string | null | undefined,
  expiresIn = 2 * 60 * 60
): Promise<string | null> {
  if (!storedPath) return null;

  if (storedPath.startsWith('http://') || storedPath.startsWith('https://')) {
    return storedPath;
  }

  const parsed = parseS3Uri(storedPath);
  if (parsed) {
    if (!isS3Configured()) return null;
    return getSignedDownloadUrl(parsed.key, expiresIn, parsed.bucket);
  }

  const base = process.env.API_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  if (storedPath.startsWith('/uploads/')) return `${base}${storedPath}`;
  if (storedPath.startsWith('uploads/')) return `${base}/${storedPath}`;
  return `${base}/uploads/${path.basename(storedPath)}`;
}

export function getPublicBaseUrl(req: Request): string {
  const fromEnv = process.env.API_PUBLIC_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

export async function resolveStoredFileUrl(
  storedPath: string | null | undefined,
  req: Request,
  expiresIn = 2 * 60 * 60
): Promise<string | null> {
  if (!storedPath) return null;

  if (storedPath.startsWith('http://') || storedPath.startsWith('https://')) {
    return storedPath;
  }

  const parsed = parseS3Uri(storedPath);
  if (parsed) {
    if (!isS3Configured()) return null;
    return getSignedDownloadUrl(parsed.key, expiresIn, parsed.bucket);
  }

  const base = getPublicBaseUrl(req);
  if (storedPath.startsWith('/uploads/')) return `${base}${storedPath}`;
  if (storedPath.startsWith('uploads/')) return `${base}/${storedPath}`;
  return `${base}/uploads/${path.basename(storedPath)}`;
}
