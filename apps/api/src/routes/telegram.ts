import { Router } from 'express';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import prisma from '@paymentflow/database';
import { createError } from '../middleware/errorHandler.js';
import { sendTelegramNotification } from '../services/telegram.js';
import { addTelegramJob, addInAppNotificationJob } from '../services/queue.js';
import { resolveStoredFileUrlForBot } from '../lib/fileUrls.js';
import redis from '../lib/redis.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import type { CurrencyCode } from '@paymentflow/shared';
import { isBotClientIpAllowed } from '../lib/botIpAllowlist.js';
import { getSignedDownloadUrl, isS3Configured, parseS3Uri } from '../lib/s3.js';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || 'uploads';

function localDiskAbsoluteForBot(storedPath: string): string {
  if (storedPath.startsWith('/uploads/')) {
    return path.join(uploadDir, path.basename(storedPath));
  }
  if (storedPath.startsWith('uploads/')) {
    return path.join(uploadDir, path.basename(storedPath));
  }
  if (fs.existsSync(storedPath)) {
    return storedPath;
  }
  return path.join(uploadDir, path.basename(storedPath));
}

const PAIR_CODE_TTL_SEC = 900;
const PAIR_CODE_LEN = 6;
const PAIR_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generatePairCode(): string {
  const bytes = randomBytes(PAIR_CODE_LEN);
  let out = '';
  for (let i = 0; i < PAIR_CODE_LEN; i++) {
    out += PAIR_CODE_CHARS[bytes[i] % PAIR_CODE_CHARS.length];
  }
  return out;
}

const SESSION_TTL = 300;

async function setSession(chatId: number, action: string, paymentId?: string) {
  const key = `telegram:session:${chatId}`;
  const data = JSON.stringify({ action, paymentId });
  await redis.setex(key, SESSION_TTL, data);
}

