import { NextFunction, Request, Response } from 'express';
import prisma from '@paymentflow/database';

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST_WORKER_ID !== undefined;

export const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (isTestEnv && process.env.RUN_INTEGRATION !== 'true') {
    return next();
  }

  if (!AUDITED_METHODS.has(req.method)) {
    return next();
  }

  res.on('finish', () => {
    void prisma.auditLog.create({
      data: {
        action: `${req.method} ${req.path}`,
        details: JSON.stringify({
          route: req.originalUrl,
          statusCode: res.statusCode,
        }),
        userId: req.user?.userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      },
    }).catch((error: unknown) => {
      console.error('Audit log failed:', error);
    });
  });

  next();
};
