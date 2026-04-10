import { Router } from 'express';
import prisma from '@paymentflow/database';
import { createError } from '../middleware/errorHandler.js';
import { notificationCutoffDate, purgeExpiredNotifications } from '../lib/notificationsRetention.js';

const router = Router();

const recentWhere = (userId: string) => ({
  userId,
  createdAt: { gte: notificationCutoffDate() },
});

router.get('/', async (req, res, next) => {
  try {
    await purgeExpiredNotifications();

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const [data, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where: recentWhere(req.user!.userId),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: recentWhere(req.user!.userId) }),
      prisma.notification.count({ where: { ...recentWhere(req.user!.userId), read: false } }),
    ]);

    res.json({
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), unread },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await purgeExpiredNotifications();
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.userId, createdAt: { gte: notificationCutoffDate() } },
      data: { read: true },
    });
    if (!updated.count) throw createError('Notification not found', 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await purgeExpiredNotifications();
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, read: false, createdAt: { gte: notificationCutoffDate() } },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
