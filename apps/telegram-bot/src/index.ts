import { Context, Telegraf, Input, Markup } from 'telegraf';
import { config, paymentMethodLabel } from '@paymentflow/shared';
import Redis from 'ioredis';

type ChatSession =
  | { action: 'approve' }
  | { action: 'reject' }
  | { action: 'reject_comment'; paymentId: string }
  | { action: 'create_leader_name' }
  | { action: 'create_leader_email'; name: string }
  | { action: 'create_leader_password'; name: string; email: string }
  | { action: 'toggle_leader' }
  | { action: 'reports_filters' };

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
const SESSION_TTL = 300;

/** Fallback when REDIS_URL is unset: sessions still work for single-process dev. */
const memorySessions = new Map<number, { session: ChatSession; expiresAt: number }>();

async function setBotSession(chatId: number, session: ChatSession) {
  if (redis) {
    await redis.setex(`telegram:bot:session:${chatId}`, SESSION_TTL, JSON.stringify(session));
    return;
  }
  memorySessions.set(chatId, { session, expiresAt: Date.now() + SESSION_TTL * 1000 });
}

async function getBotSession(chatId: number): Promise<ChatSession | null> {
  if (redis) {
    const data = await redis.get(`telegram:bot:session:${chatId}`);
    return data ? JSON.parse(data) : null;
  }
  const entry = memorySessions.get(chatId);
  if (!entry || entry.expiresAt < Date.now()) {
    memorySessions.delete(chatId);
    return null;
  }
  return entry.session;
}

async function deleteBotSession(chatId: number) {
  if (redis) {
    await redis.del(`telegram:bot:session:${chatId}`);
  }
  memorySessions.delete(chatId);
}

const bot = new Telegraf(config.telegramBotToken);
const apiUrl = process.env.BOT_API_URL || process.env.VITE_API_URL || 'http://localhost:3000/api';
const botToken = process.env.BOT_INTERNAL_TOKEN || '';

async function apiRequest<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${endpoint}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(botToken ? { 'x-bot-token': botToken } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `API ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** Descarga binario con token del bot (mejor que URLs firmadas: Telegram rompe a menudo los `&` en enlaces HTML). */
async function fetchEvidenceFileBuffer(evidenceId: string): Promise<Buffer | null> {
  if (!botToken) return null;
  const res = await fetch(`${apiUrl}/telegram/bot/evidence/${encodeURIComponent(evidenceId)}/file`, {
    headers: { 'x-bot-token': botToken },
  });
  if (!res.ok) {
    console.warn(`[telegram-bot] evidence file ${evidenceId}: API ${res.status} ${res.statusText}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

type ResolveResult =
  | { status: 'linked'; name: string }
  | { status: 'needs_pairing'; canPair: boolean; message?: string }
  | { status: 'denied'; message: string };

async function resolveTelegramUser(telegramUserId: number): Promise<ResolveResult> {
  return apiRequest<ResolveResult>('/telegram/bot/resolve', {
    method: 'POST',
    body: JSON.stringify({ telegramUserId: String(telegramUserId) }),
  });
}

/** Texto: usuario sin vincular (antes de /codigo) */
function textPairingGuide(): string {
  return (
    `🔐 <b>Vincula tu Telegram con la plataforma</b>\n\n` +
    `Así sabremos que eres tú cuando apruebes solicitudes desde aquí.\n\n` +
    `<b>Paso 1.</b> Envía <code>/codigo</code> en este chat. Te daré un código de 6 letras o números.\n\n` +
    `<b>Paso 2.</b> Entra en la web, ve a <b>Configuración → Telegram</b>, pega el código y pulsa <b>Validar y emparejar</b>.\n\n` +
    `⏱ El código caduca en unos minutos: si se vence, pide otro con <code>/codigo</code>.\n\n` +
    `🔄 ¿Cambiaste de cuenta de Telegram? Desvincula primero en la web y repite estos pasos.\n\n` +
    `¿Dudas? Escribe <code>/ayuda</code>.`
  );
}

/** Ayuda para usuario ya vinculado (sin duplicar lo mismo en botones vs comandos). */
function textHelpLinked(): string {
  return (
    `📖 <b>Ayuda del bot (Holder/Cajero)</b>\n\n` +
    `Revisa y aprueba solicitudes sin abrir el navegador.\n\n` +
    `<b>Qué hace cada botón</b>\n` +
    `• <b>Resumen general</b> — Pendientes, aprobadas, rechazadas y monto aprobado.\n` +
    `• <b>Ver pendientes</b> — Aprobar o rechazar con un toque por solicitud.\n` +
    `• <b>Ejecutar pago</b> — Solo <b>aprobadas</b>: ver detalle (texto y archivos) y marcar <b>Pagado</b>.\n` +
    `• <b>Aprobar / Rechazar (por ID)</b> — Envía los últimos 6 caracteres del ID.\n` +
    `• <b>Reportes</b> — Totales; puedes filtrar (el formato se indica al abrir).\n` +
    `• <b>Líderes</b> — Listado. Texto: <code>CREAR LIDER</code> o <code>TOGGLE LIDER</code>.\n` +
    `• <b>Historial</b> — Últimas solicitudes.\n` +
    `• <b>Reiniciar menú</b> — Cancela lo que estés haciendo (rechazo, filtros, etc.).\n` +
    `• <b>Ayuda</b> — Este mensaje.\n\n` +
    `<b>Comandos</b> (atajos)\n` +
    `<code>/codigo</code> — Código de vinculación (otra cuenta de Telegram: desvincula antes en la web).\n` +
    `<code>/ejecutar</code> — Mismo listado que «Ejecutar pago».\n` +
    `<code>/cancelar</code> / <code>/reiniciar</code> — Mismo que «Reiniciar menú».\n` +
    `<code>/ayuda</code> — Esto.\n\n` +
    `💡 <i>Evidencias:</i> se envían desde el servidor con tu token de bot. Si falla, abre la solicitud en la web.`
  );
}

const keyboardUnlinked = Markup.inlineKeyboard([
  [Markup.button.callback('📱 Guía paso a paso', 'help_pairing')],
  [Markup.button.callback('❓ Preguntas frecuentes', 'help_main')],
]);

const mainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📊 Resumen general', 'dashboard')],
  [Markup.button.callback('📋 Ver pendientes', 'pending')],
  [Markup.button.callback('💳 Ejecutar pago (aprobados)', 'approved_pay')],
  [
    Markup.button.callback('✅ Aprobar (ID)', 'approve'),
    Markup.button.callback('❌ Rechazar (ID)', 'reject'),
  ],
  [Markup.button.callback('📈 Reportes', 'reports')],
  [Markup.button.callback('👥 Líderes', 'leaders')],
  [Markup.button.callback('📜 Historial', 'history')],
  [Markup.button.callback('🔄 Reiniciar menú', 'reset_flow')],
  [Markup.button.callback('❓ Ayuda', 'help_main')],
]);

