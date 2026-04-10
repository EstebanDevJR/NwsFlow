import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST_WORKER_ID !== undefined;

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  if (!isTestEnv) {
    console.error('Redis connection error:', err);
  }
});

redis.on('connect', () => {
  if (!isTestEnv) {
    console.log('Connected to Redis');
  }
});

export default redis;
