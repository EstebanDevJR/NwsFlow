export * from './currency.js';
export * from './paymentMethod.js';
export * from './secrets.js';

import { getJwtSecret, getJwtRefreshSecret, isTestEnv } from './secrets.js';

function readNodeEnv(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name];
}

function defaultDatabaseUrl(): string {
  if (readNodeEnv('NODE_ENV') === 'production' && !isTestEnv()) {
    const u = readNodeEnv('DATABASE_URL')?.trim();
    if (!u) {
      throw new Error('DATABASE_URL is required in production.');
    }
    return u;
  }
  return readNodeEnv('DATABASE_URL') || 'postgresql://paymentflow:password@localhost:5432/paymentflow';
}

function tokenTtlFromEnv(name: 'JWT_EXPIRES_IN' | 'JWT_REFRESH_EXPIRES_IN', fallback: string): string {
  const value = readNodeEnv(name)?.trim();
  return value && value.length > 0 ? value : fallback;
}

export const config = {
  get jwtSecret() {
    return getJwtSecret();
  },
  get jwtRefreshSecret() {
    return getJwtRefreshSecret();
  },
  jwtExpiresIn: tokenTtlFromEnv('JWT_EXPIRES_IN', '8h'),
  jwtRefreshExpiresIn: tokenTtlFromEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  port: parseInt(readNodeEnv('PORT') || '3000'),
  get databaseUrl() {
    return defaultDatabaseUrl();
  },
  frontendUrl: readNodeEnv('FRONTEND_URL') || 'http://localhost:3000',
  telegramBotToken: readNodeEnv('TELEGRAM_BOT_TOKEN') || '',
  telegramWebhookUrl: readNodeEnv('TELEGRAM_WEBHOOK_URL') || '',
  telegramWebhookSecret: readNodeEnv('TELEGRAM_WEBHOOK_SECRET') || '',
  uploadDir: readNodeEnv('UPLOAD_DIR') || 'uploads',
  s3Endpoint: readNodeEnv('S3_ENDPOINT') || '',
  s3Region: readNodeEnv('S3_REGION') || 'us-east-1',
  s3AccessKey: readNodeEnv('S3_ACCESS_KEY') || '',
  s3SecretKey: readNodeEnv('S3_SECRET_KEY') || '',
  s3Bucket: readNodeEnv('S3_BUCKET') || 'paymentflow',
  s3ForcePathStyle: readNodeEnv('S3_FORCE_PATH_STYLE') === 'true',
};
