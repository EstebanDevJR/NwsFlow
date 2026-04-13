import path from 'path';
import { Request } from 'express';
import { getSignedDownloadUrl, isS3Configured, parseS3Uri } from './s3.js';
import { buildLocalSignedDownloadUrl } from './localUploadSignature.js';
import { normalizeApiPublicOrigin } from './publicOrigin.js';

/** Resolve stored paths to a fetchable URL for server-side consumers (e.g. Telegram). Uses signed URLs for local disk. */
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

  const base = normalizeApiPublicOrigin(process.env.API_PUBLIC_URL) || 'http://localhost:3000';
  if (storedPath.startsWith('/uploads/') || storedPath.startsWith('uploads/')) {
    return buildLocalSignedDownloadUrl(storedPath, base, expiresIn);
  }
  return buildLocalSignedDownloadUrl(`/uploads/${path.basename(storedPath)}`, base, expiresIn);
}

export function getPublicBaseUrl(req: Request): string {
  const fromEnv = normalizeApiPublicOrigin(process.env.API_PUBLIC_URL);
  if (fromEnv) {
    return fromEnv;
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
  if (storedPath.startsWith('/uploads/') || storedPath.startsWith('uploads/')) {
    return buildLocalSignedDownloadUrl(storedPath, base, expiresIn);
  }
  return buildLocalSignedDownloadUrl(`/uploads/${path.basename(storedPath)}`, base, expiresIn);
}
