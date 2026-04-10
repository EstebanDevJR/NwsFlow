import { Queue } from 'bullmq';
import redis from '../lib/redis.js';

export interface EmailJobData {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface TelegramJobData {
  chatId: string;
  message: string;
  replyMarkup?: unknown;
}

/** In-app + correo (si `emailNotifications`) vía worker para cualquier rol. */
export interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  message: string;
  /** Ruta relativa en la web (ej. `/meetings`). */
  link?: string | null;
}

const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST_WORKER_ID !== undefined;

const connection = { connection: redis };

let emailQueue: Queue<EmailJobData> | null = null;
let telegramQueue: Queue<TelegramJobData> | null = null;
let inAppNotificationQueue: Queue<NotificationJobData> | null = null;

function getEmailQueue() {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobData>('email', connection);
  }
  return emailQueue;
}

function getTelegramQueue() {
  if (!telegramQueue) {
    telegramQueue = new Queue<TelegramJobData>('telegram', connection);
  }
  return telegramQueue;
}

function getInAppNotificationQueue() {
  if (!inAppNotificationQueue) {
    inAppNotificationQueue = new Queue<NotificationJobData>('in-app-notifications', connection);
  }
  return inAppNotificationQueue;
}

export async function addEmailJob(data: EmailJobData) {
  if (isTestEnv) return;
  await getEmailQueue().add('send-email', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function addTelegramJob(data: TelegramJobData) {
  if (isTestEnv) return;
  await getTelegramQueue().add('send-telegram', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function addInAppNotificationJob(data: NotificationJobData) {
  if (isTestEnv) return;
  await getInAppNotificationQueue().add('create-notification', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 500,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}
