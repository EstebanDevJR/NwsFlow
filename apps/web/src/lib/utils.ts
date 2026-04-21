import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Fechas de negocio guardadas como medianoche UTC deben mostrarse en calendario UTC
 * para no retroceder un día en zonas horarias detrás de UTC (p. ej. América).
 */
export function formatCalendarDateFromIso(iso: string | undefined | null, locale = 'es-CO'): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(locale, { timeZone: 'UTC' });
  } catch {
    return '—';
  }
}

export function formatShortDate(
  iso: string | undefined | null,
  options?: { utcCalendar?: boolean }
): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(options?.utcCalendar ? { timeZone: 'UTC' } : {}),
    });
  } catch {
    return '—';
  }
}
