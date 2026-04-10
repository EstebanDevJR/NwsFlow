import { config } from '@paymentflow/shared';
import { logger } from '../lib/logger.js';

/** Escapa texto de usuario para parse_mode HTML de Telegram. */
export function escapeTelegramHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface TelegramSendMessagePayload {
  chat_id: string | number;
  text: string;
  parse_mode?: 'HTML';
  reply_markup?: unknown;
  disable_web_page_preview?: boolean;
}

/** Quita etiquetas HTML y decodifica entidades básicas para reintento si Telegram rechaza el parse_mode HTML. */
function htmlToPlainFallback(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function normalizeChatId(chatId: string): string | number {
  const t = String(chatId).trim();
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n)) return n;
  }
  return t;
}

/**
 * Envía mensaje al bot de Telegram (HTTP directo a api.telegram.org).
 * Registra errores de la API; si falla el HTML por entidades inválidas, reintenta en texto plano.
 */
export const sendTelegramNotification = async (
  chatId: string,
  message: string,
  replyMarkup?: unknown,
  opts?: { plainText?: boolean }
): Promise<boolean> => {
  if (!config.telegramBotToken) {
    logger.warn('Telegram: TELEGRAM_BOT_TOKEN no configurado; no se envía mensaje');
    return false;
  }

  const chat = normalizeChatId(chatId);

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;

  const buildPayload = (plain: boolean): TelegramSendMessagePayload => {
    const payload: TelegramSendMessagePayload = {
      chat_id: chat,
      text: plain ? htmlToPlainFallback(message) : message,
      disable_web_page_preview: true,
    };
    if (!plain) payload.parse_mode = 'HTML';
    if (replyMarkup) payload.reply_markup = replyMarkup;
    return payload;
  };

  const doFetch = async (plain: boolean): Promise<{ ok: boolean; data: unknown }> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(plain)),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, data };
  };

  try {
    if (opts?.plainText) {
      const { ok, data } = await doFetch(true);
      if (!ok) {
        logger.warn({ telegram: data, chatId: String(chat) }, 'Telegram sendMessage (plain) failed');
      }
      return ok;
    }

    const first = await doFetch(false);
    if (first.ok) return true;

    const desc =
      first.data && typeof first.data === 'object' && 'description' in first.data
        ? String((first.data as { description?: string }).description)
        : '';
    logger.warn({ telegram: first.data, chatId: String(chat) }, 'Telegram sendMessage failed');

    const parseEntityError = /parse entities|can't parse|entities|parse mode/i.test(desc);

    if (parseEntityError) {
      logger.info({ chatId: String(chat) }, 'Telegram: reintentando sin HTML (entidades inválidas)');
      const second = await doFetch(true);
      if (!second.ok) {
        logger.warn({ telegram: second.data, chatId: String(chat) }, 'Telegram sendMessage plain retry failed');
      }
      return second.ok;
    }

    return false;
  } catch (error) {
    logger.error({ err: error, chatId: String(chat) }, 'Telegram notification fetch error');
    return false;
  }
};

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  if (!config.telegramBotToken) return false;
  try {
    const url = `https://api.telegram.org/bot${config.telegramBotToken}/answerCallbackQuery`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text?.slice(0, 200),
        show_alert: false,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const setTelegramWebhook = async (webhookUrl: string): Promise<boolean> => {
  if (!config.telegramBotToken) return false;

  try {
    const url = `https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });
    return response.ok;
  } catch (error) {
    logger.error({ err: error }, 'Failed to set Telegram webhook');
    return false;
  }
};
