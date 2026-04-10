import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getJwtSecret, getJwtRefreshSecret, resetJwtCachesForTests } from '@paymentflow/shared';

describe('JWT secret validation (shared)', () => {
  beforeEach(() => {
    resetJwtCachesForTests();
    process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long!!';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32chars-different!!';
  });

  afterEach(() => {
    resetJwtCachesForTests();
    process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long!!';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32chars-different!!';
  });

  it('rejects secrets shorter than 32 characters', () => {
    resetJwtCachesForTests();
    process.env.JWT_SECRET = 'too-short';
    expect(() => getJwtSecret()).toThrow(/at least 32/);
  });

  it('rejects known weak placeholder values', () => {
    resetJwtCachesForTests();
    process.env.JWT_SECRET = 'your-super-secret-key-change-in-production';
    expect(() => getJwtSecret()).toThrow(/weak placeholder/);
  });

  it('requires JWT_REFRESH_SECRET to differ from JWT_SECRET', () => {
    resetJwtCachesForTests();
    const s = 'test-jwt-secret-minimum-32-characters-long!!';
    process.env.JWT_SECRET = s;
    process.env.JWT_REFRESH_SECRET = s;
    getJwtSecret();
    expect(() => getJwtRefreshSecret()).toThrow(/must differ/);
  });
});