async function getSession(chatId: number) {
  const key = `telegram:session:${chatId}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function deleteSession(chatId: number) {
  const key = `telegram:session:${chatId}`;
  await redis.del(key);
}

async function getHolderByTelegramId(telegramId: string) {
  return prisma.user.findFirst({
    where: {
      telegramId,
      role: 'HOLDER',
      isActive: true,
      telegramPairingAllowed: true,
    },
    select: { id: true, name: true, role: true, isActive: true },
  });
}

function assertBotToken(req: any) {
  if (!isBotClientIpAllowed(req)) {
    throw createError('Forbidden', 403);
  }
  const configured = process.env.BOT_INTERNAL_TOKEN?.trim();
  if (!configured) {
    throw createError('Bot internal authentication is not configured', 503);
  }
  const incoming = req.get('x-bot-token');
  if (incoming !== configured) {
    throw createError('Invalid bot token', 403);
  }
}

/** El bot genera el código; el holder lo introduce en la UI y valida aquí. */
router.post('/pairing-validate', authMiddleware, requireRole('HOLDER'), async (req, res, next) => {
  try {
    const rawCode = String((req.body as { code?: string })?.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '');
    if (rawCode.length !== PAIR_CODE_LEN) {
      throw createError('El código debe tener 6 caracteres.', 400);
    }

    const telegramUserId = await redis.get(`telegram:pair:pending:${rawCode}`);
    if (!telegramUserId) {
      throw createError(
        'Código incorrecto o expirado. En Telegram envía /codigo al bot y usa el código nuevo en unos minutos.',
        400
      );
    }

    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        telegramPairingAllowed: true,
        telegramId: true,
        isActive: true,
      },
    });
    if (!user || user.role !== 'HOLDER' || !user.isActive) {
      throw createError('Solo holders activos pueden vincular Telegram', 403);
    }
    if (!user.telegramPairingAllowed) {
      throw createError(
        'Tu cuenta no está habilitada para vincular Telegram. Un administrador debe activar el permiso.',
        403
      );
    }
    if (user.telegramId && user.telegramId !== telegramUserId) {
      throw createError('Ya tienes otro Telegram vinculado. Desvincúlalo primero en esta pantalla.', 400);
    }

    const takenByOther = await prisma.user.findFirst({
      where: { telegramId: telegramUserId, id: { not: userId } },
      select: { id: true },
    });
    if (takenByOther) {
      throw createError('Este Telegram ya está vinculado a otra cuenta de la plataforma.', 400);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { telegramId: telegramUserId },
    });

    await redis.del(`telegram:pair:pending:${rawCode}`);
    await redis.del(`telegram:pair:pending:tg:${telegramUserId}`);

    res.json({ ok: true, name: user.name });
  } catch (err) {
    next(err);
  }
});

router.post('/bot/pending-pair-code', async (req, res, next) => {
  try {
    assertBotToken(req);
    const telegramUserId = String((req.body as { telegramUserId?: string })?.telegramUserId || '').trim();
    if (!telegramUserId) {
      throw createError('telegramUserId is required', 400);
    }

    const linked = await getHolderByTelegramId(telegramUserId);
    if (linked) {
      throw createError(
        'Ya tienes Telegram vinculado. Para cambiar de cuenta, desvincula primero desde la plataforma web (Configuración → Telegram).',
        400
      );
    }

    const existing = await prisma.user.findFirst({
      where: { telegramId: telegramUserId },
      select: { id: true },
    });
    if (existing) {
      throw createError(
        'Este Telegram ya está asociado a una cuenta. Desvincula desde la web si quieres cambiar de usuario.',
        400
      );
    }

    const prevCode = await redis.get(`telegram:pair:pending:tg:${telegramUserId}`);
    if (prevCode) {
      await redis.del(`telegram:pair:pending:${prevCode}`);
    }

    let code = generatePairCode();
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = await redis.get(`telegram:pair:pending:${code}`);
      if (!clash) break;
      code = generatePairCode();
    }

    await redis.setex(`telegram:pair:pending:${code}`, PAIR_CODE_TTL_SEC, telegramUserId);
    await redis.setex(`telegram:pair:pending:tg:${telegramUserId}`, PAIR_CODE_TTL_SEC, code);

    res.json({ code, expiresInSeconds: PAIR_CODE_TTL_SEC });
  } catch (err) {
    next(err);
  }
});

router.delete('/pairing', authMiddleware, requireRole('HOLDER'), async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, role: true },
    });
    if (!user || user.role !== 'HOLDER') {
      throw createError('No permitido', 403);
    }
    if (!user.telegramId) {
      return res.json({ ok: true, message: 'No había vinculación activa' });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { telegramId: null },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/bot/resolve', async (req, res, next) => {
  try {
    assertBotToken(req);
    const telegramUserId = String((req.body as { telegramUserId?: string })?.telegramUserId || '').trim();
    if (!telegramUserId) {
      throw createError('telegramUserId is required', 400);
    }

    const linked = await getHolderByTelegramId(telegramUserId);
    if (linked) {
      return res.json({ status: 'linked' as const, name: linked.name });
    }

    const user = await prisma.user.findFirst({
      where: { telegramId: telegramUserId },
      select: { id: true, role: true },
    });
    if (user) {
      return res.json({
        status: 'denied' as const,
        message:
          'Tu Telegram estaba vinculado pero ya no tienes permiso para usar el bot. Contacta a un administrador.',
      });
    }

    const canPair =
      (await prisma.user.count({
        where: { role: 'HOLDER', isActive: true, telegramPairingAllowed: true },
      })) > 0;

    return res.json({
      status: 'needs_pairing' as const,
      canPair,
      message: canPair
        ? undefined
        : 'Ningún holder está habilitado para vincular Telegram. Contacta a un administrador.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/webhook', async (req, res, next) => {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    const incomingSecret = req.get('x-telegram-bot-api-secret-token');

    if (!secret) {
      throw createError('Telegram webhook secret is not configured', 503);
    }
    if (incomingSecret !== secret) {
      throw createError('Invalid Telegram webhook secret', 403);
    }

    const update = req.body as any;
    const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
    const telegramUserId = update?.message?.from?.id || update?.callback_query?.from?.id;
    const text = update?.message?.text?.trim();
    const callbackData = update?.callback_query?.data;

    if (!chatId || !telegramUserId) {
      return res.json({ ok: true });
    }

    const holder = await getHolderByTelegramId(String(telegramUserId));
    if (!holder || holder.role !== 'HOLDER' || !holder.isActive) {
      await sendTelegramNotification(chatId, 'No tienes acceso al bot. Contacta a un administrador.');
      return res.json({ ok: true });
    }

    if (callbackData === 'approve') {
      await setSession(chatId, 'approve');
      await sendTelegramNotification(chatId, 'Para aprobar una solicitud, ingresa el ID (ultimos 6 caracteres).');
      return res.json({ ok: true });
    }

    if (callbackData === 'reject') {
      await setSession(chatId, 'reject');
      await sendTelegramNotification(chatId, 'Para rechazar una solicitud, ingresa el ID (ultimos 6 caracteres).');
      return res.json({ ok: true });
    }

    const session = await getSession(chatId);
    if (text && session?.action === 'approve') {
      const payment = await prisma.paymentRequest.findFirst({
        where: { id: { endsWith: text }, status: 'PENDING' },
      });
      await deleteSession(chatId);
      if (!payment) {
        await sendTelegramNotification(chatId, 'Solicitud no encontrada o ya procesada.');
        return res.json({ ok: true });
      }
      await prisma.paymentRequest.update({ where: { id: payment.id }, data: { status: 'APPROVED' } });
      await sendTelegramNotification(chatId, `Solicitud #${payment.id.slice(-6)} aprobada.`);
      return res.json({ ok: true });
    }

    if (text && session?.action === 'reject') {
      const payment = await prisma.paymentRequest.findFirst({
        where: { id: { endsWith: text }, status: 'PENDING' },
      });
      if (!payment) {
        await deleteSession(chatId);
        await sendTelegramNotification(chatId, 'Solicitud no encontrada o ya procesada.');
        return res.json({ ok: true });
      }
      await setSession(chatId, 'reject_comment', payment.id);
      await sendTelegramNotification(chatId, 'Ingresa el comentario de rechazo (min 3 caracteres).');
      return res.json({ ok: true });
    }

    if (text && session?.action === 'reject_comment' && session.paymentId) {
      if (text.length < 3) {
        await sendTelegramNotification(chatId, 'El comentario debe tener al menos 3 caracteres.');
        return res.json({ ok: true });
      }
      await prisma.paymentRequest.update({
        where: { id: session.paymentId },
        data: { status: 'REJECTED', rejectionComment: text },
      });
      await deleteSession(chatId);
      await sendTelegramNotification(chatId, 'Solicitud rechazada correctamente.');
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/bot/dashboard', async (req, res, next) => {
  try {
    assertBotToken(req);
    const [pending, approved, rejected] = await Promise.all([
      prisma.paymentRequest.count({ where: { status: 'PENDING' } }),
      prisma.paymentRequest.count({ where: { status: 'APPROVED' } }),
      prisma.paymentRequest.count({ where: { status: 'REJECTED' } }),
    ]);
    const [totalAmount, approvedByCurrency] = await Promise.all([
      prisma.paymentRequest.aggregate({
        where: { status: 'APPROVED' },
        _sum: { amount: true },
      }),
      prisma.paymentRequest.groupBy({
        by: ['currency'],
        where: { status: 'APPROVED' },
        _sum: { amount: true },
      }),
    ]);
    const totalApprovedByCurrency: Record<string, number> = {};
    for (const row of approvedByCurrency) {
      totalApprovedByCurrency[row.currency] = Number(row._sum.amount ?? 0);
    }
    res.json({
      pending,
      approved,
      rejected,
      totalApproved: Number(totalAmount._sum.amount || 0),
      totalApprovedByCurrency,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/bot/pending', async (req, res, next) => {
  try {
    assertBotToken(req);
    const pending = await prisma.paymentRequest.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { name: true } } },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    res.json(pending);
  } catch (err) {
    next(err);
  }
});

