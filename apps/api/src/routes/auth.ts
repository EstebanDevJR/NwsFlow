import { Router } from 'express';
import { z } from 'zod';
import prisma from '@paymentflow/database';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, hashPassword, comparePassword, hashToken } from '@paymentflow/auth';
import { createError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { resolveStoredFileUrl } from '../lib/fileUrls.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(['LIDER', 'HOLDER', 'CAJERO']).default('LIDER'),
});

router.post('/register', async (req, res, next) => {
  try {
    if (process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
      throw createError('Registration is disabled. Contact an administrator.', 403);
    }

    const data = registerSchema.parse(req.body);
    if (data.role !== 'LIDER') {
      throw createError('Only LIDER accounts can be created via public registration', 403);
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw createError('Email already registered', 400);
    }

    const hashedPassword = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: { ...data, password: hashedPassword },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.isActive) {
      throw createError('Invalid credentials', 401);
    }

    const valid = await comparePassword(data.password, user.password);
    if (!valid) {
      throw createError('Invalid credentials', 401);
    }

    const payload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const tokenHash = hashToken(refreshToken);

    await prisma.refreshToken.upsert({
      where: { token: tokenHash },
      update: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      create: { token: tokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), userId: user.id },
    });

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    res.cookie('refreshToken', refreshToken, cookieOptions);
    const avatarUrl = await resolveStoredFileUrl(user.avatar, req, 2 * 60 * 60);
    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: avatarUrl,
        telegramId: user.telegramId ?? null,
        telegramPairingAllowed: user.telegramPairingAllowed,
        emailNotifications: user.emailNotifications,
        inAppNotifications: user.inAppNotifications,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      throw createError('Refresh token required', 400);
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      throw createError('Invalid refresh token', 401);
    }

    const tokenHash = hashToken(refreshToken);
    const tokenRecord = await prisma.refreshToken.findFirst({
      where: { token: tokenHash, expiresAt: { gt: new Date() } },
    });
    if (!tokenRecord) {
      throw createError('Refresh token expired or revoked', 401);
    }

    await prisma.refreshToken.delete({ where: { id: tokenRecord.id } });

    const newAccessToken = generateAccessToken({ userId: payload.userId, email: payload.email, role: payload.role });
    const newRefreshToken = generateRefreshToken({ userId: payload.userId, email: payload.email, role: payload.role });
    const newTokenHash = hashToken(newRefreshToken);

    await prisma.refreshToken.create({
      data: { token: newTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), userId: payload.userId },
    });

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
    res.cookie('refreshToken', newRefreshToken, cookieOptions);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await prisma.refreshToken.deleteMany({ where: { token: tokenHash } });
    }
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        telegramId: true,
        telegramPairingAllowed: true,
        emailNotifications: true,
        inAppNotifications: true,
      },
    });
    if (!user) {
      throw createError('User not found', 404);
    }
    res.json({
      ...user,
      avatar: await resolveStoredFileUrl(user.avatar, req, 2 * 60 * 60),
    });
  } catch (err) {
    next(err);
  }
});

const patchMeSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  emailNotifications: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

router.patch('/me', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const data = patchMeSchema.parse(req.body);
    if (Object.keys(data).length === 0) {
      throw createError('No valid fields to update', 400);
    }

    if (data.email && data.email !== req.user!.email) {
      const taken = await prisma.user.findUnique({ where: { email: data.email } });
      if (taken) {
        throw createError('Este correo ya está registrado', 400);
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        telegramId: true,
        telegramPairingAllowed: true,
        emailNotifications: true,
        inAppNotifications: true,
      },
    });
    res.json({
      ...user,
      avatar: await resolveStoredFileUrl(user.avatar, req, 2 * 60 * 60),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    if (!req.user) {
      throw createError('Authentication required', 401);
    }

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) {
      throw createError('User not found', 404);
    }

    const valid = await comparePassword(currentPassword, user.password);
    if (!valid) {
      throw createError('La contraseña actual es incorrecta', 400);
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { password: hashed },
    });

    await prisma.refreshToken.deleteMany({ where: { userId: req.user.userId } });

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    next(err);
  }
});

export default router;
