import { api } from '@/lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/** Descarga binaria (Excel/PDF) con el token de sesión. */
export async function downloadReportFile(pathWithQuery: string): Promise<void> {
  const token = api.getToken();
  const res = await fetch(`${API_URL}${pathWithQuery}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error al descargar' }));
    throw new Error((err as { error?: string }).error || 'Error al descargar');
  }

  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition');
  const mQuoted = cd?.match(/filename="([^"]+)"/i);
  const mPlain = cd?.match(/filename=([^;\s]+)/i);
  const filename = (mQuoted?.[1] || mPlain?.[1] || 'reporte').replace(/"/g, '').trim();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
