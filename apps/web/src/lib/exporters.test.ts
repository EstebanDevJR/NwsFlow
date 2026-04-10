import { beforeEach, describe, expect, it, vi } from 'vitest';

const { docMock } = vi.hoisted(() => ({
  docMock: {
    setFontSize: vi.fn(),
    text: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('jspdf', () => ({
  default: vi.fn(() => docMock),
}));

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(),
    book_new: vi.fn(),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

import * as XLSX from 'xlsx';
import { exportReportsToExcel, exportReportsToPdf } from './exporters';

describe('exporters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(XLSX.utils.json_to_sheet).mockReturnValue({ name: 'sheet' } as any);
    vi.mocked(XLSX.utils.book_new).mockReturnValue({ name: 'book' } as any);
  });

  it('exports pdf including overflow message when there are more than 30 rows', () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      createdAt: '2026-01-15T00:00:00.000Z',
      user: { name: `User ${i + 1}` },
      amount: 100 + i,
      status: 'APPROVED',
    }));

    exportReportsToPdf(rows, 'custom.pdf');

    expect(docMock.setFontSize).toHaveBeenCalled();
    expect(docMock.text).toHaveBeenCalledWith(expect.stringContaining('Reporte de Solicitudes de Pago'), 14, 16);
    expect(docMock.text).toHaveBeenCalledWith(expect.stringContaining('... y 1 registros adicionales'), 14, expect.any(Number));
    expect(docMock.save).toHaveBeenCalledWith('custom.pdf');
  });

  it('exports excel with transformed fields and defaults', () => {
    const rows = [
      {
        createdAt: '2026-01-15T00:00:00.000Z',
        user: { name: 'Ana' },
        amount: '123.4',
        concept: 'Compra',
        category: 'IT',
        status: 'PENDING',
      },
      {
        amount: 0,
      },
    ];

    exportReportsToExcel(rows, 'custom.xlsx');

    expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          Usuario: 'Ana',
          Monto: 123.4,
          Concepto: 'Compra',
          Categoria: 'IT',
          Estado: 'PENDING',
        }),
        expect.objectContaining({
          Usuario: '-',
          Monto: 0,
          Concepto: '-',
          Categoria: '-',
          Estado: '-',
        }),
      ])
    );
    expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith({ name: 'book' }, { name: 'sheet' }, 'Reportes');
    expect(XLSX.writeFile).toHaveBeenCalledWith({ name: 'book' }, 'custom.xlsx');
  });
});
