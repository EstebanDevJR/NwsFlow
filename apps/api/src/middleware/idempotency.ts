import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import redis from '../lib/redis.js';

type IdempotencyState = 'in_progress' | 'completed';

interface IdempotencyEntry {
  state: IdempotencyState;
  requestHash: string;
  statusCode?: number;
  responseBody?: unknown;
  createdAt: number;
}

interface IdempotencyOptions {
  required?: boolean;
  ttlSeconds?: number;
}

const memoryStore = new Map<string, { expiresAt: number; value: IdempotencyEntry }>();
const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST_WORKER_ID !== undefined;

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function payloadHash(req: Request): string {
  const body = req.body ?? {};
  return sha256(JSON.stringify(body));
}

function pruneMemoryStore() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}

async function getEntry(key: string): Promise<IdempotencyEntry | null> {
  if (isTestEnv) {
    pruneMemoryStore();
    const local = memoryStore.get(key);
    if (!local) return null;
    if (local.expiresAt <= Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return local.value;
  }

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as IdempotencyEntry;
  } catch {
    pruneMemoryStore();
    const local = memoryStore.get(key);
    if (!local) return null;
    if (local.expiresAt <= Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return local.value;
  }
}

async function setEntry(key: string, value: IdempotencyEntry, ttlSeconds: number) {
  if (isTestEnv) {
    memoryStore.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return;
  }

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    memoryStore.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}

async function deleteEntry(key: string) {
  if (isTestEnv) {
    memoryStore.delete(key);
    return;
  }

  try {
    await redis.del(key);
  } catch {
    memoryStore.delete(key);
  }
}

export function idempotencyMiddleware(options: IdempotencyOptions = {}) {
  const required = options.required ?? false;
  const ttlSeconds = options.ttlSeconds ?? 24 * 60 * 60;

  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.header('Idempotency-Key');

    if (!idempotencyKey) {
      if (required) {
        return res.status(400).json({ error: 'Idempotency-Key header is required' });
      }
      return next();
    }

    const userId = req.user?.userId || 'anonymous';
    const key = `idem:v1:${userId}:${req.method}:${req.path}:${idempotencyKey}`;
    const requestHash = payloadHash(req);

    const existing = await getEntry(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return res.status(409).json({
          error: 'Idempotency-Key already used with different payload',
        });
      }

      if (existing.state === 'in_progress') {
        return res.status(409).json({
          error: 'Request with this Idempotency-Key is currently in progress',
        });
      }

      if (existing.state === 'completed') {
        res.setHeader('Idempotency-Replayed', 'true');
        return res.status(existing.statusCode || 200).json(existing.responseBody);
      }
    }

    await setEntry(
      key,
      {
        state: 'in_progress',
        requestHash,
        createdAt: Date.now(),
      },
      ttlSeconds
    );

    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      responseBody = body;
      return originalJson(body);
    }) as typeof res.json;

    res.on('finish', () => {
      void (async () => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          await setEntry(
            key,
            {
              state: 'completed',
              requestHash,
              statusCode: res.statusCode,
              responseBody,
              createdAt: Date.now(),
            },
            ttlSeconds
          );
          return;
        }

        await deleteEntry(key);
      })();
    });

    next();
  };
}
