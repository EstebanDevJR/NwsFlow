import { Router } from 'express';
import { z } from 'zod';
import prisma from '@paymentflow/database';
import { requireRole } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { addTelegramJob, addInAppNotificationJob } from '../services/queue.js';
import { processApproval } from '../services/approvals.js';
import { resolveStoredFileUrl } from '../lib/fileUrls.js';
import { formatCurrencyAmount, type CurrencyCode } from '@paymentflow/shared';

const router = Router();
const PAYMENT_REQUEST_COOLDOWN_MS = 3 * 60 * 1000;

const createPaymentSchema = z.object({
  amount: z.coerce.number().positive({ message: 'El monto debe ser un número mayor que 0' }),
  currency: z.enum(['ROBUX', 'COP', 'USD']).default('COP'),
  concept: z.string().trim().min(3, { message: 'El concepto debe tener al menos 3 caracteres' }),
  description: z
    .string()
    .trim()
    .min(10, { message: 'La descripción debe tener al menos 10 caracteres' }),
  category: z.string().trim().min(1, { message: 'Indica una categoría' }),
  paymentMethod: z.enum(['BANK', 'ROBLOX', 'PAYPAL']),
  paymentMethodDetail: z.string().trim().min(3).max(4000),
  requiredDate: z.string().transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return val;
  }),
});

const holderUpdateSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionComment: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'REJECTED') {
      const c = data.rejectionComment?.trim() ?? '';
      if (c.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'rejectionComment is required (min 3 characters) when rejecting',
          path: ['rejectionComment'],
        });
      }
    }
  });

const cajeroUpdateSchema = z.object({
  status: z.literal('PAID'),
  paymentProofUrl: z.string().url(),
});

async function initializePaymentApprovals(paymentId: string, amount: number): Promise<void> {
  const existingCount = await prisma.paymentApproval.count({
    where: { paymentRequestId: paymentId },
  });
  if (existingCount > 0) return;

  const rules = await prisma.approvalRule.findMany({
    where: { isActive: true, minAmount: { lte: amount } },
    orderBy: { minAmount: 'desc' },
  });
  const matchingRule = rules.find((r) => !r.maxAmount || amount <= r.maxAmount.toNumber());
  const approverRoles = matchingRule?.approverRoles?.length ? matchingRule.approverRoles : ['HOLDER'];

  const approvers = await prisma.user.findMany({
    where: { isActive: true, role: { in: approverRoles as Array<'HOLDER' | 'CAJERO'> } },
    select: { id: true },
    take: 20,
  });

  if (approvers.length === 0) {
    throw createError('No active approvers found for this payment amount', 500);
  }

  await prisma.paymentApproval.createMany({
    data: approvers.map((approver) => ({
      paymentRequestId: paymentId,
      approverId: approver.id,
      status: 'PENDING',
    })),
  });
}

function canViewPayment(
  role: string,
  userId: string,
  payment: { userId: string }
): boolean {
  if (role === 'LIDER') return payment.userId === userId;
  if (role === 'HOLDER' || role === 'CAJERO') return true;
  return false;
}

function toPlainAmount(amount: unknown): number {
  if (amount == null) return 0;
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'object' && amount !== null && 'toNumber' in amount && typeof (amount as { toNumber: () => number }).toNumber === 'function') {
    return (amount as { toNumber: () => number }).toNumber();
  }
  return Number(amount);
}

async function serializePaymentForResponse(payment: any, req: any) {
  const evidences = await Promise.all(
    (payment.evidences || []).map(async (evidence: any) => {
      try {
        return {
          ...evidence,
          url: await resolveStoredFileUrl(evidence.filepath, req, 2 * 60 * 60),
        };
      } catch {
        return { ...evidence, url: null };
      }
    })
  );

  let paymentProofUrl: string | null = payment.paymentProofUrl ?? null;
  try {
    const resolved =
      (await resolveStoredFileUrl(payment.paymentProofUrl, req, 2 * 60 * 60)) || payment.paymentProofUrl;
    paymentProofUrl = resolved ?? null;
  } catch {
    /* keep null / original string if resolution fails (e.g. S3 misconfiguration) */
  }

  const amount = toPlainAmount(payment.amount);

  return {
    ...payment,
    amount,
    currency: payment.currency as CurrencyCode,
    paymentProofUrl,
    evidences,
  };
}

