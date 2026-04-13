import { describe, it, expect } from 'vitest';
import { normalizeApiPublicOrigin, firstQueryParam } from '../lib/publicOrigin.js';

describe('normalizeApiPublicOrigin', () => {
  it('strips path so /api does not duplicate in file URLs', () => {
    expect(normalizeApiPublicOrigin('https://nwspayflow.lat/api')).toBe('https://nwspayflow.lat');
    expect(normalizeApiPublicOrigin('https://nwspayflow.lat/api/')).toBe('https://nwspayflow.lat');
  });

  it('preserves host port in development', () => {
    expect(normalizeApiPublicOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('returns empty for undefined', () => {
    expect(normalizeApiPublicOrigin(undefined)).toBe('');
  });
});

describe('firstQueryParam', () => {
  it('takes first value when Express gives an array', () => {
    expect(firstQueryParam(['a', 'b'])).toBe('a');
  });

  it('stringifies scalar values', () => {
    expect(firstQueryParam('sig')).toBe('sig');
  });
});
