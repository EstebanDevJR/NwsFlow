import prisma from '@paymentflow/database';
import { addTelegramJob, addInAppNotificationJob, addEmailJob } from './queue.js';
import { logger } from '../lib/logger.js';
import { buildEmailHtml } from '../lib/emailLayout.js';

export async function processSlaRules(): Promise<number> {
  const rules = await prisma.slaRule.findMany({
    where: { isActive: true },
  });

  let processed = 0;

  for (const rule of rules) {
    const cutoff = new Date(Date.now() - rule.maxHours * 60 * 60 * 1000);
    
    const stalePayments = await prisma.paymentRequest.findMany({
      where: {
        status: rule.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID',
        createdAt: { lt: cutoff },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, telegramId: true, emailNotifications: true },
        },
      },
    });

    for (const payment of stalePayments) {
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: payment.userId,
          type: `SLA_${rule.id}`,
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      });

      if (existingNotification) continue;

      const message = rule.notifyTemplate
        ?.replace('{concept}', payment.concept)
        ?.replace('{amount}', payment.amount.toString())
        ?.replace('{days}', String(Math.floor((Date.now() - payment.createdAt.getTime()) / (24 * 60 * 60 * 1000))))
        || `La solicitud "${payment.concept}" lleva más de ${rule.maxHours} horas en estado ${rule.status}.`;

      await addInAppNotificationJob({
        userId: payment.userId,
        type: `SLA_${rule.id}`,
        title: `Solicitud estancada: ${payment.concept}`,
        message,
        link: '/payments',
      });

      if (payment.user.telegramId) {
        await addTelegramJob({
          chatId: payment.user.telegramId,
          message: `⏰ ${message}`,
        });
      }

      if (rule.escalationRole === 'HOLDER') {
        const holders = await prisma.user.findMany({
          where: {
            role: 'HOLDER',
            isActive: true,
            emailNotifications: true,
          },
          select: { id: true, email: true },
        });

        for (const holder of holders) {
          if (holder.id === payment.userId && payment.user.emailNotifications) {
            continue;
          }
          const to = holder.email?.trim();
          if (!to) continue;
          const subject = `Escalamiento: Solicitud estancada — ${payment.concept}`;
          await addEmailJob({
            to,
            subject,
            text: message,
            html: buildEmailHtml({
              heading: 'Solicitud estancada (SLA)',
              bodyText: message,
              preheader: message.slice(0, 120),
              variant: 'attention',
            }),
          });
        }
      }

      processed++;
      logger.info({ paymentId: payment.id, ruleId: rule.id }, 'sla_notification_sent');
    }
  }

  return processed;
}
