import { Router } from 'express';
import { z } from 'zod';
import prisma from '@paymentflow/database';
import { requireRole } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';

const router = Router();

const createBudgetSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  period: z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  category: z.string().optional(),
  leaderId: z.string().optional(),
  thresholds: z.array(z.number()).optional(),
});

const updateBudgetSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  period: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  category: z.string().optional(),
  leaderId: z.string().optional(),
  isActive: z.boolean().optional(),
  thresholds: z.array(z.number()).optional(),
});

router.get('/', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { category, leaderId, isActive } = req.query;
    const where: Record<string, unknown> = {};

    if (category) where.category = category;
    if (leaderId) where.leaderId = leaderId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const budgets = await prisma.budget.findMany({
      where,
      include: {
        alerts: { orderBy: { sentAt: 'desc' } },
        leader: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const budgetsWithSpent = await Promise.all(
      budgets.map(async (budget) => {
        const spent = await prisma.paymentRequest.aggregate({
          where: {
            status: { in: ['APPROVED', 'PAID'] },
            category: budget.category || undefined,
            userId: budget.leaderId || undefined,
            createdAt: {
              gte: budget.startDate,
              lte: budget.endDate,
            },
          },
          _sum: { amount: true },
        });

        return {
          ...budget,
          spent: spent._sum.amount?.toNumber() || 0,
          remaining: budget.amount.toNumber() - (spent._sum.amount?.toNumber() || 0),
          percentUsed: budget.amount.toNumber() > 0
            ? ((spent._sum.amount?.toNumber() || 0) / budget.amount.toNumber()) * 100
            : 0,
        };
      })
    );

    res.json(budgetsWithSpent);
  } catch (err) {
    next(err);
  }
});

router.get('/categories/list', requireRole('HOLDER'), async (_req, res, next) => {
  try {
    const categories = await prisma.paymentRequest.findMany({
      where: { status: { in: ['APPROVED', 'PAID'] } },
      select: { category: true },
      distinct: ['category'],
    });
    res.json(categories.map((c) => c.category));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('HOLDER', 'LIDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: {
        alerts: { orderBy: { sentAt: 'desc' } },
        leader: { select: { id: true, name: true, email: true } },
      },
    });
    if (!budget) throw createError('Budget not found', 404);

    if (req.user?.role === 'LIDER' && budget.leaderId !== req.user.userId) {
      throw createError('Insufficient permissions', 403);
    }

    const spent = await prisma.paymentRequest.aggregate({
      where: {
        status: { in: ['APPROVED', 'PAID'] },
        category: budget.category || undefined,
        userId: budget.leaderId || undefined,
        createdAt: { gte: budget.startDate, lte: budget.endDate },
      },
      _sum: { amount: true },
    });

    res.json({
      ...budget,
      spent: spent._sum.amount?.toNumber() || 0,
      remaining: budget.amount.toNumber() - (spent._sum.amount?.toNumber() || 0),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const data = createBudgetSchema.parse(req.body);

    const budget = await prisma.budget.create({
      data: {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        thresholds: data.thresholds || [70, 90, 100],
      },
    });

    res.status(201).json(budget);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateBudgetSchema.parse(req.body);

    const updateData: Record<string, unknown> = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    const budget = await prisma.budget.update({
      where: { id },
      data: updateData,
    });

    res.json(budget);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.budget.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({ message: 'Budget deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
