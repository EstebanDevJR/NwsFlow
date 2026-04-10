/**
 * Plantillas HTML para correos transaccionales (tablas + estilos inline para clientes típicos).
 */

const BRAND = {
  teal: '#0f766e',
  tealDark: '#0d9488',
  slate900: '#0f172a',
  slate600: '#475569',
  slate500: '#64748b',
  slate100: '#f1f5f9',
  white: '#ffffff',
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convierte texto plano a bloques con saltos de línea respetados. */
export function plainTextToHtmlBlocks(text: string): string {
  const escaped = escapeHtml(text.trim());
  const paragraphs = escaped.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length === 0) return '';
  return paragraphs
    .map((p) => `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:${BRAND.slate900};">${p.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export interface BuildEmailHtmlOptions {
  /** Título visible en el cuerpo (p. ej. asunto o título corto). */
  heading: string;
  /** Texto del mensaje (plano). */
  bodyText: string;
  /** Línea opcional para previsualización en bandeja (muchas apps la muestran junto al asunto). */
  preheader?: string;
  /** Botón principal opcional. */
  cta?: { url: string; label: string };
  /** Variante visual del encabezado. */
  variant?: 'default' | 'attention';
}

export function buildEmailHtml(options: BuildEmailHtmlOptions): string {
  const { heading, bodyText, preheader, cta, variant = 'default' } = options;
  const pre = (preheader ?? bodyText).slice(0, 140).trim();
  const headerBg =
    variant === 'attention'
      ? `linear-gradient(135deg, #b45309 0%, #d97706 100%)`
      : `linear-gradient(135deg, ${BRAND.teal} 0%, ${BRAND.tealDark} 100%)`;

  const bodyHtml = plainTextToHtmlBlocks(bodyText) || `<p style="margin:0;font-size:16px;line-height:1.6;color:${BRAND.slate600};">(Sin contenido)</p>`;

  const ctaBlock = cta
    ? `
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0 0;">
  <tr>
    <td style="border-radius:10px;background:${BRAND.teal};">
      <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND.white};text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a>
    </td>
  </tr>
</table>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>${escapeHtml(heading)}</title>
  <!--[if mso]><style type="text/css">table {border-collapse:collapse;} .btn a {padding:14px 28px !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.slate100};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;">
    ${escapeHtml(pre)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.slate100};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:${BRAND.white};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">
          <tr>
            <td style="background:${headerBg};padding:28px 32px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.85);">NWSPayFlow</p>
              <h1 style="margin:8px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.25;color:${BRAND.white};">${escapeHtml(heading)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 36px 32px;">
              ${bodyHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px 32px;border-top:1px solid #e2e8f0;background:#fafafa;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.slate500};text-align:center;">
                Notificación automática de NWSPayFlow · gestión de pagos y aprobaciones<br />
                Si no esperabas este correo, puedes ignorarlo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
