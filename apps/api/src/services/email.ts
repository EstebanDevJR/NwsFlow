import { Resend } from 'resend';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { buildEmailHtml } from '../lib/emailLayout.js';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = config.resend.apiKey;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const to = typeof params.to === 'string' ? params.to.trim() : '';
  const from = config.resend.from?.trim();
  const resend = getResend();

  if (!to) {
    logger.warn({ subject: params.subject }, 'Email: destinatario vacío; no se envía');
    return false;
  }

  if (!resend) {
    logger.info({ subject: params.subject }, 'Email: RESEND_API_KEY no configurada; no se envía');
    return false;
  }
  if (!from) {
    logger.warn({ subject: params.subject }, 'Email: RESEND_FROM no configurada; no se envía');
    return false;
  }

  const html =
    params.html ??
    buildEmailHtml({
      heading: params.subject,
      bodyText: params.text,
    });

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: params.subject,
      text: params.text,
      html,
    });

    if (error) {
      logger.warn({ err: error, subject: params.subject, to }, 'Resend: error al enviar');
      return false;
    }

    logger.debug({ id: data?.id, to, subject: params.subject }, 'Email enviado (Resend)');
    return true;
  } catch (err) {
    logger.error({ err, subject: params.subject, to }, 'Resend: excepción al enviar');
    return false;
  }
}
