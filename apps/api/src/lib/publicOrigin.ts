/**
 * Normaliza API_PUBLIC_URL al origen (esquema + host + puerto), sin ruta.
 * Valores como https://dominio.com/api hacían enlaces del tipo .../api/api/files/local
 * y rompían las descargas firmadas (403 / 404).
 */
export function normalizeApiPublicOrigin(raw: string | undefined): string {
  const s = raw?.trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return s.replace(/\/$/, '');
  }
}

/** Express puede devolver string | string[] en req.query. */
export function firstQueryParam(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return String(value[0] ?? '');
  return String(value);
}
