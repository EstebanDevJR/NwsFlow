import { Router } from 'express';
import prisma from '@paymentflow/database';
import { requireRole } from '../middleware/auth.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getExecutiveDashboard } from '../services/dashboardStats.js';
import { formatCurrencyAmount, paymentMethodLabel, type CurrencyCode } from '@paymentflow/shared';

const router = Router();

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dayStart(s: string): Date {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayEnd(s: string): Date {
  const d = new Date(s);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** dateField: `paid` = pagos ejecutados (filtra por paidAt y status PAID). `created` = solicitudes por fecha de creación. */
function buildReportWhere(query: {
  startDate?: string;
  endDate?: string;
  dateField?: 'created' | 'paid';
  userId?: string;
  category?: string;
  status?: string;
  q?: string;
}) {
  const where: Record<string, unknown> = {};
  const byPaidDate = query.dateField === 'paid';

  if (byPaidDate) {
    where.status = 'PAID';
    if (query.startDate || query.endDate) {
      where.paidAt = {} as Record<string, Date>;
      if (query.startDate) (where.paidAt as Record<string, Date>).gte = dayStart(query.startDate);
      if (query.endDate) (where.paidAt as Record<string, Date>).lte = dayEnd(query.endDate);
    }
  } else {
    if (query.startDate || query.endDate) {
      where.createdAt = {} as Record<string, Date>;
      if (query.startDate) (where.createdAt as Record<string, Date>).gte = dayStart(query.startDate);
      if (query.endDate) (where.createdAt as Record<string, Date>).lte = dayEnd(query.endDate);
    }
    if (query.status) where.status = query.status;
  }

  if (query.userId) where.userId = query.userId;
  if (query.category) where.category = query.category;
  if (query.q?.trim()) {
    const term = query.q.trim();
    where.OR = [
      { concept: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { category: { contains: term, mode: 'insensitive' } },
      { paymentMethodDetail: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}

router.get('/', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { startDate, endDate, userId, category, status, page, limit, q, dateField } = req.query;
    const isPaid = dateField === 'paid';
    const where = buildReportWhere({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      dateField: isPaid ? 'paid' : 'created',
      userId: userId as string | undefined,
      category: category as string | undefined,
      status: status as string | undefined,
      q: q as string | undefined,
    });

    const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(String(limit || '50'), 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [payments, total, statusAgg, currencyAgg, approvedByCurrencyAgg] = await Promise.all([
      prisma.paymentRequest.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: isPaid ? { paidAt: 'desc' } : { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.paymentRequest.count({ where }),
      prisma.paymentRequest.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.paymentRequest.groupBy({
        by: ['currency'],
        where,
        _sum: { amount: true },
      }),
      prisma.paymentRequest.groupBy({
        by: ['currency'],
        where: { ...where, status: 'APPROVED' },
        _sum: { amount: true },
      }),
    ]);

    const totalAmount = statusAgg.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
    const amountByCurrency: Record<string, number> = {};
    for (const row of currencyAgg) {
      amountByCurrency[row.currency] = Number(row._sum.amount ?? 0);
    }
    const approvedAmountByCurrency: Record<string, number> = {};
    for (const row of approvedByCurrencyAgg) {
      approvedAmountByCurrency[row.currency] = Number(row._sum.amount ?? 0);
    }
    const row = (st: string) => statusAgg.find((x) => x.status === st);
    const pendingCount = row('PENDING')?._count._all ?? 0;
    const approvedAmount = Number(row('APPROVED')?._sum.amount ?? 0);

    res.json({
      data: payments,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
        aggregates: {
          totalAmount,
          pendingCount,
          approvedAmount,
          amountByCurrency,
          approvedAmountByCurrency,
        },
        statusBreakdown: statusAgg.map((r) => ({
          status: r.status,
          count: r._count._all,
          amountSum: Number(r._sum.amount ?? 0),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/export/excel', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { startDate, endDate, userId, category, status, q, dateField } = req.query;
    const isPaid = dateField === 'paid';
    const where = buildReportWhere({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      dateField: isPaid ? 'paid' : 'created',
      userId: userId as string | undefined,
      category: category as string | undefined,
      status: status as string | undefined,
      q: q as string | undefined,
    });

    const payments = await prisma.paymentRequest.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: isPaid ? { paidAt: 'desc' } : { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheetName = isPaid ? 'Pagos ejecutados' : 'Solicitudes';
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = [
      { header: 'ID', key: 'id', width: 28 },
      { header: 'Fecha solicitud', key: 'createdAt', width: 18 },
      ...(isPaid ? ([{ header: 'Fecha pago', key: 'paidAt', width: 18 }] as const) : []),
      { header: 'Solicitante', key: 'userName', width: 22 },
      { header: 'Email', key: 'userEmail', width: 28 },
      { header: 'Moneda', key: 'currency', width: 10 },
      { header: 'Monto', key: 'amount', width: 18 },
      { header: 'Concepto', key: 'concept', width: 32 },
      { header: 'Descripción', key: 'description', width: 40 },
      { header: 'Categoría', key: 'category', width: 18 },
      { header: 'Método pago', key: 'paymentMethod', width: 18 },
      { header: 'Cuenta / destino', key: 'paymentMethodDetail', width: 36 },
      { header: 'Estado', key: 'status', width: 12 },
    ];

    for (const p of payments) {
      const row: Record<string, string | number> = {
        id: p.id,
        createdAt: p.createdAt.toISOString(),
        userName: p.user.name,
        userEmail: p.user.email,
        currency: p.currency,
        amount: Number(p.amount),
        concept: p.concept,
        description: p.description.replace(/\s+/g, ' ').slice(0, 500),
        category: p.category,
        paymentMethod: p.paymentMethod ? paymentMethodLabel(p.paymentMethod) : '',
        paymentMethodDetail: p.paymentMethodDetail?.replace(/\s+/g, ' ').slice(0, 500) ?? '',
        status: p.status,
      };
      if (isPaid) row.paidAt = p.paidAt ? p.paidAt.toISOString() : '';
      sheet.addRow(row);
    }

    sheet.getRow(1).font = { bold: true };

    const filename = isPaid ? 'nwspayflow-pagos-ejecutados.xlsx' : 'nwspayflow-solicitudes.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

router.get('/export/html', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { startDate, endDate, userId, category, status, q } = req.query;
    const where = buildReportWhere({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      userId: userId as string | undefined,
      category: category as string | undefined,
      status: status as string | undefined,
      q: q as string | undefined,
    });

    const payments = await prisma.paymentRequest.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const totalByCurrency = new Map<CurrencyCode, number>();
    for (const p of payments) {
      const c = p.currency as CurrencyCode;
      totalByCurrency.set(c, (totalByCurrency.get(c) ?? 0) + Number(p.amount));
    }
    const totalsLine = Array.from(totalByCurrency.entries())
      .map(([c, n]) => formatCurrencyAmount(n, c))
      .join(' · ');

    let html = `
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1a1a1a; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .summary { margin-top: 20px; padding: 15px; background: #f9f9f9; }
        </style>
      </head>
      <body>
        <h1>NWSPayFlow — Reporte de solicitudes de pago (HTML)</h1>
        <p style="color:#666;font-size:12px;">Formato tabular para impresión o guardado. No es PDF binario.</p>
        <table>
          <tr>
            <th>Fecha</th>
            <th>Usuario</th>
            <th>Moneda</th>
            <th>Monto</th>
            <th>Concepto</th>
            <th>Categoría</th>
            <th>Método / cuenta</th>
            <th>Estado</th>
          </tr>
    `;

    for (const p of payments) {
      const methodCell = p.paymentMethod
        ? `${paymentMethodLabel(p.paymentMethod)}${p.paymentMethodDetail ? ` — ${escapeHtml(p.paymentMethodDetail)}` : ''}`
        : '—';
      html += `
        <tr>
          <td>${p.createdAt.toLocaleDateString()}</td>
          <td>${p.user.name}</td>
          <td>${p.currency}</td>
          <td>${formatCurrencyAmount(Number(p.amount), p.currency as CurrencyCode)}</td>
          <td>${p.concept}</td>
          <td>${p.category}</td>
          <td>${methodCell}</td>
          <td>${p.status}</td>
        </tr>
      `;
    }

    html += `
        </table>
        <div class="summary">
          <strong>Total de solicitudes:</strong> ${payments.length}<br>
          <strong>Totales por moneda:</strong> ${totalsLine || '—'}
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=nwspayflow-reporte-tabular.html');
    res.send(html);
  } catch (err) {
    next(err);
  }
});

function pdfEscape(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

router.get('/export/pdf', requireRole('HOLDER'), async (req, res, next) => {
  try {
    const { startDate, endDate, userId, category, status, q, dateField } = req.query;
    const isPaid = dateField === 'paid';
    const where = buildReportWhere({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      dateField: isPaid ? 'paid' : 'created',
      userId: userId as string | undefined,
      category: category as string | undefined,
      status: status as string | undefined,
      q: q as string | undefined,
    });

    const payments = await prisma.paymentRequest.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: isPaid ? { paidAt: 'desc' } : { createdAt: 'desc' },
      take: 2000,
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 44,
      bufferPages: true,
    });

    const filename = isPaid ? 'nwspayflow-pagos-ejecutados.pdf' : 'nwspayflow-solicitudes.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const brand = '#0f766e';
    const brandLight = '#ecfdf5';
    const textMuted = '#64748b';
    const W = doc.page.width;
    const M = 44;
    const tableW = W - 2 * M;
    let rowY = 0;

    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, W, 88).fill(brand);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('NWSPayFlow', M, 22, { width: tableW });
      doc.font('Helvetica').fontSize(12).fillColor('#ccfbf1');
      doc.text(isPaid ? 'Informe de pagos ejecutados' : 'Informe de solicitudes de pago', M, 46);
      doc.fontSize(9).fillColor('#99f6e4').text('Documento interno · Confidencial', M, 64);
      doc.restore();
      rowY = 104;
    };

    drawHeader();

    doc.fillColor(textMuted).font('Helvetica').fontSize(9);
    const period =
      startDate || endDate
        ? `Período: ${startDate || '…'} — ${endDate || '…'} · Criterio: ${isPaid ? 'fecha de pago' : 'fecha de solicitud'}`
        : 'Sin filtro de fechas (todos los registros según otros criterios)';
    doc.text(period, M, rowY, { width: tableW });
    rowY += 22;
    doc.text(`Generación: ${new Date().toLocaleString('es')} · Registros: ${payments.length}`, M, rowY);
    rowY += 28;

    const pdfTotalByCurrency = new Map<CurrencyCode, number>();
    for (const p of payments) {
      const c = p.currency as CurrencyCode;
      pdfTotalByCurrency.set(c, (pdfTotalByCurrency.get(c) ?? 0) + Number(p.amount));
    }
    const pdfTotalsLine = Array.from(pdfTotalByCurrency.entries())
      .map(([c, n]) => formatCurrencyAmount(n, c))
      .join(' · ');

    const col = isPaid
      ? [
          { w: 78, h: 'F. solicitud' },
          { w: 78, h: 'F. pago' },
          { w: 112, h: 'Solicitante' },
          { w: 44, h: 'Mon.' },
          { w: 88, h: 'Monto' },
          { w: 188, h: 'Concepto' },
          { w: 80, h: 'Categoría' },
        ]
      : [
          { w: 78, h: 'F. solicitud' },
          { w: 112, h: 'Solicitante' },
          { w: 44, h: 'Mon.' },
          { w: 88, h: 'Monto' },
          { w: 228, h: 'Concepto' },
          { w: 80, h: 'Categoría' },
          { w: 64, h: 'Estado' },
        ];

    const headerH = 22;
    const rowH = 20;
    const bottomLimit = doc.page.height - 52;

    const drawTableHeader = (y: number) => {
      doc.save();
      doc.rect(M, y, tableW, headerH).fill(brandLight);
      doc.strokeColor('#99f6e4').lineWidth(0.5).rect(M, y, tableW, headerH).stroke();
      let x = M + 6;
      doc.fillColor(brand).font('Helvetica-Bold').fontSize(8);
      for (const c of col) {
        doc.text(c.h, x, y + 6, { width: c.w - 8 });
        x += c.w;
      }
      doc.restore();
      return y + headerH;
    };

    const ensureSpace = (need: number) => {
      if (rowY + need > bottomLimit) {
        doc.addPage();
        rowY = M;
        rowY = drawTableHeader(rowY);
      }
    };

    rowY = drawTableHeader(rowY);

    doc.font('Helvetica').fontSize(8).fillColor('#0f172a');

    let idx = 0;
    for (const p of payments) {
      ensureSpace(rowH + 4);
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.save();
      doc.rect(M, rowY, tableW, rowH).fill(bg);
      doc.restore();

      let x = M + 6;
      const amt = formatCurrencyAmount(Number(p.amount), p.currency as CurrencyCode);
      const cells = isPaid
        ? [
            p.createdAt.toLocaleDateString('es'),
            p.paidAt ? p.paidAt.toLocaleDateString('es') : '—',
            pdfEscape(p.user.name, 26),
            p.currency,
            pdfEscape(amt, 22),
            pdfEscape(p.concept, 70),
            pdfEscape(p.category, 16),
          ]
        : [
            p.createdAt.toLocaleDateString('es'),
            pdfEscape(p.user.name, 26),
            p.currency,
            pdfEscape(amt, 22),
            pdfEscape(p.concept, 90),
            pdfEscape(p.category, 16),
            p.status,
          ];

      for (let i = 0; i < col.length; i++) {
        doc.fillColor('#0f172a').text(cells[i], x, rowY + 5, { width: col[i].w - 8, lineBreak: false });
        x += col[i].w;
      }
      doc.strokeColor('#e2e8f0').lineWidth(0.3).moveTo(M, rowY + rowH).lineTo(M + tableW, rowY + rowH).stroke();

      rowY += rowH;
      idx++;
    }

    ensureSpace(36);
    doc.save();
    doc.rect(M, rowY, tableW, 32).fill('#f0fdfa');
    doc.strokeColor(brand).lineWidth(1).rect(M, rowY, tableW, 32).stroke();
    doc.fillColor(brand).font('Helvetica-Bold').fontSize(11);
    doc.text(`Total registros: ${payments.length}`, M + 12, rowY + 10);
    doc.text(`Totales: ${pdfTotalsLine || '—'}`, M + 200, rowY + 10, { width: tableW - 220 });
    doc.restore();

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor(textMuted).font('Helvetica');
      doc.text(
        `NWSPayFlow · ${new Date().toLocaleDateString('es')} · Página ${i - range.start + 1} de ${range.count}`,
        M,
        doc.page.height - 28,
        { align: 'center', width: tableW }
      );
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard', requireRole('HOLDER'), async (_req, res, next) => {
  try {
    const dashboard = await getExecutiveDashboard();
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

export default router;
