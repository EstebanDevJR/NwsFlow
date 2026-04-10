import type { Request } from 'express';

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, '').trim();
}

/**
 * Optional comma-separated allowlist (e.g. `127.0.0.1,10.0.0.5`).
 * If BOT_INTERNAL_IP_ALLOWLIST is unset, no IP restriction is applied (token-only auth).
 */
export function isBotClientIpAllowed(req: Request): boolean {
  const raw = process.env.BOT_INTERNAL_IP_ALLOWLIST?.trim();
  if (!raw) return true;

  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const client = normalizeIp(req.ip || req.socket.remoteAddress || '');
  if (!client) return false;

  return allowed.some((a) => {
    if (a === client) return true;
    if ((client === '::1' || client === '127.0.0.1') && (a === '127.0.0.1' || a === '::1')) return true;
    return false;
  });
}
