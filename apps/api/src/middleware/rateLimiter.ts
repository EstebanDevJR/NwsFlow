import { Request, Response, NextFunction } from 'express';
import redis from '../lib/redis.js';

const WINDOW_MS = 15 * 60 * 1000;
/** SPA + React Query refetches add up quickly in dev; production stays stricter unless overridden. */
const MAX_REQUESTS =
  parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '', 10) ||
  (process.env.NODE_ENV === 'development' ? 400 : 100);
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_REQUESTS = 20;
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const UPLOAD_MAX_REQUESTS = 60;
const STRICT_WINDOW_MS = 10 * 60 * 1000;
const STRICT_MAX_REQUESTS = 30;

async function checkRateLimit(
  key: string,
  windowMs: number,
  max: number
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  if (process.env.VITEST) {
    return { allowed: true, remaining: max };
  }

  const now = Date.now();
  const windowSec = Math.ceil(windowMs / 1000);

  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, windowSec);
  }

  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, max - current);

  if (current > max) {
    return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSec };
  }

  return { allowed: true, remaining };
}

function createKeyedLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}) {
  const { windowMs, max, keyPrefix } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ratelimit:${keyPrefix}:${ip}`;

    const result = await checkRateLimit(key, windowMs, max);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    next();
  };
}

export const rateLimiter = createKeyedLimiter({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  keyPrefix: 'global',
});

export const authRateLimiter = createKeyedLimiter({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX_REQUESTS,
  keyPrefix: 'auth',
});

export const uploadRateLimiter = createKeyedLimiter({
  windowMs: UPLOAD_WINDOW_MS,
  max: UPLOAD_MAX_REQUESTS,
  keyPrefix: 'upload',
});

export const strictMutationLimiter = createKeyedLimiter({
  windowMs: STRICT_WINDOW_MS,
  max: STRICT_MAX_REQUESTS,
  keyPrefix: 'strict',
});

function pathOnly(req: Request): string {
  const o = req.originalUrl?.split('?')[0];
  if (o) return o;
  return req.path || req.url?.split('?')[0] || '';
}

export const compositeRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.VITEST) {
    return next();
  }

  const p = pathOnly(req);
  /** Healthchecks and similar probes should not consume the global budget. */
  if (p === '/api/health' || p.endsWith('/api/health')) {
    return next();
  }
  const isAuth =
    p.includes('/api/auth/login') ||
    p.includes('/api/auth/register') ||
    p.includes('/api/auth/refresh');
  if (isAuth) {
    return authRateLimiter(req, res, next);
  }

  if (p.includes('/api/upload')) {
    return uploadRateLimiter(req, res, next);
  }

  const isStrict =
    (p.includes('/api/users') && req.method !== 'GET') ||
    (p.includes('/api/payments') && req.method !== 'GET') ||
    p.includes('/api/auth/change-password');
  if (isStrict) {
    return strictMutationLimiter(req, res, next);
  }

  return rateLimiter(req, res, next);
};