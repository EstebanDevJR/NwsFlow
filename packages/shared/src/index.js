export * from './currency';
export * from './paymentMethod';
export const config = {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-key',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
    jwtExpiresIn: '15m',
    jwtRefreshExpiresIn: '7d',
    port: parseInt(process.env.PORT || '3000'),
    databaseUrl: process.env.DATABASE_URL || 'postgresql://paymentflow:password@localhost:5432/paymentflow',
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
//# sourceMappingURL=index.js.map