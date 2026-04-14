import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '@paymentflow/database';
import { createError } from '../middleware/errorHandler.js';
import { requireRole } from '../middleware/auth.js';
import { deleteFile, isS3Configured, parseS3Uri } from '../lib/s3.js';

const router = Router();

const PURGE_CONFIRM_PHRASE = 'BORRAR TODAS LAS SOLICITUDES';

const uploadDir = process.env.UPLOAD_DIR || 'uploads';

function localDiskAbsolute(storedPath: string): string {
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

/**
 * Elimina todas las solicitudes de pago (cualquier estado), evidencias en disco/S3,
 * registros de auditoría vinculados y notificaciones de tipo PAYMENT_*.
 * Solo HOLDER; requiere frase exacta (doble verificación en el cliente recomendada).
 */
router.post('/purge-payment-requests', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const phrase = String((req.body as { confirmPhrase?: string })?.confirmPhrase || '').trim();
    if (phrase !== PURGE_CONFIRM_PHRASE) {
      throw createError(
        `Frase incorrecta. Debes escribir exactamente: ${PURGE_CONFIRM_PHRASE}`,
        400
      );
    }

    const allEvidences = await prisma.evidence.findMany({
      select: { id: true, filepath: true },
    });

    for (const ev of allEvidences) {
      const s3 = parseS3Uri(ev.filepath);
      if (s3) {
        if (isS3Configured()) {
          await deleteFile(s3.key, s3.bucket).catch(() => {});
        }
      } else {
        const abs = localDiskAbsolute(ev.filepath);
        try {
          if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            fs.unlinkSync(abs);
          }
        } catch {
          /* ignore */
        }
      }
    }

    await prisma.auditLog.deleteMany({
      where: { paymentRequestId: { not: null } },
    });

    await prisma.notification.deleteMany({
      where: { type: { startsWith: 'PAYMENT_' } },
    });

    const deleted = await prisma.paymentRequest.deleteMany({});

    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_PURGE_PAYMENT_REQUESTS',
        details: `Eliminación masiva de solicitudes de pago (${deleted.count} registros) por holder ${req.user!.userId}`,
        userId: req.user!.userId,
      },
    });

    res.json({
      ok: true,
      deletedPaymentRequests: deleted.count,
      evidencesRemoved: allEvidences.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
