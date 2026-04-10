import prisma from '@paymentflow/database';

/** Notificaciones in-app: caducan pasados 3 días (se eliminan de la BD). */
export const NOTIFICATION_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function notificationCutoffDate(): Date {
  return new Date(Date.now() - NOTIFICATION_MAX_AGE_MS);
}

/** Elimina notificaciones expiradas (todas las usuarias). Idempotente. */
export async function purgeExpiredNotifications(): Promise<number> {
  const cutoff = notificationCutoffDate();
  const result = await prisma.notification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
