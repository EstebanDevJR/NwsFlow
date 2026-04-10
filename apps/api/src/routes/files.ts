import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { verifyLocalUploadUrl } from '../lib/localUploadSignature.js';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || 'uploads';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

router.get('/local', (req, res) => {
  const f = String(req.query.f || '');
  const exp = parseInt(String(req.query.exp || ''), 10);
  const sig = String(req.query.sig || '');

  if (f.includes('..') || f.includes('/') || f.includes('\\')) {
    return res.status(400).json({ error: 'Invalid file parameter' });
  }
  const basename = path.basename(f);
  if (!basename) {
    return res.status(400).json({ error: 'Invalid file parameter' });
  }

  if (!Number.isFinite(exp) || !verifyLocalUploadUrl(basename, exp, sig)) {
    return res.status(403).json({ error: 'Invalid or expired link' });
  }

  const abs = path.join(uploadDir, basename);
  const resolvedUpload = path.resolve(uploadDir);
  if (!abs.startsWith(resolvedUpload + path.sep) && abs !== resolvedUpload) {
    return res.status(403).end();
  }

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return res.status(404).json({ error: 'Not found' });
  }

  const ext = path.extname(basename).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.sendFile(path.resolve(abs));
});

export default router;
