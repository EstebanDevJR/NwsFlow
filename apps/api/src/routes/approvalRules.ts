import { Router } from 'express';
import { z } from 'zod';
import prisma from '@paymentflow/database';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const ruleSchema = z.object({
  name: z.string().min(1),
  minAmount: z.number().positive(),
  maxAmount: z.number().positive().optional(),
  requiredApprovals: z.number().min(1).default(1),
  approverRoles: z.array(z.enum(['HOLDER', 'CAJERO'])),
});

const createRuleSchema = ruleSchema.superRefine((data, ctx) => {
  if (typeof data.maxAmount === 'number' && data.maxAmount < data.minAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'maxAmount must be greater than or equal to minAmount',
      path: ['maxAmount'],
    });
  }
});

const updateRuleSchema = ruleSchema.partial().superRefine((data, ctx) => {
  if (
    typeof data.maxAmount === 'number' &&
    typeof data.minAmount === 'number' &&
    data.maxAmount < data.minAmount
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'maxAmount must be greater than or equal to minAmount',
      path: ['maxAmount'],
    });
  }
});

router.get('/', requireRole('HOLDER'), async (_req, res, next) => {
  try {
    const rules = await prisma.approvalRule.findMany({
      orderBy: { minAmount: 'asc' },
    });
    res.json(rules);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const rule = await prisma.approvalRule.findUnique({ where: { id } });
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const data = createRuleSchema.parse(req.body);
    const rule = await prisma.approvalRule.create({
      data,
    });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateRuleSchema.parse(req.body);
    
    const updateData: Record<string, unknown> = { ...data };

    const rule = await prisma.approvalRule.update({
      where: { id },
      data: updateData,
    });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.approvalRule.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({ message: 'Rule deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