async function requireLinkedHolder(ctx: Context): Promise<boolean> {
  if (!ctx.from?.id) return false;
  const res = await resolveTelegramUser(ctx.from.id);
  if (res.status === 'linked') return true;
  if (res.status === 'needs_pairing') {
    await ctx.reply(textPairingGuide(), { parse_mode: 'HTML', ...keyboardUnlinked });
    return false;
  }
  await ctx.reply(
    `🚫 <b>No tienes acceso a este bot</b>\n\n` +
      (res.message ||
        'Tu usuario no está autorizado. Si crees que es un error, habla con quien administra la plataforma.'),
    { parse_mode: 'HTML' }
  );
  return false;
}

bot.command(['help', 'ayuda'], async (ctx) => {
  if (!ctx.from?.id) return;
  const res = await resolveTelegramUser(ctx.from.id);
  if (res.status === 'linked') {
    return ctx.reply(textHelpLinked(), { parse_mode: 'HTML', ...mainKeyboard });
  }
  if (res.status === 'needs_pairing') {
    if (!res.canPair) {
      return ctx.reply(
        `⚠️ ${res.message || 'Por ahora no se puede completar la vinculación. Contacta a un administrador.'}`,
        keyboardUnlinked
      );
    }
    return ctx.reply(textPairingGuide(), { parse_mode: 'HTML', ...keyboardUnlinked });
  }
  return ctx.reply(
    `🚫 ${res.message || 'No tienes acceso. Contacta a un administrador.'}`,
    keyboardUnlinked
  );
});

