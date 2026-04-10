export const config = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://paymentflow:password@localhost:5432/paymentflow',
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-key',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL || '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  /** Envío transaccional vía https://resend.com */
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    /** Remitente verificado en Resend, ej. `NwSPayFlow <notificaciones@tudominio.com>` o `onboarding@resend.dev` (solo pruebas) */
    from: process.env.RESEND_FROM || process.env.SMTP_FROM || '',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
};
