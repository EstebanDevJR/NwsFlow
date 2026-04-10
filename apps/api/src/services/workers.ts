import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { sendEmail } from './email.js';
import { sendTelegramNotification } from './telegram.js';
import prisma from '@paymentflow/database';
import { addEmailJob, EmailJobData, TelegramJobData, NotificationJobData } from './queue.js';
import { sendSSE } from '../routes/sse.js';
import { config } from '../config/index.js';
import { buildEmailHtml } from '../lib/emailLayout.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let connection: Redis | null = null;
let emailWorker: Worker<EmailJobData> | null = null;
let telegramWorker: Worker<TelegramJobData> | null = null;
let inAppNotificationWorker: Worker<NotificationJobData> | null = null;

function getWorkerConnection() {
  if (connection) return connection;
  connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  return connection;
}

function bindWorkerEvents<T>(name: string, worker: Worker<T>) {
  worker.on('completed', (job) => {
    console.log(`${name} job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`${name} job ${job?.id} failed:`, err.message);
  });
}

export async function initWorkers() {
  if (emailWorker && telegramWorker && inAppNotificationWorker) return;

  const workerConnection = getWorkerConnection();
  await workerConnection.connect();

  emailWorker = new Worker<EmailJobData>(
    'email',
    async (job: Job<EmailJobData>) => {
      console.log(`Processing email job ${job.id}`);
      const ok = await sendEmail(job.data);
      if (!ok) {
        throw new Error('sendEmail returned false (Resend no envió el correo)');
      }
    },
    { connection: workerConnection, concurrency: 5 }
  );
  bindWorkerEvents('Email', emailWorker);

  telegramWorker = new Worker<TelegramJobData>(
    'telegram',
    async (job: Job<TelegramJobData>) => {
      console.log(`Processing telegram job ${job.id}`);
      await sendTelegramNotification(job.data.chatId, job.data.message, job.data.replyMarkup);
    },
    { connection: workerConnection, concurrency: 10 }
  );
  bindWorkerEvents('Telegram', telegramWorker);

  inAppNotificationWorker = new Worker<NotificationJobData>(
    'in-app-notifications',
    async (job: Job<NotificationJobData>) => {
      console.log(`Processing in-app notification job ${job.id}`);
      const notification = await prisma.notification.create({
        data: {
          type: job.data.type,
          title: job.data.title,
          message: job.data.message,
          userId: job.data.userId,
          ...(job.data.link != null && job.data.link !== '' ? { link: job.data.link } : {}),
        },
      });
      sendSSE(job.data.userId, 'notification', notification);

      const user = await prisma.user.findUnique({
        where: { id: job.data.userId },
        select: { email: true, emailNotifications: true },
      });
      if (user?.emailNotifications && user.email?.trim()) {
        const base = (config.frontendUrl || '').replace(/\/$/, '');
        const rel = job.data.link?.trim();
        const text =
          rel && base
            ? `${job.data.message}\n\nAbrir en la app: ${base}${rel.startsWith('/') ? rel : `/${rel}`}`
            : job.data.message;
        const actionUrl =
          rel && base ? `${base}${rel.startsWith('/') ? rel : `/${rel}`}` : undefined;
        const html = buildEmailHtml({
          heading: job.data.title,
          bodyText: job.data.message,
          preheader: job.data.message,
          ...(actionUrl
            ? { cta: { url: actionUrl, label: 'Abrir en NWSPayFlow' } }
            : {}),
        });
        await addEmailJob({
          to: user.email.trim(),
          subject: job.data.title,
          text,
          html,
        });
      }
    },
    { connection: workerConnection, concurrency: 10 }
  );
  bindWorkerEvents('In-app notification', inAppNotificationWorker);

  console.log('Workers initialized');
}

export async function closeWorkers() {
  const closes: Array<Promise<void>> = [];
  if (emailWorker) closes.push(emailWorker.close());
  if (telegramWorker) closes.push(telegramWorker.close());
  if (inAppNotificationWorker) closes.push(inAppNotificationWorker.close());
  await Promise.all(closes);
  emailWorker = null;
  telegramWorker = null;
  inAppNotificationWorker = null;

  if (connection) {
    await connection.quit();
    connection = null;
  }
}
