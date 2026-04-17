import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '@paymentflow/database';
import { requireRole } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { hashPassword } from '@paymentflow/auth';
import { randomBytes } from 'crypto';

const router = Router();

router.get('/telegram-access', requireRole('HOLDER', 'LIDER'), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['HOLDER', 'CAJERO'] } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        telegramPairingAllowed: true,
        telegramId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

const patchHolderTelegramSchema = z.object({
  telegramPairingAllowed: z.boolean(),
});

router.patch('/telegram-access/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = patchHolderTelegramSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || (target.role !== 'HOLDER' && target.role !== 'CAJERO')) {
      throw createError('Usuario no encontrado', 404);
    }
    const updated = await prisma.user.update({
      where: { id },
      data: {
        telegramPairingAllowed: data.telegramPairingAllowed,
        ...(data.telegramPairingAllowed === false ? { telegramId: null } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        telegramPairingAllowed: true,
        telegramId: true,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

function generateRandomPassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  return randomBytes(length).toString('hex').slice(0, length).split('').map(c => charset[Math.floor(Math.random() * charset.length)]).join('');
}

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(['LIDER', 'HOLDER', 'CAJERO']),
  telegramId: z.string().optional(),
  telegramPairingAllowed: z.boolean().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(['LIDER', 'CAJERO']).optional(),
  isActive: z.boolean().optional(),
  telegramId: z.string().optional(),
  telegramPairingAllowed: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

router.get('/', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { role, q, status } = req.query;

    const where: Prisma.UserWhereInput = {
      role: { in: ['LIDER', 'HOLDER', 'CAJERO'] },
    };

    if (typeof role === 'string' && ['LIDER', 'HOLDER', 'CAJERO'].includes(role)) {
      where.role = role as 'LIDER' | 'HOLDER' | 'CAJERO';
    }

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    if (typeof q === 'string' && q.trim()) {
      const term = q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true, role: true, isActive: true, telegramId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('HOLDER', 'LIDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.user?.role === 'LIDER' && req.user.userId !== id) {
      throw createError('Insufficient permissions', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, isActive: true, telegramId: true, createdAt: true },
    });
    if (!user) throw createError('User not found', 404);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw createError('Email already registered', 400);
    }

    const generatedPassword = data.password || generateRandomPassword(12);
    const hashedPassword = await hashPassword(generatedPassword);

    const { telegramPairingAllowed, telegramId, ...rest } = data;
    const user = await prisma.user.create({
      data: {
        ...rest,
        password: hashedPassword,
        ...(telegramId ? { telegramId } : {}),
        ...((data.role === 'HOLDER' || data.role === 'CAJERO') && typeof telegramPairingAllowed === 'boolean'
          ? { telegramPairingAllowed }
          : {}),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
    
    res.status(201).json({ ...user, generatedPassword: data.password ? undefined : generatedPassword });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);
    const { password, ...rest } = data;
    const updateData: typeof rest & { password?: string } = { ...rest };
    if (password?.trim()) {
      updateData.password = await hashPassword(password);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reset-password', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw createError('User not found', 404);

    const newPassword = generateRandomPassword(12);
    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password reset successfully', newPassword });
  } catch (err) {
    next(err);
  }
});

/** Elimina el usuario y datos vinculados (aprobaciones como aprobador, reuniones como holder). */
router.delete('/:id/permanent', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.user!.userId === id) {
      throw createError('No puedes eliminar tu propio usuario', 400);
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw createError('User not found', 404);

    await prisma.$transaction(async (tx) => {
      await tx.paymentApproval.deleteMany({ where: { approverId: id } });
      await tx.meeting.deleteMany({ where: { holderId: id } });
      await tx.user.delete({ where: { id } });
    });

    res.json({ message: 'Usuario eliminado del sistema' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.user!.userId === id) {
      throw createError('No puedes desactivar tu propio usuario', 400);
    }
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    res.json({ message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
