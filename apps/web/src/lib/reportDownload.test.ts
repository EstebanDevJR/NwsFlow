import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadReportFile } from './reportDownload';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    getToken: vi.fn(),
  },
}));

describe('downloadReportFile', () => {
  const mockedApi = api as unknown as { getToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedApi.getToken.mockReset();
    vi.stubGlobal('fetch', vi.fn());

    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:url'),
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true,
    });
  });

  it('downloads file and uses filename from quoted content-disposition', async () => {
    mockedApi.getToken.mockReturnValue('token-123');

    const blob = new Blob(['content'], { type: 'application/pdf' });

    const anchor = document.createElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: {
        get: vi.fn().mockReturnValue('attachment; filename="reporte-final.pdf"'),
      },
    } as unknown as Response);

    await downloadReportFile('/reports/export');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/reports/export'),
      expect.objectContaining({
        credentials: 'include',
        headers: { Authorization: 'Bearer token-123' },
      })
    );
    expect(anchor.download).toBe('reporte-final.pdf');
    expect(anchor.href).toBe('blob:url');
    expect(click).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');
  });

  it('throws session expiration error when response is 401', async () => {
    mockedApi.getToken.mockReturnValue(null);
    vi.mocked(fetch).mockResolvedValue({
      status: 401,
      ok: false,
    } as unknown as Response);

    await expect(downloadReportFile('/reports/export')).rejects.toThrow('Sesión expirada');
  });

  it('throws API error body when download fails', async () => {
    mockedApi.getToken.mockReturnValue(null);
    vi.mocked(fetch).mockResolvedValue({
      status: 400,
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'No autorizado' }),
    } as unknown as Response);

    await expect(downloadReportFile('/reports/export')).rejects.toThrow('No autorizado');
  });

  it('uses fallback message when error body is not json', async () => {
    mockedApi.getToken.mockReturnValue(null);
    vi.mocked(fetch).mockResolvedValue({
      status: 500,
      ok: false,
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
    } as unknown as Response);

    await expect(downloadReportFile('/reports/export')).rejects.toThrow('Error al descargar');
  });
});