router.get('/bot/reports', async (req, res, next) => {
  try {
    assertBotToken(req);
    const { startDate, endDate, category, status } = req.query;
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }
    if (category) where.category = category;
    if (status) where.status = status;
    const [total, pending, approved, rejected, paid] = await Promise.all([
      prisma.paymentRequest.count({ where }),
      prisma.paymentRequest.count({ where: { ...where, status: 'PENDING' } }),
      prisma.paymentRequest.count({ where: { ...where, status: 'APPROVED' } }),
      prisma.paymentRequest.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.paymentRequest.count({ where: { ...where, status: 'PAID' } }),
    ]);
    res.json({ total, pending, approved, rejected, paid });
  } catch (err) {
    next(err);
  }
});

router.get('/bot/leaders', async (req, res, next) => {
  try {
    assertBotToken(req);
    const leaders = await prisma.user.findMany({
      where: { role: 'LIDER' },
      select: { id: true, name: true, email: true, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(leaders);
  } catch (err) {
    next(err);
  }
});

router.post('/bot/leaders', async (req, res, next) => {
  try {
    assertBotToken(req);
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
    if (!name || !email || !password) throw createError('name, email and password are required', 400);
    const { hashPassword } = await import('@paymentflow/auth');
    const hashedPassword = await hashPassword(password);
    const leader = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'LIDER' },
      select: { id: true, name: true, email: true, isActive: true },
    });
    res.status(201).json(leader);
  } catch (err) {
    next(err);
  }
});

