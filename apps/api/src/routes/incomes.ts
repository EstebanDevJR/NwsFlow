import { Router } from 'express';
import { z } from 'zod';
import prisma from '@paymentflow/database';
import { Prisma } from '@prisma/client';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const createIncomeSchema = z
  .object({
    date: z.string().datetime().or(z.string().date()),
    customerType: z.enum(['CLIENTE', 'DESTACADO', 'RICACHON']),
    paymentMethod: z.enum(['NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'PAYPAL', 'OTRO']),
    paymentMethodOther: z.string().trim().max(120).optional(),
    currency: z.enum(['COP', 'USD']).default('COP'),
    digitalService: z
      .union([z.string(), z.number()])
      .transform((val) => (typeof val === 'number' && Number.isFinite(val) ? String(val) : String(val ?? '').trim()))
      .pipe(
        z.string().regex(/^\d+(\.\d+)?$/, 'La cantidad de servicio digital debe ser numérica'),
      ),
    receivedAmount: z.coerce.number().nonnegative(),
    note: z.string().trim().max(4000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethod === 'OTRO' && !(data.paymentMethodOther ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentMethodOther'],
        message: 'Debes especificar el método cuando seleccionas OTRO',
      });
    }
  });

const incomeFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  customerType: z.enum(['CLIENTE', 'DESTACADO', 'RICACHON']).optional(),
  paymentMethod: z.enum(['NEQUI', 'DAVIPLATA', 'BANCOLOMBIA', 'PAYPAL', 'OTRO']).optional(),
  currency: z.enum(['COP', 'USD']).optional(),
  digitalService: z.string().optional(),
  period: z.enum(['day', 'week', 'month', 'year']).default('day'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

type SummaryRow = {
  bucket: Date;
  quantityTotal: string | number;
  receivedTotal: string | number;
  recordsCount: number;
};

type GroupTotalRow = {
  label: string;
  quantityTotal: string | number;
  receivedTotal: string | number;
  recordsCount: number;
};

function asNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function parseDateFilter(value: string | undefined, fallbackTime: 'start' | 'end'): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (fallbackTime === 'start') d.setHours(0, 0, 0, 0);
  if (fallbackTime === 'end') d.setHours(23, 59, 59, 999);
  return d;
}

function buildWhere(filters: z.infer<typeof incomeFiltersSchema>) {
  const where: Record<string, unknown> = {};
  const from = parseDateFilter(filters.startDate, 'start');
  const to = parseDateFilter(filters.endDate, 'end');
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, Date>).gte = from;
    if (to) (where.date as Record<string, Date>).lte = to;
  }
  if (filters.customerType) where.customerType = filters.customerType;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.currency) where.currency = filters.currency;
  if (filters.digitalService?.trim()) where.digitalService = filters.digitalService.trim();
  return where;
}

