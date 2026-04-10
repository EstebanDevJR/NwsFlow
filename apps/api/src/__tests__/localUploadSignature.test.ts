import { describe, it, expect, beforeEach } from 'vitest';
import { resetJwtCachesForTests } from '@paymentflow/shared';
import { signLocalUploadUrl, verifyLocalUploadUrl } from '../lib/localUploadSignature.js';

describe('Local upload signed URLs', () => {
  beforeEach(() => {
    resetJwtCachesForTests();
    process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long!!';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32chars-different!!';
  });

  it('accepts a valid signature before expiry', () => {
    const exp = Math.floor(Date.now() / 1000) + 120;
    const sig = signLocalUploadUrl('evidence-abc.pdf', exp);
    expect(verifyLocalUploadUrl('evidence-abc.pdf', exp, sig)).toBe(true);
  });

  it('rejects wrong filename or tampered signature', () => {
    const exp = Math.floor(Date.now() / 1000) + 120;
    const sig = signLocalUploadUrl('a.pdf', exp);
    expect(verifyLocalUploadUrl('b.pdf', exp, sig)).toBe(false);
    expect(verifyLocalUploadUrl('a.pdf', exp, `${sig}00`)).toBe(false);
  });
});
