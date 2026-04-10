import { createHmac, timingSafeEqual } from 'crypto';
import path from 'path';
import { getJwtSecret } from '@paymentflow/shared';

const SIG_PREFIX = 'v1';

function signingKey(): string {
  const explicit = process.env.UPLOAD_SIGNING_SECRET?.trim();
  if (explicit && explicit.length >= 32) return explicit;
  return getJwtSecret();
}

function hmacPayload(basename: string, exp: number): string {
  return `${SIG_PREFIX}:${exp}:${basename}`;
}

export function signLocalUploadUrl(basename: string, expUnix: number): string {
  const key = signingKey();
  const payload = hmacPayload(basename, expUnix);
  return createHmac('sha256', key).update(payload).digest('hex');
}

export function verifyLocalUploadUrl(basename: string, expUnix: number, sigHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(sigHex)) return false;
  if (Math.floor(Date.now() / 1000) > expUnix) return false;
  const expected = signLocalUploadUrl(basename, expUnix);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sigHex, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Builds a time-limited signed URL for local disk files stored as `/uploads/<filename>`. */
export function buildLocalSignedDownloadUrl(
  storedPath: string,
  baseUrlNoTrailingSlash: string,
  expiresInSec: number
): string {
  const basename = path.basename(storedPath);
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const sig = signLocalUploadUrl(basename, exp);
  const q = new URLSearchParams({
    f: basename,
    exp: String(exp),
    sig,
  });
  return `${baseUrlNoTrailingSlash}/api/files/local?${q.toString()}`;
}