router.post('/', requireRole('HOLDER', 'CAJERO'), async (req, res, next) => {
  try {
    const data = createIncomeSchema.parse(req.body);
    const created = await prisma.incomeRecord.create({
      data: {
        date: new Date(data.date),
        customerType: data.customerType,
        paymentMethod: data.paymentMethod,
        paymentMethodOther: data.paymentMethod === 'OTRO' ? data.paymentMethodOther?.trim() : null,
        currency: data.currency,
        digitalService: data.digitalService.trim(),
        soldAmount: 0,
        receivedAmount: data.receivedAmount,
        note: data.note?.trim() || null,
        createdById: req.user!.userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.get('/', requireRole('HOLDER', 'CAJERO'), async (req, res, next) => {
  try {
    const filters = incomeFiltersSchema.parse(req.query);
    const where = buildWhere(filters);
    const skip = (filters.page - 1) * filters.limit;
    const whereSql = Prisma.sql`
      WHERE 1=1
      ${where['date'] ? Prisma.sql`AND "date" >= ${(where['date'] as Record<string, Date>).gte ?? new Date(0)} AND "date" <= ${(where['date'] as Record<string, Date>).lte ?? new Date('9999-12-31')}` : Prisma.empty}
      ${where['customerType'] ? Prisma.sql`AND "customerType" = ${where['customerType'] as string}::"IncomeCustomerType"` : Prisma.empty}
      ${where['paymentMethod'] ? Prisma.sql`AND "paymentMethod" = ${where['paymentMethod'] as string}::"IncomePaymentMethod"` : Prisma.empty}
      ${where['currency'] ? Prisma.sql`AND "currency" = ${where['currency'] as string}::"CurrencyCode"` : Prisma.empty}
      ${where['digitalService'] ? Prisma.sql`AND "digitalService" = ${where['digitalService'] as string}` : Prisma.empty}
    `;

    type QuantityTotalRow = { quantityTotal: string | number };
    const [rows, total, totals, quantityTotals, receivedByCurrencyAgg] = await Promise.all([
      prisma.incomeRecord.findMany({
        where,
        include: { createdBy: { select: { id: true, name: true, role: true } } },
        orderBy: { date: 'desc' },
        skip,
        take: filters.limit,
      }),
      prisma.incomeRecord.count({ where }),
      prisma.incomeRecord.aggregate({ where, _sum: { receivedAmount: true }, _count: { _all: true } }),
      prisma.$queryRaw<QuantityTotalRow[]>(Prisma.sql`
        SELECT COALESCE(SUM(("digitalService")::numeric), 0) AS "quantityTotal"
        FROM "IncomeRecord"
        ${whereSql}
      `),
      prisma.incomeRecord.groupBy({
        by: ['currency'],
        where,
        _sum: { receivedAmount: true },
      }),
    ]);

    const receivedByCurrency: Record<string, number> = {};
    for (const row of receivedByCurrencyAgg) {
      receivedByCurrency[row.currency] = Number(row._sum.receivedAmount ?? 0);
    }

    return res.json({
      data: rows,
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.limit)),
        aggregates: {
          quantityTotal: Number(quantityTotals[0]?.quantityTotal ?? 0),
          receivedTotal: Number(totals._sum.receivedAmount ?? 0),
          receivedByCurrency,
          recordsCount: totals._count._all,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/summary', requireRole('HOLDER', 'CAJERO'), async (req, res, next) => {
  try {
    const filters = incomeFiltersSchema.parse(req.query);
    const where = buildWhere(filters);
    const period = filters.period;
    const whereSql = Prisma.sql`
      WHERE 1=1
      ${where['date'] ? Prisma.sql`AND "date" >= ${(where['date'] as Record<string, Date>).gte ?? new Date(0)} AND "date" <= ${(where['date'] as Record<string, Date>).lte ?? new Date('9999-12-31')}` : Prisma.empty}
      ${where['customerType'] ? Prisma.sql`AND "customerType" = ${where['customerType'] as string}::"IncomeCustomerType"` : Prisma.empty}
      ${where['paymentMethod'] ? Prisma.sql`AND "paymentMethod" = ${where['paymentMethod'] as string}::"IncomePaymentMethod"` : Prisma.empty}
      ${where['currency'] ? Prisma.sql`AND "currency" = ${where['currency'] as string}::"CurrencyCode"` : Prisma.empty}
      ${where['digitalService'] ? Prisma.sql`AND "digitalService" = ${where['digitalService'] as string}` : Prisma.empty}
    `;

    const [totals, timeline, byPaymentMethod, byService, byCustomerType, receivedByCurrencyAgg] = await Promise.all([
      prisma.incomeRecord.aggregate({ where, _sum: { receivedAmount: true }, _count: { _all: true } }),
      prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
        SELECT
          date_trunc(${period}, "date") AS bucket,
          COALESCE(SUM(("digitalService")::numeric), 0) AS "quantityTotal",
          COALESCE(SUM("receivedAmount"), 0) AS "receivedTotal",
          COUNT(*)::int AS "recordsCount"
        FROM "IncomeRecord"
        ${whereSql}
        GROUP BY bucket
        ORDER BY bucket ASC
      `),
      prisma.$queryRaw<GroupTotalRow[]>(Prisma.sql`
        SELECT
          "paymentMethod"::text AS label,
          COALESCE(SUM(("digitalService")::numeric), 0) AS "quantityTotal",
          COALESCE(SUM("receivedAmount"), 0) AS "receivedTotal",
          COUNT(*)::int AS "recordsCount"
        FROM "IncomeRecord"
        ${whereSql}
        GROUP BY "paymentMethod"
        ORDER BY "receivedTotal" DESC
      `),
      prisma.$queryRaw<GroupTotalRow[]>(Prisma.sql`
        SELECT
          "digitalService" AS label,
          COALESCE(SUM(("digitalService")::numeric), 0) AS "quantityTotal",
          COALESCE(SUM("receivedAmount"), 0) AS "receivedTotal",
          COUNT(*)::int AS "recordsCount"
        FROM "IncomeRecord"
        ${whereSql}
        GROUP BY "digitalService"
        ORDER BY "receivedTotal" DESC
      `),
      prisma.$queryRaw<GroupTotalRow[]>(Prisma.sql`
        SELECT
          "customerType"::text AS label,
          COALESCE(SUM(("digitalService")::numeric), 0) AS "quantityTotal",
          COALESCE(SUM("receivedAmount"), 0) AS "receivedTotal",
          COUNT(*)::int AS "recordsCount"
        FROM "IncomeRecord"
        ${whereSql}
        GROUP BY "customerType"
        ORDER BY "receivedTotal" DESC
      `),
      prisma.incomeRecord.groupBy({
        by: ['currency'],
        where,
        _sum: { receivedAmount: true },
      }),
    ]);

    const receivedByCurrency: Record<string, number> = {};
    for (const row of receivedByCurrencyAgg) {
      receivedByCurrency[row.currency] = Number(row._sum.receivedAmount ?? 0);
    }

    return res.json({
      period,
      totals: {
        quantityTotal: timeline.reduce((acc, row) => acc + asNumber(row.quantityTotal), 0),
        receivedTotal: Number(totals._sum.receivedAmount ?? 0),
        receivedByCurrency,
        recordsCount: totals._count._all,
      },
      timeline: timeline.map((row) => ({
        bucket: row.bucket,
        quantityTotal: asNumber(row.quantityTotal),
        receivedTotal: asNumber(row.receivedTotal),
        recordsCount: row.recordsCount,
      })),
      byPaymentMethod: byPaymentMethod.map((row) => ({
        label: row.label,
        quantityTotal: asNumber(row.quantityTotal),
        receivedTotal: asNumber(row.receivedTotal),
        recordsCount: row.recordsCount,
      })),
      byDigitalService: byService.map((row) => ({
        label: row.label,
        quantityTotal: asNumber(row.quantityTotal),
        receivedTotal: asNumber(row.receivedTotal),
        recordsCount: row.recordsCount,
      })),
      byCustomerType: byCustomerType.map((row) => ({
        label: row.label,
        quantityTotal: asNumber(row.quantityTotal),
        receivedTotal: asNumber(row.receivedTotal),
        recordsCount: row.recordsCount,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
