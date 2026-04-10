import prisma from '@paymentflow/database';
import redis from '../lib/redis.js';
import { addInAppNotificationJob } from './queue.js';
import { logger } from '../lib/logger.js';

const REMINDER_MINUTES_BEFORE = 15;
const LOCK_TTL_SECONDS = 300;

async function acquireLock(key: string): Promise<boolean> {
  const result = await redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

async function releaseLock(key: string): Promise<void> {
  await redis.del(key);
}

/**
 * Recordatorio ~15 min antes: notificación in-app; correo vía worker si `emailNotifications`.
 */
export async function processMeetingReminders(): Promise<number> {
  const lockKey = 'lock:meeting_reminders';
  const hasLock = await acquireLock(lockKey);
  if (!hasLock) {
    return 0;
  }

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_MINUTES_BEFORE * 60 * 1000);

    const candidates = await prisma.meeting.findMany({
      where: {
        reminderSentAt: null,
        status: { in: ['PENDING', 'CONFIRMED'] as any },
        scheduledAt: { gt: now, lte: windowEnd },
      },
      include: {
        leader: { select: { id: true, name: true, inAppNotifications: true } },
        holder: { select: { id: true, name: true, inAppNotifications: true } },
      },
    });

    let sent = 0;
    for (const meeting of candidates) {
      const title = 'Recordatorio de reunión';
      const whenStr = meeting.scheduledAt.toLocaleString('es', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      const message = `"${meeting.title}" comienza en unos minutos (${whenStr}).`;

      const notifyUser = async (userId: string, inApp: boolean) => {
        if (inApp) {
          await addInAppNotificationJob({
            userId,
            type: 'MEETING_REMINDER',
            title,
            message,
            link: '/meetings',
          });
        }
      };

      try {
        await notifyUser(meeting.leaderId, meeting.leader.inAppNotifications);
        await notifyUser(meeting.holderId, meeting.holder.inAppNotifications);

        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { reminderSentAt: now },
        });
        sent++;
      } catch (err) {
        logger.error({ err, meetingId: meeting.id }, 'meeting_reminder_failed');
      }
    }

    return sent;
  } catch (err) {
    logger.error({ err }, 'meeting_reminders_error');
    return 0;
  } finally {
    await releaseLock(lockKey);
  }
}
