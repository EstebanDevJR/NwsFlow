import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    env: {
      JWT_SECRET: 'test-jwt-secret-minimum-32-characters-long!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-min-32chars-different!!',
      BOT_INTERNAL_TOKEN: 'test-bot-internal-token-min-32-chars!!',
      TELEGRAM_WEBHOOK_SECRET: 'test-telegram-webhook-secret-32chars!!',
    },
  },
});
