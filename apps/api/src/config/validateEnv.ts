import { getJwtSecret, getJwtRefreshSecret, isTestEnv } from '@paymentflow/shared';

const MIN_BOT_TOKEN = 16;
const MIN_WEBHOOK_SECRET = 16;

/**
 * Validates required secrets at API startup (fail-fast). Skips strict checks in automated tests.
 */
export function validateApiEnv(): void {
  if (isTestEnv()) {
    return;
  }

  getJwtSecret();
  getJwtRefreshSecret();

  const bot = process.env.BOT_INTERNAL_TOKEN?.trim();
  if (!bot || bot.length < MIN_BOT_TOKEN) {
    throw new Error(
      `BOT_INTERNAL_TOKEN must be set and at least ${MIN_BOT_TOKEN} characters so internal Telegram bot routes cannot be accessed without authentication.`
    );
  }

  if (process.env.NODE_ENV === 'production') {
    const wh = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!wh || wh.length < MIN_WEBHOOK_SECRET) {
      throw new Error(
        `TELEGRAM_WEBHOOK_SECRET must be set in production (min ${MIN_WEBHOOK_SECRET} chars) so the Telegram webhook cannot be spoofed.`
      );
    }

    const db = process.env.DATABASE_URL?.trim();
    if (!db) {
      throw new Error('DATABASE_URL is required in production.');
    }
    if (
      db.includes('postgresql://paymentflow:password@localhost:5432/paymentflow') ||
      db.includes('paymentflow:password@localhost')
    ) {
      throw new Error(
        'DATABASE_URL must not use default development credentials when NODE_ENV=production.'
      );
    }
  }
}