bot.action('help_pairing', async (ctx) => {
  await ctx.answerCbQuery('Guía de vinculación');
  const res = await resolveTelegramUser(ctx.from!.id);
  if (res.status === 'linked') {
    return ctx.reply(
      `✅ <b>Ya estás vinculado</b>\n\nNo necesitas repetir la vinculación. Usa el menú de abajo para revisar y aprobar solicitudes.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }
  return ctx.reply(textPairingGuide(), { parse_mode: 'HTML', ...keyboardUnlinked });
});

bot.action('help_main', async (ctx) => {
  await ctx.answerCbQuery('Abriendo ayuda…');
  const res = await resolveTelegramUser(ctx.from!.id);
  if (res.status === 'linked') {
    return ctx.reply(textHelpLinked(), { parse_mode: 'HTML', ...mainKeyboard });
  }
  return ctx.reply(
    `<b>Bot de Holders</b>\n\n` +
      `Este bot sirve para que usuarios <b>holder/cajero</b> autorizados aprueben solicitudes y vean información de la plataforma.\n\n` +
      `Primero debes <b>vincular</b> tu Telegram con tu cuenta web. Toca «Guía paso a paso» abajo o escribe <code>/codigo</code>.`,
    { parse_mode: 'HTML', ...keyboardUnlinked }
  );
});

bot.command('codigo', async (ctx) => {
  if (!ctx.from?.id) return;
  const res = await resolveTelegramUser(ctx.from.id);
  if (res.status === 'linked') {
    return ctx.reply(
      `✅ <b>Tu Telegram ya está vinculado</b>\n\n` +
        `No necesitas otro código mientras uses esta cuenta.\n\n` +
        `Si quieres usar <b>otro número o cuenta de Telegram</b>, entra en la web: <b>Configuración → Telegram → Desvincular</b> y luego vuelve aquí con <code>/codigo</code>.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }
  if (res.status === 'denied') {
    return ctx.reply(
      `🚫 <b>No se puede generar un código ahora</b>\n\n${res.message || 'Tu acceso no está permitido. Si necesitas ayuda, contacta a un administrador.'}`,
      { parse_mode: 'HTML', ...keyboardUnlinked }
    );
  }
  try {
    const data = await apiRequest<{ code: string; expiresInSeconds: number }>('/telegram/bot/pending-pair-code', {
      method: 'POST',
      body: JSON.stringify({ telegramUserId: String(ctx.from.id) }),
    });
    const mins = Math.max(1, Math.ceil(data.expiresInSeconds / 60));
    await ctx.reply(
      `🎟 <b>Tu código de vinculación</b>\n\n` +
        `<code>${data.code}</code>\n\n` +
        `⏱ Válido aprox. <b>${mins} min</b>. Cuando caduque, pide otro con <code>/codigo</code>.\n\n` +
        `<b>Qué hacer ahora</b>\n` +
        `1) Copia el código de arriba.\n` +
        `2) En la plataforma web: <b>Configuración → Telegram</b>.\n` +
        `3) Pégalo y pulsa <b>Validar y emparejar</b>.\n\n` +
        `Cuando termines, vuelve aquí y usa <code>/start</code> o los botones: ya podrás aprobar solicitudes.`,
      { parse_mode: 'HTML', ...keyboardUnlinked }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'No pudimos generar el código. Intenta de nuevo en un momento.';
    await ctx.reply(`😕 ${msg}\n\nSi el problema continúa, habla con soporte o con quien administra la plataforma.`, keyboardUnlinked);
  }
});

bot.start(async (ctx) => {
  await deleteBotSession(ctx.from.id);
  if (!ctx.from?.id) return;

  const res = await resolveTelegramUser(ctx.from.id);
  if (res.status === 'linked') {
    return ctx.reply(
      `👋 ¡Hola, <b>${escapeHtml(res.name)}</b>!\n\n` +
        `Tu Telegram está <b>correctamente vinculado</b> con tu cuenta en la plataforma.\n\n` +
        `Elige una opción del menú de abajo o escribe <code>/ayuda</code> cuando lo necesites.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }

  if (res.status === 'needs_pairing') {
    if (!res.canPair) {
      return ctx.reply(
        `⚠️ <b>Vinculación no disponible por ahora</b>\n\n` +
          (res.message ||
            'Ningún holder tiene activado el permiso para vincular Telegram. Habla con un administrador.'),
        { parse_mode: 'HTML', ...keyboardUnlinked }
      );
    }
    return ctx.reply(
      `👋 <b>¡Hola! Soy el asistente para holders y cajeros</b>\n\n` +
        `Para usar el bot primero hay que <b>emparejar</b> este Telegram con tu usuario de la plataforma (solo hace falta una vez, salvo que cambies de cuenta).\n\n` +
        `👇 Toca un botón o envía <code>/codigo</code> para recibir tu clave.`,
      { parse_mode: 'HTML', ...keyboardUnlinked }
    );
  }

  return ctx.reply(
    `🚫 <b>Acceso no disponible</b>\n\n` +
      `Tu usuario no puede usar este bot. Si crees que es un error, contacta a un administrador.`,
    { parse_mode: 'HTML', ...keyboardUnlinked }
  );
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type PendingItem = {
  id: string;
  amount: string | number;
  concept: string;
  user: { name: string };
  createdAt: string;
};

/** Inline actions per row; callback_data max 64 bytes — cuid fits with prefix `a:` / `r:` */
function pendingInlineKeyboard(pending: PendingItem[]) {
  const rows = pending.map((p) => [
    Markup.button.callback(`✅ ${p.id.slice(-6)}`, `a:${p.id}`),
    Markup.button.callback(`❌ Rechazar`, `r:${p.id}`),
  ]);
  rows.push([Markup.button.callback('🏠 Menú principal', 'menu_main')]);
  return Markup.inlineKeyboard(rows);
}

function approvedInlineKeyboard(items: PendingItem[]) {
  const rows = items.map((p) => [
    Markup.button.callback(`👁 ${p.id.slice(-6)}`, `det:${p.id}`),
    Markup.button.callback(`✅ Pagado`, `pay:${p.id}`),
  ]);
  rows.push([Markup.button.callback('🏠 Menú principal', 'menu_main')]);
  return Markup.inlineKeyboard(rows);
}

type PaymentDetail = {
  id: string;
  amount: number;
  concept: string;
  description: string;
  category: string;
  paymentMethod?: string | null;
  paymentMethodDetail?: string | null;
  requiredDate: string;
  status: string;
  user: { name: string };
  /** Aprobaciones en la web (adjuntos se ven ahí si el bot no puede descargarlos). */
  webAppUrl?: string | null;
  evidences: Array<{ id: string; filename: string; mimetype: string; size: number; url: string | null }>;
};

function truncateDesc(s: string, max: number): string {
  if (s.length <= max) return escapeHtml(s);
  return escapeHtml(s.slice(0, max - 1)) + '…';
}

async function sendPaymentDetail(ctx: Context, id: string) {
  const d = await apiRequest<PaymentDetail>(`/telegram/bot/payments/${encodeURIComponent(id)}/detail`);
  const short = d.id.slice(-6);
  const head =
    `📌 <b>Solicitud #${escapeHtml(short)}</b> — ${statusEs(d.status)}\n\n` +
    `💵 <b>Monto:</b> $${Number(d.amount).toFixed(2)}\n` +
    `📂 <b>Categoría:</b> ${escapeHtml(d.category)}\n` +
    `📅 <b>Fecha requerida:</b> ${new Date(d.requiredDate).toLocaleDateString('es')}\n` +
    `👤 <b>Solicitante:</b> ${escapeHtml(d.user.name)}\n\n` +
    `📋 <b>Concepto:</b> ${escapeHtml(d.concept)}\n\n` +
    `📝 <b>Descripción / razón:</b>\n${truncateDesc(d.description, 3500)}` +
    (d.paymentMethod
      ? `\n\n💳 <b>Método de pago:</b> ${escapeHtml(paymentMethodLabel(d.paymentMethod))}` +
        (d.paymentMethodDetail ? `\n📌 <b>Cuenta / destino:</b>\n${truncateDesc(d.paymentMethodDetail, 1200)}` : '')
      : '');

  const footerLine =
    `Cuando hayas hecho la transferencia, vuelve a <b>Ejecutar pago</b> y pulsa <b>Pagado</b> en esta solicitud.`;

  /** Sin teclado en mensajes intermedios: un solo menú al final (evita repetir el menú por cada bloque). */
  if (d.evidences.length === 0) {
    await ctx.reply(
      head + `\n\n📎 <i>No hay archivos adjuntos.</i>\n\n` + footerLine,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
    return;
  }

  await ctx.reply(head, { parse_mode: 'HTML' });

  for (const ev of d.evidences) {
    const cap = `${escapeHtml(ev.filename)} · ${escapeHtml(ev.mimetype)}`;
    const buf = await fetchEvidenceFileBuffer(ev.id);
    if (!buf || buf.length === 0) {
      const webHint = d.webAppUrl
        ? `\n<i>Adjuntos:</i> <a href="${escapeHtml(d.webAppUrl)}">Abrir aprobaciones en la web</a>`
        : '';
      await ctx.reply(
        `📎 <b>${escapeHtml(ev.filename)}</b>\n<i>No se pudo descargar el archivo desde la API.</i>${webHint}`,
        { parse_mode: 'HTML' }
      );
      // Enlaces con muchos query params fallan en &lt;a href&gt; por entidades &amp; en clientes Telegram; mensaje aparte sin HTML.
      if (ev.url) {
        await ctx.reply(`Enlace directo (abre en el navegador):\n${ev.url}`);
      }
      continue;
    }
    if (ev.mimetype.startsWith('image/')) {
      try {
        await ctx.replyWithPhoto(Input.fromBuffer(buf, ev.filename), { caption: cap, parse_mode: 'HTML' });
      } catch {
        await ctx.reply(
          `📎 <b>${escapeHtml(ev.filename)}</b> (imagen)\n<i>Telegram rechazó el archivo. Prueba desde la web.</i>`,
          { parse_mode: 'HTML' }
        );
      }
    } else {
      try {
        await ctx.replyWithDocument(Input.fromBuffer(buf, ev.filename), { caption: cap, parse_mode: 'HTML' });
      } catch {
        await ctx.reply(
          `📎 <b>${escapeHtml(ev.filename)}</b>\n<i>No se pudo enviar como documento. Abre la solicitud en la web.</i>`,
          { parse_mode: 'HTML' }
        );
      }
    }
  }

  await ctx.reply(`📎 <b>Evidencias enviadas.</b>\n\n${footerLine}`, { parse_mode: 'HTML', ...mainKeyboard });
}

async function replyApprovedList(ctx: Context) {
  const list = await apiRequest<PendingItem[]>('/telegram/bot/approved');
  if (list.length === 0) {
    return ctx.reply(
      `✨ <b>Nada por ejecutar</b>\n\nNo hay solicitudes <b>aprobadas</b> esperando pago. Cuando apruebes una, aparecerá aquí.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }

  let message =
    `💳 <b>Ejecutar pago</b>\n\n` +
    `Solicitudes <b>aprobadas</b> pendientes de ejecutar:\n` +
    `• <b>👁</b> — Ver detalle y adjuntos · <b>Pagado</b> — Marcar que ya pagaste al líder.\n\n`;
  for (const p of list) {
    message += `────────────\n`;
    message += `🔹 <code>#${escapeHtml(p.id.slice(-6))}</code> · $${Number(p.amount)}\n`;
    message += `📝 ${escapeHtml(p.concept)}\n`;
    message += `👤 ${escapeHtml(p.user.name)}\n\n`;
  }

  await ctx.reply(message, { parse_mode: 'HTML', ...approvedInlineKeyboard(list) });
}

function statusEs(status: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendiente',
    APPROVED: 'Aprobada',
    REJECTED: 'Rechazada',
    PAID: 'Pagada',
  };
  return m[status] || status;
}

bot.action('dashboard', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Listo');

  const data = await apiRequest<{ pending: number; approved: number; rejected: number; totalApproved: number }>(
    '/telegram/bot/dashboard'
  );

  ctx.reply(
    `📊 <b>Resumen general</b>\n\n` +
      `Aquí tienes un vistazo rápido de las solicitudes en el sistema.\n\n` +
      `⏳ <b>Pendientes de revisión:</b> ${data.pending}\n` +
      `✅ <b>Aprobadas:</b> ${data.approved}\n` +
      `❌ <b>Rechazadas:</b> ${data.rejected}\n` +
      `💰 <b>Total monto aprobado:</b> $${data.totalApproved.toFixed(2)}\n\n` +
      `💡 Usa el menú inferior para revisar pendientes o ejecutar pagos.`,
    { parse_mode: 'HTML', ...mainKeyboard }
  );
});

bot.action('pending', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Cargando lista');

  const pending = await apiRequest<PendingItem[]>('/telegram/bot/pending');

  if (pending.length === 0) {
    return ctx.reply(
      `✨ <b>¡Todo al día!</b>\n\nNo hay solicitudes pendientes en este momento. Cuando lleguen nuevas, aparecerán aquí.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }

  let message =
    `📋 <b>Solicitudes pendientes</b>\n\n` +
    `Usa los botones de cada fila: <b>✅</b> aprueba al instante; <b>❌ Rechazar</b> te pedirá un motivo breve.\n\n`;
  for (const p of pending) {
    message += `────────────\n`;
    message += `🔹 <code>#${escapeHtml(p.id.slice(-6))}</code> · $${Number(p.amount)}\n`;
    message += `📝 ${escapeHtml(p.concept)}\n`;
    message += `👤 ${escapeHtml(p.user.name)}\n`;
    message += `📅 ${new Date(p.createdAt).toLocaleDateString('es')}\n\n`;
  }
  message += `👇 <b>Acciones</b> (abajo). También puedes usar <b>Aprobar (ID)</b> / <b>Rechazar (ID)</b> en el menú si prefieres escribir el ID.`;

  ctx.reply(message, { parse_mode: 'HTML', ...pendingInlineKeyboard(pending) });
});

bot.action('menu_main', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Menú');
  await ctx.reply(`👇 <b>Menú principal</b>\n\nElige una opción:`, { parse_mode: 'HTML', ...mainKeyboard });
});

bot.action('reset_flow', async (ctx) => {
  if (!ctx.from?.id) return;
  await ctx.answerCbQuery('Reiniciado');
  await deleteBotSession(ctx.from.id);
  const res = await resolveTelegramUser(ctx.from.id);
  if (res.status === 'linked') {
    return ctx.reply(
      `🔄 <b>Menú reiniciado</b>\n\n` +
        `Si estabas a mitad de un rechazo, filtros de reportes o alta de líder, ya puedes empezar de nuevo.\n\n` +
        `<i>Para borrar los mensajes de este chat en Telegram, abre el menú del chat (⋮) → <b>Borrar historial</b>. El bot no puede vaciar el chat por ti.</i>`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }
  if (res.status === 'needs_pairing') {
    if (!res.canPair) {
      return ctx.reply(`⚠️ ${res.message || 'Por ahora no se puede completar la vinculación.'}`, keyboardUnlinked);
    }
    return ctx.reply(textPairingGuide(), { parse_mode: 'HTML', ...keyboardUnlinked });
  }
  return ctx.reply(`🚫 ${res.message || 'No tienes acceso.'}`, keyboardUnlinked);
});

bot.command(['cancelar', 'reiniciar'], async (ctx) => {
  if (!ctx.from?.id) return;
  await deleteBotSession(ctx.from.id);
  const res = await resolveTelegramUser(ctx.from.id);
  if (res.status === 'linked') {
    return ctx.reply(
      `🔄 <b>Listo</b>\n\n` +
        `Sesión reiniciada. Elige una opción abajo.\n\n` +
        `<i>Para borrar el historial visible del chat: menú del chat (⋮) → Borrar historial.</i>`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }
  if (res.status === 'needs_pairing') {
    if (!res.canPair) {
      return ctx.reply(`⚠️ ${res.message || 'Por ahora no se puede completar la vinculación.'}`, keyboardUnlinked);
    }
    return ctx.reply(textPairingGuide(), { parse_mode: 'HTML', ...keyboardUnlinked });
  }
  return ctx.reply(`🚫 ${res.message || 'No tienes acceso.'}`, keyboardUnlinked);
});

bot.action(/^a:(.+)$/, async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  const id = ctx.match![1];
  await ctx.answerCbQuery('Aprobando…');
  await deleteBotSession(ctx.from!.id);
  try {
    await apiRequest(`/telegram/bot/payments/${id}/approve`, { method: 'POST' });
    await ctx.reply(
      `✅ <b>Listo</b>\n\nLa solicitud <code>#${escapeHtml(id.slice(-6))}</code> quedó <b>aprobada</b>.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    await ctx.reply(
      `😕 <b>No se pudo aprobar</b>\n\n${escapeHtml(msg)}\n\n` +
        `Suele pasar si la solicitud ya fue aprobada o rechazada. Pulsa <b>Ver pendientes</b> para ver el estado actual.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }
});

bot.action(/^r:(.+)$/, async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  const id = ctx.match![1];
  await ctx.answerCbQuery();
  const pending = await apiRequest<Array<{ id: string }>>('/telegram/bot/pending');
  const payment = pending.find((p) => p.id === id);
  if (!payment) {
    return ctx.reply(
      `😕 <b>Esa solicitud ya no está pendiente</b>\n\n` +
        `Puede haber sido respondida por otro medio. Usa <b>Ver pendientes</b> para la lista actual.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }
  await setBotSession(ctx.from!.id, { action: 'reject_comment', paymentId: id });
  await ctx.reply(
    `📝 <b>Motivo del rechazo</b>\n\n` +
      `Para <code>#${escapeHtml(id.slice(-6))}</code> — escribe un comentario (mínimo 3 caracteres).\n` +
      `Ejemplo: «Falta justificación del gasto».\n\n` +
      `Para salir sin rechazar: <code>/cancelar</code> o <b>Reiniciar menú</b>.`,
    { parse_mode: 'HTML', ...mainKeyboard }
  );
});

bot.action('approved_pay', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Cargando…');
  await replyApprovedList(ctx);
});

bot.command('ejecutar', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await replyApprovedList(ctx);
});

bot.action(/^det:(.+)$/, async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  const id = ctx.match![1];
  await ctx.answerCbQuery('Abriendo…');
  try {
    await sendPaymentDetail(ctx, id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    await ctx.reply(`😕 ${escapeHtml(msg)}`, { parse_mode: 'HTML', ...mainKeyboard });
  }
});

bot.action(/^pay:(.+)$/, async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  const id = ctx.match![1];
  await ctx.answerCbQuery('Registrando…');
  try {
    await apiRequest(`/telegram/bot/payments/${id}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify({ telegramUserId: String(ctx.from!.id) }),
    });
    await ctx.reply(
      `👍 <b>Pago registrado</b>\n\nLa solicitud <code>#${escapeHtml(id.slice(-6))}</code> quedó como <b>Pagada</b>.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    await ctx.reply(
      `😕 <b>No se pudo marcar como pagada</b>\n\n${escapeHtml(msg)}\n\n` +
        `Suele pasar si ya estaba pagada o aún no está aprobada. Actualiza con <b>Ejecutar pago</b>.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }
});

bot.action('approve', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Escribe el ID');
  await setBotSession(ctx.from!.id, { action: 'approve' });
  ctx.reply(
    `✅ <b>Aprobar por ID (opcional)</b>\n\n` +
      `Lo más fácil es <b>Ver pendientes</b> y tocar el botón verde de la fila.\n\n` +
      `Si prefieres escribir, envía solo los <b>últimos 6 caracteres</b> del ID (como en la lista).\n` +
      `Ejemplo: <code>x7K2m9</code>\n\n` +
      `Si no pasa nada, comprueba que escribiste bien o usa <code>/cancelar</code>.`,
    { parse_mode: 'HTML', ...mainKeyboard }
  );
});

bot.action('reject', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Escribe el ID');
  await setBotSession(ctx.from!.id, { action: 'reject' });
  ctx.reply(
    `❌ <b>Rechazar por ID (opcional)</b>\n\n` +
      `Lo más fácil es <b>Ver pendientes</b> y tocar <b>❌ Rechazar</b> en la fila; luego escribes el motivo.\n\n` +
      `Modo manual: envía los <b>últimos 6 caracteres</b> del ID y después el comentario cuando te lo pida.`,
    { parse_mode: 'HTML', ...mainKeyboard }
  );
});

bot.action('reports', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Listo');

  const stats = await apiRequest<{ total: number; pending: number; approved: number; rejected: number; paid: number }>(
    '/telegram/bot/reports'
  );

  ctx.reply(
    `📈 <b>Reportes</b>\n\n` +
      `Números globales de solicitudes:\n\n` +
      `📊 Total: <b>${stats.total}</b>\n` +
      `⏳ Pendientes: <b>${stats.pending}</b>\n` +
      `✅ Aprobadas: <b>${stats.approved}</b>\n` +
      `❌ Rechazadas: <b>${stats.rejected}</b>\n` +
      `💵 Pagadas: <b>${stats.paid}</b>\n\n` +
      `<b>Filtros (opcional)</b>\n` +
      `Envía una línea con pares <code>clave=valor</code> separados por espacio, por ejemplo:\n` +
      `<code>status=APPROVED category=Servicios startDate=2026-01-01 endDate=2026-12-31</code>\n\n` +
      `Así verás totales solo para ese criterio.`,
    { parse_mode: 'HTML', ...mainKeyboard }
  );
  await setBotSession(ctx.from!.id, { action: 'reports_filters' });
});

bot.action('leaders', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Listo');

  const leaders = await apiRequest<Array<{ id: string; name: string; email: string; isActive: boolean }>>('/telegram/bot/leaders');

  if (leaders.length === 0) {
    return ctx.reply(
      `👥 <b>Líderes</b>\n\nTodavía no hay líderes registrados. Cuando los crees desde la plataforma, aparecerán aquí.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }

  let message = `👥 <b>Líderes en la plataforma</b>\n\n`;
  for (const l of leaders) {
    message += `• <b>${escapeHtml(l.name)}</b>\n`;
    message += `  📧 ${escapeHtml(l.email)}\n`;
    message += `  ${l.isActive ? '✅ Activo' : '⏸ Inactivo'}\n\n`;
  }

  message +=
    `<b>Comandos por texto</b> (responden en este chat):\n` +
    `• <code>CREAR LIDER</code> — Alta de un líder paso a paso.\n` +
    `• <code>TOGGLE LIDER</code> — Activa o desactiva un líder (te pediré su ID completo).`;

  ctx.reply(message, { parse_mode: 'HTML', ...mainKeyboard });
});

bot.action('history', async (ctx) => {
  if (!(await requireLinkedHolder(ctx))) return;
  await ctx.answerCbQuery('Cargando');

  const recent = await apiRequest<{
    data: Array<{ id: string; amount: string | number; concept: string; user: { name: string }; status: string; createdAt: string }>;
    meta: { page: number; totalPages: number };
  }>('/telegram/bot/history?page=1');

  if (recent.data.length === 0) {
    return ctx.reply(
      `📜 <b>Historial</b>\n\nAún no hay movimientos para mostrar en esta vista.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }

  let message = `📜 <b>Últimas solicitudes</b>\n\n`;
  for (const p of recent.data) {
    const statusEmoji =
      p.status === 'PENDING' ? '⏳' : p.status === 'APPROVED' ? '✅' : p.status === 'REJECTED' ? '❌' : '💵';
    message += `${statusEmoji} <code>#${escapeHtml(p.id.slice(-6))}</code> · $${Number(p.amount)} · ${escapeHtml(p.concept)}\n`;
    message += `👤 ${escapeHtml(p.user.name)} · ${statusEs(p.status)}\n`;
    message += `📅 ${new Date(p.createdAt).toLocaleDateString('es')}\n\n`;
  }
  message += `📄 Página ${recent.meta.page} de ${recent.meta.totalPages}`;
  ctx.reply(message, { parse_mode: 'HTML', ...mainKeyboard });
});

bot.on('message', async (ctx) => {
  if (!ctx.message || !('text' in ctx.message)) return;
  const text0 = ctx.message.text.trim();
  if (text0.startsWith('/')) return;

  if (!(await requireLinkedHolder(ctx))) return;

  const chatId = ctx.from.id;
  const state = await getBotSession(chatId);
  const text = ctx.message.text.trim();

  if (text.toUpperCase() === 'CREAR LIDER') {
    await setBotSession(chatId, { action: 'create_leader_name' });
    await ctx.reply(
      `👤 <b>Alta de nuevo líder</b>\n\n` +
        `Te iré pidiendo los datos en orden: nombre, correo y contraseña temporal.\n\n` +
        `¿Cómo se llama el líder? (nombre completo o como quieras que aparezca)`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
    return;
  }
  if (text.toUpperCase() === 'TOGGLE LIDER') {
    await setBotSession(chatId, { action: 'toggle_leader' });
    await ctx.reply(
      `⏸ <b>Activar o desactivar líder</b>\n\n` +
        `Pega aquí el <b>ID completo</b> del líder (el que ves en la plataforma, no solo los últimos 6 caracteres).\n\n` +
        `Si un líder está inactivo, no podrá iniciar sesión hasta que lo reactives.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
    return;
  }

  if (!state) {
    const t = text0.toLowerCase();
    if (/^(hola|hi|hey|buenas|buenos|ayuda|help)\b/i.test(t) || t === '?' || t === 'hola') {
      await ctx.reply(
        `👋 ¿Necesitas algo?\n\n` +
          `Toca un botón del menú o escribe <code>/ayuda</code> para ver todas las opciones.`,
        { parse_mode: 'HTML', ...mainKeyboard }
      );
    }
    return;
  }

  if (state.action === 'approve') {
    const pending = await apiRequest<Array<{ id: string }>>('/telegram/bot/pending');
    const payment = pending.find((p) => p.id.endsWith(text));

    await deleteBotSession(chatId);

    if (payment) {
      await apiRequest(`/telegram/bot/payments/${payment.id}/approve`, { method: 'POST' });
      ctx.reply(
        `✅ <b>Listo</b>\n\nLa solicitud <code>#${escapeHtml(payment.id.slice(-6))}</code> quedó <b>aprobada</b>.`,
        { parse_mode: 'HTML', ...mainKeyboard }
      );
    } else {
      ctx.reply(
        `😕 <b>No encontré esa solicitud</b>\n\n` +
          `Revisa que los últimos 6 caracteres del ID sean correctos y que la solicitud siga <b>pendiente</b>. ` +
          `Si ya fue procesada, no volverá a aparecer.`,
        { parse_mode: 'HTML', ...mainKeyboard }
      );
    }
    return;
  }

  if (state.action === 'reject') {
    const pending = await apiRequest<Array<{ id: string }>>('/telegram/bot/pending');
    const payment = pending.find((p) => p.id.endsWith(text));

    if (payment) {
      await setBotSession(chatId, { action: 'reject_comment', paymentId: payment.id });
      ctx.reply(
        `📝 <b>Motivo del rechazo</b>\n\n` +
          `Escribe un comentario claro para <code>#${escapeHtml(payment.id.slice(-6))}</code> (mínimo 3 caracteres).\n` +
          `Ejemplo: «Falta justificación del gasto» o «Duplicada con otra solicitud».`,
        { parse_mode: 'HTML', ...mainKeyboard }
      );
    } else {
      await deleteBotSession(chatId);
      ctx.reply(
        `😕 <b>No encontré esa solicitud</b>\n\n` +
          `Comprueba el ID o vuelve a abrir <b>Rechazar</b> desde el menú.`,
        { parse_mode: 'HTML', ...mainKeyboard }
      );
    }
    return;
  }

  if (state.action === 'reject_comment') {
    if (text.length < 3) {
      ctx.reply(
        `⚠️ El comentario es muy corto. Escribe al menos <b>3 caracteres</b> para que el equipo entienda el motivo.`,
        { parse_mode: 'HTML', ...mainKeyboard }
      );
      return;
    }

    await deleteBotSession(chatId);
    await apiRequest(`/telegram/bot/payments/${state.paymentId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment: text }),
    });
    ctx.reply(
      `❌ <b>Solicitud rechazada</b>\n\n` +
        `ID: <code>#${escapeHtml(state.paymentId.slice(-6))}</code>\n` +
        `Motivo registrado: ${escapeHtml(text)}`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
    return;
  }

  if (state.action === 'create_leader_name') {
    await setBotSession(chatId, { action: 'create_leader_email', name: text });
    await ctx.reply(
      `📧 Ahora envía el <b>correo electrónico</b> que usará el líder para entrar a la plataforma.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
    return;
  }

  if (state.action === 'create_leader_email') {
    await setBotSession(chatId, { action: 'create_leader_password', name: state.name, email: text });
    await ctx.reply(
      `🔑 Por último, una <b>contraseña temporal</b> (mínimo 6 caracteres). ` +
        `El líder podrá cambiarla después al iniciar sesión.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
    return;
  }

  if (state.action === 'create_leader_password') {
    await apiRequest('/telegram/bot/leaders', {
      method: 'POST',
      body: JSON.stringify({ name: state.name, email: state.email, password: text }),
    });
    await deleteBotSession(chatId);
    await ctx.reply(
      `✅ <b>Líder creado</b>\n\n` +
        `Ya puede iniciar sesión con el correo y la contraseña que indicaste. ` +
        `Recuérdale cambiar la contraseña si hace falta.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
    return;
  }

  if (state.action === 'toggle_leader') {
    await apiRequest(`/telegram/bot/leaders/${text}/toggle`, { method: 'PATCH' });
    await deleteBotSession(chatId);
    await ctx.reply(
      `✅ <b>Estado actualizado</b>\n\nEl líder con ese ID cambió entre activo e inactivo.`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
    return;
  }

  if (state.action === 'reports_filters') {
    const params = new URLSearchParams();
    text.split(' ').forEach((kv) => {
      const [k, v] = kv.split('=');
      if (k && v) params.append(k, v);
    });
    const report = await apiRequest<{ total: number; pending: number; approved: number; rejected: number; paid: number }>(
      `/telegram/bot/reports?${params.toString()}`
    );
    await deleteBotSession(chatId);
    await ctx.reply(
      `📈 <b>Reporte con filtros</b>\n\n` +
        `📊 Total: ${report.total}\n` +
        `⏳ Pendientes: ${report.pending}\n` +
        `✅ Aprobadas: ${report.approved}\n` +
        `❌ Rechazadas: ${report.rejected}\n` +
        `💵 Pagadas: ${report.paid}`,
      { parse_mode: 'HTML', ...mainKeyboard }
    );
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
const webhookPort = parseInt(process.env.TELEGRAM_WEBHOOK_PORT || '8443', 10);

if (webhookUrl) {
  // Production: use webhooks for efficiency and reliability
  bot.launch({
    webhook: {
      domain: webhookUrl,
      port: webhookPort,
    },
  });
  console.log(`Telegram bot started with webhook at ${webhookUrl} (port ${webhookPort})`);
} else {
  // Development: use long polling
  bot.launch();
  console.log('Telegram bot started with long polling (dev mode)...');
}