router.post('/', requireRole('LIDER'), async (req, res, next) => {
  try {
    const lastRequest = await prisma.paymentRequest.findFirst({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });

    if (lastRequest) {
      const elapsed = Date.now() - lastRequest.createdAt.getTime();
      if (elapsed < PAYMENT_REQUEST_COOLDOWN_MS) {
        const remainingMs = PAYMENT_REQUEST_COOLDOWN_MS - elapsed;
        const remainingTotalSec = Math.ceil(remainingMs / 1000);
        const mins = Math.floor(remainingTotalSec / 60);
        const secs = remainingTotalSec % 60;
        const remainingLabel =
          mins > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`;
        throw createError(
          `Debes esperar ${remainingLabel} antes de crear otra solicitud de pago.`,
          429
        );
      }
    }

    const data = createPaymentSchema.parse(req.body);
    const payment = await prisma.paymentRequest.create({
      data: {
        amount: data.amount,
        currency: data.currency,
        concept: data.concept,
        description: data.description,
        category: data.category,
        paymentMethod: data.paymentMethod,
        paymentMethodDetail: data.paymentMethodDetail.trim(),
        requiredDate: new Date(data.requiredDate),
        userId: req.user!.userId,
      },
      include: { user: true },
    });
    await initializePaymentApprovals(payment.id, payment.amount.toNumber());

    const amountLabel = formatCurrencyAmount(data.amount, data.currency);

    await prisma.auditLog.create({
      data: {
        action: 'CREATE_PAYMENT_REQUEST',
        details: `Payment request created for ${amountLabel}`,
        userId: req.user!.userId,
        paymentRequestId: payment.id,
      },
    });

    const holders = await prisma.user.findMany({
      where: { role: 'HOLDER', isActive: true, telegramId: { not: null } },
    });
    for (const holder of holders) {
      if (holder.telegramId) {
        await addTelegramJob({
          chatId: holder.telegramId,
          message: `Nueva solicitud de pago: ${amountLabel} — ${data.concept}`,
        });
      }
      if (holder.inAppNotifications) {
        await addInAppNotificationJob({
          userId: holder.id,
          type: 'PAYMENT_CREATED',
          title: 'Nueva solicitud de pago',
          message: `Se creó una solicitud de ${data.concept} por ${amountLabel}.`,
          link: '/approvals',
        });
      }
    }

    res.status(201).json(await serializePaymentForResponse(payment, req));
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, category, startDate, endDate, page, limit, q } = req.query;
    const where: Record<string, unknown> = {};

    if (req.user!.role === 'LIDER') {
      where.userId = req.user!.userId;
    }

    if (status) where.status = status;
    if (category) where.category = category;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = new Date(startDate as string);
      if (endDate) (where.createdAt as Record<string, Date>).lte = new Date(endDate as string);
    }
    if (q && typeof q === 'string' && q.trim()) {
      const term = q.trim();
      where.OR = [
        { concept: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
        { paymentMethodDetail: { contains: term, mode: 'insensitive' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(String(limit || '50'), 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [payments, total] = await Promise.all([
      prisma.paymentRequest.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } }, evidences: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.paymentRequest.count({ where }),
    ]);

    const serialized = await Promise.all(
      payments.map((payment) => serializePaymentForResponse(payment, req))
    );

    res.json({
      data: serialized,
      meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', requireRole('HOLDER'), async (req, res, next) => {
  try {
    type StatsRow = {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      total_approved_amount: string | number;
    };
    type CurrencyRow = {
      currency: string;
      amount: string | number;
    };

    const [statsRows, approvedByCurrency] = await Promise.all([
      prisma.$queryRaw<StatsRow[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "status"::text = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE "status"::text = 'APPROVED')::int AS approved,
          COUNT(*) FILTER (WHERE "status"::text = 'REJECTED')::int AS rejected,
          COALESCE(SUM(CASE WHEN "status"::text = 'APPROVED' THEN "amount" ELSE 0 END), 0) AS total_approved_amount
        FROM "PaymentRequest"
      `,
      prisma.$queryRaw<CurrencyRow[]>`
        SELECT
          "currency"::text AS currency,
          COALESCE(SUM("amount"), 0) AS amount
        FROM "PaymentRequest"
        WHERE "status"::text = 'APPROVED'
        GROUP BY "currency"
      `,
    ]);

    const stats = statsRows[0] ?? {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      total_approved_amount: 0,
    };

    const totalApprovedByCurrency: Record<string, number> = {};
    for (const row of approvedByCurrency) {
      totalApprovedByCurrency[row.currency] = Number(row.amount ?? 0);
    }

    res.json({
      total: stats.total,
      pending: stats.pending,
      approved: stats.approved,
      rejected: stats.rejected,
      totalApprovedAmount: Number(stats.total_approved_amount ?? 0),
      totalApprovedByCurrency,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await prisma.paymentRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        evidences: true,
        timeline: { orderBy: { createdAt: 'asc' } },
        approvals: {
          include: {
            approver: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!payment) throw createError('Payment not found', 404);

    if (!canViewPayment(req.user!.role, req.user!.userId, payment)) {
      throw createError('Insufficient permissions', 403);
    }

    res.json(await serializePaymentForResponse(payment, req));
  } catch (err) {
    next(err);
  }
});

router.put(
  '/:id',
  idempotencyMiddleware({ required: false, ttlSeconds: 24 * 60 * 60 }),
  async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = req.user!.role;

    const existing = await prisma.paymentRequest.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing) throw createError('Payment not found', 404);

    if ((req.body as { status?: string })?.status === 'PAID') {
      if (role !== 'CAJERO' && role !== 'HOLDER') {
        throw createError('Insufficient permissions', 403);
      }
      const data = cajeroUpdateSchema.parse(req.body);
      if (existing.status !== 'APPROVED') {
        throw createError('Only APPROVED requests can be marked as PAID', 400);
      }
      const payment = await prisma.paymentRequest.update({
        where: { id },
        data: {
          status: 'PAID',
          paymentProofUrl: data.paymentProofUrl,
          paidAt: new Date(),
          paidBy: req.user!.userId,
        },
        include: { user: true },
      });

      await prisma.auditLog.create({
        data: {
          action: 'UPDATE_PAYMENT_STATUS_PAID',
          details: `Payment ${id} marked PAID with proof URL`,
          userId: req.user!.userId,
          paymentRequestId: id,
        },
      });

      await prisma.paymentTimeline.create({
        data: {
          paymentRequestId: id,
          status: 'PAID',
          comment: data.paymentProofUrl,
          changedBy: req.user!.userId,
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

      return res.json(await serializePaymentForResponse(payment, req));
    }

    if (role === 'HOLDER' || role === 'CAJERO') {
      const data = holderUpdateSchema.parse(req.body);
      if (existing.status !== 'PENDING') {
        throw createError('Only PENDING requests can be approved or rejected', 400);
      }
      await initializePaymentApprovals(id, existing.amount.toNumber());
      const approval = await prisma.paymentApproval.findFirst({
        where: { paymentRequestId: id, approverId: req.user!.userId },
      });
      if (!approval) {
        throw createError('You are not assigned as approver for this payment', 403);
      }
      if (approval.status !== 'PENDING') {
        throw createError('You already processed this approval request', 400);
      }

      const result = await processApproval(
        id,
        req.user!.userId,
        data.status,
        data.rejectionComment?.trim()
      );

      const payment = await prisma.paymentRequest.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!payment) throw createError('Payment not found', 404);

      await prisma.auditLog.create({
        data: {
          action: result.finalized
            ? `UPDATE_PAYMENT_STATUS_${data.status}`
            : 'APPROVAL_RECORDED',
          details: result.finalized
            ? `Payment request ${id} status changed to ${data.status}. Comment: ${data.rejectionComment || 'N/A'}`
            : `Approval recorded for payment request ${id}. Pending approvals: ${result.pendingCount}`,
          userId: req.user!.userId,
          paymentRequestId: id,
        },
      });

      if (result.finalized) {
        if (payment.user.telegramId) {
          const statusMsg =
            data.status === 'APPROVED'
              ? 'aprobada'
              : data.status === 'REJECTED'
                ? 'rechazada'
                : 'actualizada';
          await addTelegramJob({
            chatId: payment.user.telegramId,
            message: `Tu solicitud de pago ha sido ${statusMsg}.`,
          });
        }
        await addInAppNotificationJob({
          userId: payment.user.id,
          type: `PAYMENT_${data.status}`,
          title: data.status === 'APPROVED' ? 'Solicitud aprobada' : 'Solicitud rechazada',
          message:
            data.status === 'APPROVED'
              ? `Tu solicitud ${payment.concept} fue aprobada.`
              : `Tu solicitud ${payment.concept} fue rechazada. ${data.rejectionComment ? `Comentario: ${data.rejectionComment}` : ''}`,
          link: '/payments',
        });
      }

      return res.json(await serializePaymentForResponse({
        ...payment,
        approvalFinalized: result.finalized,
        pendingApprovals: result.pendingCount,
      }, req));
    }

    throw createError('Insufficient permissions', 403);
  } catch (err) {
    next(err);
  }
});

export default router;
