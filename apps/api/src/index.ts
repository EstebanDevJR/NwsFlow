import 'dotenv/config';
import { validateApiEnv } from './config/validateEnv.js';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import prisma from '@paymentflow/database';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import paymentRoutes from './routes/payments.js';
import meetingRoutes from './routes/meetings.js';
import reportRoutes from './routes/reports.js';
import uploadRoutes from './routes/upload.js';
import notificationRoutes from './routes/notifications.js';
import budgetRoutes from './routes/budgets.js';
import approvalRulesRoutes from './routes/approvalRules.js';
import sseRoutes from './routes/sse.js';
import slaRulesRoutes from './routes/slaRules.js';
import { authMiddleware } from './middleware/auth.js';
import { compositeRateLimiter } from './middleware/rateLimiter.js';
import { processMeetingReminders } from './services/meetingReminders.js';
import { processBudgetAlerts } from './services/budgetAlerts.js';
import { processSlaRules } from './services/slaProcessor.js';
import { auditMiddleware } from './middleware/audit.js';
import telegramRoutes from './routes/telegram.js';
import chatRoutes from './routes/chat.js';
import filesRoutes from './routes/files.js';
import { logger, requestLogger } from './lib/logger.js';
import { initWorkers, closeWorkers } from './services/workers.js';

validateApiEnv();

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

function corsOrigins(): string | string[] {
  const raw = process.env.CORS_ORIGINS || process.env.FRONTEND_URLS;
  if (raw?.trim()) {
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return process.env.FRONTEND_URL || 'http://localhost:3000';
    return list.length === 1 ? list[0] : list;
  }
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

app.use(
  cors({
    origin: corsOrigins(),
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(compositeRateLimiter);

/** Local files: time-limited HMAC URLs only (no public static /uploads). */
app.use('/api/files', filesRoutes);

app.get('/api/health', async (_req, res) => {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ status: 'error', db: 'not_configured', uptime: process.uptime() });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', uptime: process.uptime() });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/telegram', telegramRoutes);
app.get('/api/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'NWSPayFlow API',
      version: '1.1.0',
      description: 'API para solicitudes, aprobaciones, pagos, reuniones y notificaciones de NWSPayFlow.',
    },
    servers: [{ url: '/api' }],
    paths: {
      '/auth/login': {
        post: {
          summary: 'Iniciar sesión',
          tags: ['Auth'],
        },
      },
      '/auth/register': {
        post: {
          summary: 'Registro público (condicional)',
          tags: ['Auth'],
        },
      },
      '/auth/me': {
        get: { summary: 'Perfil actual', tags: ['Auth'] },
        patch: { summary: 'Actualizar perfil', tags: ['Auth'] },
      },
      '/auth/change-password': {
        post: { summary: 'Cambiar contraseña', tags: ['Auth'] },
      },
      '/payments': {
        get: { summary: 'Listar solicitudes de pago', tags: ['Payments'] },
        post: { summary: 'Crear solicitud de pago', tags: ['Payments'] },
      },
      '/payments/{id}': {
        get: { summary: 'Detalle de solicitud', tags: ['Payments'] },
        put: { summary: 'Actualizar estado de solicitud', tags: ['Payments'] },
      },
      '/payments/stats': {
        get: { summary: 'Estadísticas de pagos', tags: ['Payments'] },
      },
      '/users': {
        get: { summary: 'Listar usuarios', tags: ['Users'] },
        post: { summary: 'Crear usuario', tags: ['Users'] },
      },
      '/users/{id}': {
        get: { summary: 'Obtener usuario', tags: ['Users'] },
        put: { summary: 'Actualizar usuario', tags: ['Users'] },
        delete: { summary: 'Desactivar usuario', tags: ['Users'] },
      },
      '/users/{id}/permanent': {
        delete: { summary: 'Eliminar usuario del sistema (irreversible)', tags: ['Users'] },
      },
      '/meetings': {
        get: { summary: 'Listar reuniones', tags: ['Meetings'] },
        post: { summary: 'Crear reunión', tags: ['Meetings'] },
      },
      '/reports': {
        get: { summary: 'Reportes paginados', tags: ['Reports'] },
      },
      '/notifications': {
        get: { summary: 'Listar notificaciones', tags: ['Notifications'] },
      },
      '/upload/avatar': {
        post: { summary: 'Subir avatar', tags: ['Upload'] },
      },
      '/upload/payment-proof/{paymentId}': {
        post: { summary: 'Subir comprobante de pago', tags: ['Upload'] },
      },
      '/health': {
        get: { summary: 'Healthcheck', tags: ['Infra'] },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  });
});
app.get('/api/docs', (_req, res) => {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>NWSPayFlow API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body style="margin:0;background:#0b1020;">
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        displayRequestDuration: true,
        persistAuthorization: true
      });
    </script>
  </body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
app.use(auditMiddleware);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/payments', authMiddleware, paymentRoutes);
app.use('/api/meetings', authMiddleware, meetingRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/budgets', authMiddleware, budgetRoutes);
app.use('/api/approval-rules', authMiddleware, approvalRulesRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sla-rules', authMiddleware, slaRulesRoutes);
app.use(errorHandler);

let reminderInterval: NodeJS.Timeout | null = null;
let budgetAlertInterval: NodeJS.Timeout | null = null;
let slaInterval: NodeJS.Timeout | null = null;
const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST_WORKER_ID !== undefined;

async function startWorkers() {
  try {
    await initWorkers();
    console.log('Queue workers initialized');
  } catch (err) {
    console.error('Failed to initialize workers:', err);
  }
}

if (!isTestEnv) {
  startWorkers();

  reminderInterval = setInterval(() => {
    processMeetingReminders().catch((err) => logger.error({ err }, 'meeting_reminders_tick'));
  }, 60_000);
  setTimeout(() => {
    processMeetingReminders().catch((err) => logger.error({ err }, 'meeting_reminders_tick'));
  }, 15_000);

  budgetAlertInterval = setInterval(() => {
    processBudgetAlerts().catch((err) => logger.error({ err }, 'budget_alerts_tick'));
  }, 60 * 60 * 1000);
  setTimeout(() => {
    processBudgetAlerts().catch((err) => logger.error({ err }, 'budget_alerts_tick'));
  }, 30_000);

  slaInterval = setInterval(() => {
    processSlaRules().catch((err) => logger.error({ err }, 'sla_rules_tick'));
  }, 15 * 60 * 1000);

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'server_started');
  });

  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    if (reminderInterval) clearInterval(reminderInterval);
    if (budgetAlertInterval) clearInterval(budgetAlertInterval);
    if (slaInterval) clearInterval(slaInterval);
    await closeWorkers();
    await prisma.$disconnect();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export { app };
export default app;
