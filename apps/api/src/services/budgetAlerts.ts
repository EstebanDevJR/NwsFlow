import prisma from '@paymentflow/database';
import { addInAppNotificationJob } from './queue.js';
import { logger } from '../lib/logger.js';

const DEFAULT_THRESHOLDS = [70, 90, 100];

export async function processBudgetAlerts(): Promise<number> {
  const budgets = await prisma.budget.findMany({
    where: { isActive: true },
    include: {
      alerts: { where: { type: 'THRESHOLD' } },
      leader: { select: { id: true, name: true } },
    },
  });

  let alertsSent = 0;

  for (const budget of budgets) {
    const thresholds = budget.thresholds || DEFAULT_THRESHOLDS;

    const spent = await prisma.paymentRequest.aggregate({
      where: {
        status: { in: ['APPROVED', 'PAID'] },
        category: budget.category || undefined,
        userId: budget.leaderId || undefined,
        createdAt: { gte: budget.startDate, lte: budget.endDate },
      },
      _sum: { amount: true },
    });

    const spentAmount = spent._sum.amount?.toNumber() || 0;
    const percentUsed = budget.amount.toNumber() > 0 
      ? (spentAmount / budget.amount.toNumber()) * 100 
      : 0;

    const sentThresholds = new Set(budget.alerts.map((a) => a.threshold));

    for (const threshold of thresholds) {
      if (percentUsed >= threshold && !sentThresholds.has(threshold)) {
        const existingAlert = budget.alerts.find(
          (a) => a.threshold === threshold && 
          a.sentAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
        );

        if (!existingAlert) {
          await prisma.budgetAlert.create({
            data: {
              budgetId: budget.id,
              threshold,
              type: 'THRESHOLD',
            },
          });

          const holders = await prisma.user.findMany({
            where: { role: 'HOLDER', isActive: true, inAppNotifications: true },
          });

          for (const holder of holders) {
            await addInAppNotificationJob({
              userId: holder.id,
              type: 'BUDGET_ALERT',
              title: `Presupuesto al ${threshold}%`,
              message: budget.leader
                ? `El presupuesto "${budget.name}" (${budget.leader.name}) ha alcanzado el ${threshold}% de uso.`
                : `El presupuesto "${budget.name}" ha alcanzado el ${threshold}% de uso.`,
              link: '/reports',
            });
          }

          alertsSent++;
          logger.info({ budgetId: budget.id, threshold, percentUsed }, 'budget_alert_sent');
        }
      }
    }
  }

  return alertsSent;
}

export async function getBudgetStats(): Promise<{
  total: number;
  active: number;
  totalAmount: number;
  totalSpent: number;
  alertCount: number;
}> {
  const budgets = await prisma.budget.findMany({ where: { isActive: true } });
  const alerts = await prisma.budgetAlert.count({
    where: { sentAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });

  let totalSpent = 0;
  for (const budget of budgets) {
    const spent = await prisma.paymentRequest.aggregate({
      where: {
        status: { in: ['APPROVED', 'PAID'] },
        category: budget.category || undefined,
        userId: budget.leaderId || undefined,
        createdAt: { gte: budget.startDate, lte: budget.endDate },
      },
      _sum: { amount: true },
    });
    totalSpent += spent._sum.amount?.toNumber() || 0;
  }

  return {
    total: budgets.length,
    active: budgets.filter((b) => b.isActive).length,
    totalAmount: budgets.reduce((sum, b) => sum + b.amount.toNumber(), 0),
    totalSpent,
    alertCount: alerts,
  };
}