router.patch('/bot/leaders/:id/toggle', async (req, res, next) => {
  try {
    assertBotToken(req);
    const leader = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!leader || leader.role !== 'LIDER') throw createError('Leader not found', 404);
    const updated = await prisma.user.update({
      where: { id: leader.id },
      data: { isActive: !leader.isActive },
      select: { id: true, name: true, email: true, isActive: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/bot/history', async (req, res, next) => {
  try {
    assertBotToken(req);
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = 10;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.paymentRequest.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.paymentRequest.count(),
    ]);
    res.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});

router.post('/bot/payments/:id/approve', async (req, res, next) => {
  try {
    assertBotToken(req);
    const payment = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!payment || payment.status !== 'PENDING') throw createError('Payment not found or not pending', 404);
    const updated = await prisma.paymentRequest.update({ where: { id: payment.id }, data: { status: 'APPROVED' } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/bot/payments/:id/reject', async (req, res, next) => {
  try {
    assertBotToken(req);
    const { comment } = req.body as { comment?: string };
    if (!comment || comment.trim().length < 3) throw createError('Comment is required', 400);
    const payment = await prisma.paymentRequest.findUnique({ where: { id: req.params.id } });
    if (!payment || payment.status !== 'PENDING') throw createError('Payment not found or not pending', 404);
    const updated = await prisma.paymentRequest.update({
      where: { id: payment.id },
      data: { status: 'REJECTED', rejectionComment: comment.trim() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/** Solicitudes aprobadas pendientes de marcar como pagadas (ejecutar pago). */
router.get('/bot/approved', async (req, res, next) => {
  try {
    assertBotToken(req);
    const approved = await prisma.paymentRequest.findMany({
      where: { status: 'APPROVED' },
      include: { user: { select: { name: true } } },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    res.json(approved);
  } catch (err) {
    next(err);
  }
});

/**
 * Archivo de evidencia para el proceso del bot (cabecera x-bot-token).
 * Telegram no puede enviar JWT en URLs públicas; el bot descarga aquí y reenvía el buffer.
 */
router.get('/bot/evidence/:id/file', async (req, res, next) => {
  try {
    assertBotToken(req);
    const evidence = await prisma.evidence.findUnique({
      where: { id: req.params.id },
    });
    if (!evidence) throw createError('Evidence not found', 404);

    const s3 = parseS3Uri(evidence.filepath);
    if (s3) {
      if (!isS3Configured()) throw createError('Storage not configured', 500);
      const signed = await getSignedDownloadUrl(s3.key, 3600, s3.bucket);
      return res.redirect(302, signed);
    }

    const abs = localDiskAbsoluteForBot(evidence.filepath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw createError('File not found', 404);
    }

    const ext = path.extname(path.basename(evidence.filepath)).toLowerCase();
    const mimeFromExt: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    const ct = evidence.mimetype || mimeFromExt[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(path.resolve(abs));
  } catch (err) {
    next(err);
  }
});

/** Detalle para el bot: concepto, descripción, evidencias con URLs absolutas. */
router.get('/bot/payments/:id/detail', async (req, res, next) => {
  try {
    assertBotToken(req);
    const payment = await prisma.paymentRequest.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { name: true } },
        evidences: true,
      },
    });
    if (!payment) throw createError('Payment not found', 404);

    const evidences = await Promise.all(
      payment.evidences.map(async (ev) => ({
        id: ev.id,
        filename: ev.filename,
        mimetype: ev.mimetype,
        size: ev.size,
        url: await resolveStoredFileUrlForBot(ev.filepath),
      }))
    );

    res.json({
      id: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency as CurrencyCode,
      concept: payment.concept,
      description: payment.description,
      category: payment.category,
      paymentMethod: payment.paymentMethod,
      paymentMethodDetail: payment.paymentMethodDetail,
      requiredDate: payment.requiredDate,
      status: payment.status,
      user: payment.user,
      evidences,
    });
  } catch (err) {
    next(err);
  }
});

/** Marcar como pagado desde Telegram (holder vinculado). Sin comprobante adjunto; queda registro en auditoría. */
router.post('/bot/payments/:id/mark-paid', async (req, res, next) => {
  try {
    assertBotToken(req);
    const telegramUserId = String((req.body as { telegramUserId?: string })?.telegramUserId || '').trim();
    if (!telegramUserId) throw createError('telegramUserId is required', 400);

    const holder = await getHolderByTelegramId(telegramUserId);
    if (!holder) throw createError('Only linked holders can mark payments as paid', 403);

    const id = req.params.id;
    const existing = await prisma.paymentRequest.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing) throw createError('Payment not found', 404);
    if (existing.status !== 'APPROVED') {
      throw createError('Only APPROVED requests can be marked as PAID', 400);
    }

    const payment = await prisma.paymentRequest.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentProofUrl: null,
        paidAt: new Date(),
        paidBy: holder.id,
      },
      include: { user: true },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_PAYMENT_STATUS_PAID',
        details: `Payment ${id} marked PAID via Telegram bot`,
        userId: holder.id,
        paymentRequestId: id,
      },
    });

    await prisma.paymentTimeline.create({
      data: {
        paymentRequestId: id,
        status: 'PAID',
        comment: 'Marcado como pagado desde Telegram',
        changedBy: holder.id,
      },
    });

    if (payment.user.telegramId) {
      await addTelegramJob({
        chatId: payment.user.telegramId,
        message: 'Tu solicitud de pago ha sido marcada como pagada.',
      });
    }
    await addInAppNotificationJob({
      userId: payment.user.id,
      type: 'PAYMENT_PAID',
      title: 'Solicitud pagada',
      message: `Tu solicitud ${payment.concept} ha sido marcada como pagada.`,
      link: '/payments',
    });

    res.json({ id: payment.id, status: payment.status });
  } catch (err) {
    next(err);
  }
});

export default router;
