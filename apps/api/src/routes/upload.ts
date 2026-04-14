import { Router, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '@paymentflow/database';
import { requireRole } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { addTelegramJob, addInAppNotificationJob } from '../services/queue.js';
import { uploadFile, deleteFile, isS3Configured, parseS3Uri, getSignedDownloadUrl } from '../lib/s3.js';
import { getPublicBaseUrl, resolveStoredFileUrl } from '../lib/fileUrls.js';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

const AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const avatarUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (AVATAR_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo imágenes JPEG, PNG, WebP o GIF'));
    }
  },
});

function safeUnlink(filepath: string) {
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}

async function persistUploadedFile(
  file: Express.Multer.File,
  folder: string,
  req: Request
): Promise<{ storage: 's3' | 'local'; publicUrl: string; storedPath: string }> {
  if (isS3Configured()) {
    const ext = path.extname(file.originalname).toLowerCase();
    const key = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const body = fs.readFileSync(file.path);
    const storedPath = await uploadFile(key, body, file.mimetype);
    safeUnlink(file.path);
    const publicUrl = (await resolveStoredFileUrl(storedPath, req, 2 * 60 * 60)) || '';
    return { storage: 's3', storedPath, publicUrl };
  }

  const publicBase = getPublicBaseUrl(req);
  /** Ruta canónica en BD: siempre `/uploads/...` para URLs estables entre entornos (disco real en UPLOAD_DIR). */
  const storedPath = `/uploads/${file.filename}`;
  return {
    storage: 'local',
    storedPath,
    publicUrl: `${publicBase}${storedPath}`,
  };
}

/** Resuelve ruta absoluta en disco para archivos guardados como `/uploads/nombre` o rutas legacy. */
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

async function resolveEvidenceRecord(evidence: {
  id: string;
  filename: string;
  filepath: string;
  mimetype: string;
  size: number;
  paymentRequestId: string;
  createdAt: Date;
}, req: Request) {
  const resolvedUrl = await resolveStoredFileUrl(evidence.filepath, req, 2 * 60 * 60);
  return {
    ...evidence,
    url: resolvedUrl,
  };
}

async function assertPaymentEvidenceAccess(
  paymentId: string,
  userId: string,
  role: string,
  requireOwnerPending = false
) {
  const payment = await prisma.paymentRequest.findUnique({ where: { id: paymentId } });
  if (!payment) throw createError('Payment not found', 404);

  if (requireOwnerPending) {
    if (role !== 'LIDER' || payment.userId !== userId) {
      throw createError('Insufficient permissions', 403);
    }
    if (payment.status !== 'PENDING') {
      throw createError('Evidence can only be added while request is PENDING', 400);
    }
    return payment;
  }

  if (role === 'LIDER' && payment.userId !== userId) {
    throw createError('Insufficient permissions', 403);
  }
  if (role !== 'LIDER' && role !== 'HOLDER' && role !== 'CAJERO') {
    throw createError('Insufficient permissions', 403);
  }

  return payment;
}

