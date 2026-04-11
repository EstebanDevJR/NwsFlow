export * from './currency.js';
export * from './paymentMethod.js';
export * from './secrets.js';

import { getJwtSecret, getJwtRefreshSecret, isTestEnv } from './secrets.js';

function defaultDatabaseUrl(): string {
  if (process.env.NODE_ENV === 'production' && !isTestEnv()) {
    const u = process.env.DATABASE_URL?.trim();
    if (!u) {
      throw new Error('DATABASE_URL is required in production.');
    }
    return u;
  }
  return process.env.DATABASE_URL || 'postgresql://paymentflow:password@localhost:5432/paymentflow';
}

export const config = {
  get jwtSecret() {
    return getJwtSecret();
  },
  get jwtRefreshSecret() {
    return getJwtRefreshSecret();
  },
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  port: parseInt(process.env.PORT || '3000'),
  get databaseUrl() {
    return defaultDatabaseUrl();
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL || '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3Region: process.env.S3_REGION || 'us-east-1',
  s3AccessKey: process.env.S3_ACCESS_KEY || '',
  s3SecretKey: process.env.S3_SECRET_KEY || '',
  s3Bucket: process.env.S3_BUCKET || 'paymentflow',
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
};
