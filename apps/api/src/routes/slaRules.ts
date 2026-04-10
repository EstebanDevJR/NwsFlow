import { Router } from 'express';
import { z } from 'zod';
import prisma from '@paymentflow/database';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const createSlaSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PAID']),
  maxHours: z.number().positive(),
  escalationRole: z.enum(['HOLDER', 'CAJERO']).optional(),
  notifyTemplate: z.string().optional(),
});

const updateSlaSchema = createSlaSchema.partial();

router.get('/', requireRole('HOLDER'), async (_req, res, next) => {
  try {
    const rules = await prisma.slaRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(rules);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const data = createSlaSchema.parse(req.body);
    const rule = await prisma.slaRule.create({ data });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateSlaSchema.parse(req.body);
    const rule = await prisma.slaRule.update({ where: { id }, data });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.slaRule.update({ where: { id }, data: { isActive: false } });
    res.json({ message: 'SLA rule deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