router.post(
  '/avatar',
  avatarUpload.single('avatar'),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        throw createError('Se requiere un archivo de imagen (avatar)', 400);
      }

      const storageRef = await persistUploadedFile(file, 'avatars', req);

      const user = await prisma.user.update({
        where: { id: req.user!.userId },
        data: { avatar: storageRef.storedPath },
        select: { id: true, email: true, name: true, role: true, avatar: true, telegramId: true, emailNotifications: true, inAppNotifications: true },
      });

      res.json({
        ...user,
        avatar: storageRef.publicUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payment-proof/:paymentId',
  requireRole('HOLDER', 'CAJERO'),
  idempotencyMiddleware({ required: false, ttlSeconds: 24 * 60 * 60 }),
  upload.single('proof'),
  async (req, res, next) => {
    try {
      const { paymentId } = req.params;
      const file = req.file;
      if (!file) {
        throw createError('Se requiere un archivo de comprobante (imagen o PDF)', 400);
      }

      const existing = await prisma.paymentRequest.findUnique({
        where: { id: paymentId },
        include: { user: true },
      });
      if (!existing) throw createError('Payment not found', 404);
      if (existing.status !== 'APPROVED') {
        throw createError('Only APPROVED requests can be marked as PAID', 400);
      }

      const storageRef = await persistUploadedFile(file, 'payment-proofs', req);
      const paymentProofStoredPath = storageRef.storedPath;

      const payment = await prisma.paymentRequest.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          paymentProofUrl: paymentProofStoredPath,
          paidAt: new Date(),
          paidBy: req.user!.userId,
        },
        include: { user: true },
      });

      await prisma.auditLog.create({
        data: {
          action: 'UPDATE_PAYMENT_STATUS_PAID',
          details: `Payment ${paymentId} marked PAID with uploaded proof file`,
          userId: req.user!.userId,
          paymentRequestId: paymentId,
        },
      });

      await prisma.paymentTimeline.create({
        data: {
          paymentRequestId: paymentId,
          status: 'PAID',
          comment: paymentProofStoredPath,
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

      res.json({
        ...payment,
        paymentProofUrl: storageRef.publicUrl || payment.paymentProofUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:paymentId',
  requireRole('LIDER'),
  upload.array('files', 5),
  async (req, res, next) => {
    try {
      const { paymentId } = req.params;
      const files = req.files as Express.Multer.File[];

      await assertPaymentEvidenceAccess(paymentId, req.user!.userId, req.user!.role, true);

      if (!files?.length) {
        throw createError('At least one file is required', 400);
      }

      const evidences = await Promise.all(
        files.map((file) =>
          persistUploadedFile(file, 'evidences', req).then((storageRef) =>
            prisma.evidence.create({
              data: {
                filename: path.basename(file.originalname),
                filepath: storageRef.storedPath,
                mimetype: file.mimetype,
                size: file.size,
                paymentRequestId: paymentId,
              },
            })
          )
        )
      );

      const serialized = await Promise.all(evidences.map((evidence) => resolveEvidenceRecord(evidence, req)));
      res.status(201).json(serialized);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/avatar/url', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { avatar: true },
    });
    if (!user?.avatar) {
      return res.status(404).json({ error: 'Avatar not found' });
    }

    const url = await resolveStoredFileUrl(user.avatar, req, 2 * 60 * 60);
    if (!url) {
      throw createError('Unable to resolve avatar URL', 500);
    }
    res.json({ url, expiresIn: 2 * 60 * 60 });
  } catch (err) {
    next(err);
  }
});

router.get('/evidence/:id/url', async (req, res, next) => {
  try {
    const evidence = await prisma.evidence.findUnique({
      where: { id: req.params.id },
      include: { paymentRequest: true },
    });
    if (!evidence) throw createError('Evidence not found', 404);

    await assertPaymentEvidenceAccess(
      evidence.paymentRequestId,
      req.user!.userId,
      req.user!.role,
      false
    );

    const url = await resolveStoredFileUrl(evidence.filepath, req, 2 * 60 * 60);
    if (!url) throw createError('Unable to resolve evidence URL', 500);
    res.json({ url, expiresIn: 2 * 60 * 60 });
  } catch (err) {
    next(err);
  }
});

/** Archivo binario con sesión (Bearer). Las etiquetas &lt;img&gt; no envían Authorization; el front usa este endpoint. */
router.get('/evidence/:id/file', async (req, res, next) => {
  try {
    const evidence = await prisma.evidence.findUnique({
      where: { id: req.params.id },
      include: { paymentRequest: true },
    });
    if (!evidence) throw createError('Evidence not found', 404);

    await assertPaymentEvidenceAccess(
      evidence.paymentRequestId,
      req.user!.userId,
      req.user!.role,
      false
    );

    const s3 = parseS3Uri(evidence.filepath);
    if (s3) {
      if (!isS3Configured()) throw createError('Storage not configured', 500);
      const signed = await getSignedDownloadUrl(s3.key, 3600, s3.bucket);
      return res.redirect(302, signed);
    }

    const abs = localDiskAbsolute(evidence.filepath);
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
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(path.resolve(abs));
  } catch (err) {
    next(err);
  }
});

router.get('/:paymentId', async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    await assertPaymentEvidenceAccess(paymentId, req.user!.userId, req.user!.role, false);

    const evidences = await prisma.evidence.findMany({
      where: { paymentRequestId: paymentId },
    });
    const serialized = await Promise.all(evidences.map((evidence) => resolveEvidenceRecord(evidence, req)));
    res.json(serialized);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('LIDER', 'HOLDER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const evidence = await prisma.evidence.findUnique({
      where: { id },
      include: { paymentRequest: true },
    });
    if (!evidence) throw createError('Evidence not found', 404);

    const payment = evidence.paymentRequest;
    const role = req.user!.role;

    if (role === 'LIDER') {
      if (payment.userId !== req.user!.userId) {
        throw createError('Insufficient permissions', 403);
      }
      if (payment.status !== 'PENDING') {
        throw createError('Evidence can only be deleted while request is PENDING', 400);
      }
    } else if (role === 'HOLDER') {
      // Holders may remove incorrect uploads during review
    } else {
      throw createError('Insufficient permissions', 403);
    }

    const s3 = parseS3Uri(evidence.filepath);
    if (s3) {
      await deleteFile(s3.key, s3.bucket);
    } else {
      const abs = localDiskAbsolute(evidence.filepath);
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
      }
    }
    await prisma.evidence.delete({ where: { id } });
    res.json({ message: 'Evidence deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
