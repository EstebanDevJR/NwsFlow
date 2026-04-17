const MIN_JWT_LEN = 32;

/** Known insecure placeholders — must never be used as real secrets. */
const FORBIDDEN_JWT_VALUES = new Set([
  'your-super-secret-key',
  'your-super-secret-refresh-key',
  'your-super-secret-key-change-in-production',
  'change_me_in_production',
  'dev-secret',
  'dev-refresh-secret',
]);

let _jwtSecret: string | null = null;
let _jwtRefreshSecret: string | null = null;

function readNodeEnv(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name];
}

export function isTestEnv(): boolean {
  return (
    readNodeEnv('NODE_ENV') === 'test' ||
    readNodeEnv('VITEST') === 'true' ||
    readNodeEnv('VITEST_WORKER_ID') !== undefined
  );
}

function readRequiredSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const v = readNodeEnv(name)?.trim();
  if (!v || v.length < MIN_JWT_LEN) {
    throw new Error(
      `${name} must be set and at least ${MIN_JWT_LEN} characters. Generate a strong random value (e.g. openssl rand -base64 48).`
    );
  }
  if (FORBIDDEN_JWT_VALUES.has(v)) {
    throw new Error(`${name} must not use a known weak placeholder value.`);
  }
  return v;
}

/** Clears cached JWT secrets (for tests only). */
export function resetJwtCachesForTests(): void {
  _jwtSecret = null;
  _jwtRefreshSecret = null;
}

export function getJwtSecret(): string {
  if (_jwtSecret !== null) return _jwtSecret;
  _jwtSecret = readRequiredSecret('JWT_SECRET');
  return _jwtSecret;
}

export function getJwtRefreshSecret(): string {
  if (_jwtRefreshSecret !== null) return _jwtRefreshSecret;
  const refresh = readRequiredSecret('JWT_REFRESH_SECRET');
  if (refresh === getJwtSecret()) {
    throw new Error('JWT_REFRESH_SECRET must differ from JWT_SECRET.');
  }
  _jwtRefreshSecret = refresh;
  return _jwtRefreshSecret;
}
