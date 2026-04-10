import { Router, Request, Response } from 'express';
import prisma from '@paymentflow/database';
import { authMiddleware } from '../middleware/auth.js';
import { notificationCutoffDate, purgeExpiredNotifications } from '../lib/notificationsRetention.js';

const router = Router();

const clients = new Map<string, Response[]>();

export function sendSSE(userId: string, event: string, data: unknown) {
  const userClients = clients.get(userId) || [];
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  userClients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      userClients.splice(userClients.indexOf(res), 1);
    }
  });
  
  if (userClients.length === 0) {
    clients.delete(userId);
  }
}

router.get('/events', authMiddleware, (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const userId = req.user!.userId;
  
  if (!clients.has(userId)) {
    clients.set(userId, []);
  }
  clients.get(userId)!.push(res);

  res.on('close', () => {
    const userClients = clients.get(userId);
    if (userClients) {
      const idx = userClients.indexOf(res);
      if (idx > -1) userClients.splice(idx, 1);
      if (userClients.length === 0) clients.delete(userId);
    }
  });
});

router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
  try {
    await purgeExpiredNotifications();
    const count = await prisma.notification.count({
      where: {
        userId: req.user!.userId,
        read: false,
        createdAt: { gte: notificationCutoffDate() },
      },
    });
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Failed to get count' });
  }
});

export default router;