import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

type ReportRow = {
  createdAt?: string;
  user?: { name?: string };
  amount?: number | string;
  concept?: string;
  category?: string;
  status?: string;
};

export function exportReportsToPdf(rows: ReportRow[], filename = 'reportes.pdf') {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Reporte de Solicitudes de Pago', 14, 16);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 22);

  let y = 30;
  rows.slice(0, 30).forEach((row, idx) => {
    const line = `${idx + 1}. ${new Date(row.createdAt || '').toLocaleDateString()} | ${row.user?.name || '-'} | $${Number(row.amount || 0).toFixed(2)} | ${row.status || '-'}`;
    doc.text(line, 14, y);
    y += 6;
  });

  if (rows.length > 30) {
    doc.text(`... y ${rows.length - 30} registros adicionales`, 14, y + 4);
  }

  doc.save(filename);
}

export function exportReportsToExcel(rows: ReportRow[], filename = 'reportes.xlsx') {
  const data = rows.map((row) => ({
    Fecha: row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '-',
    Usuario: row.user?.name || '-',
    Monto: Number(row.amount || 0),
    Concepto: row.concept || '-',
    Categoria: row.category || '-',
    Estado: row.status || '-',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reportes');
  XLSX.writeFile(wb, filename);
}
