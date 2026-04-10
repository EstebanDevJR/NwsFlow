import PDFDocument from 'pdfkit';

const PAGE_W = 595.28;
const PAGE_H = 841.89;

const C = {
  headerBg: '#0c1222',
  headerStripe: '#0891b2',
  subtitle: '#94a3b8',
  cardBg: '#f8fafc',
  cardBorder: '#e2e8f0',
  mineFill: '#e0f2fe',
  mineBorder: '#38bdf8',
  mineLabel: '#0369a1',
  otherFill: '#f1f5f9',
  otherBorder: '#cbd5e1',
  otherLabel: '#475569',
  body: '#0f172a',
  muted: '#64748b',
  dayPillBg: '#f1f5f9',
  dayPillBorder: '#e2e8f0',
  empty: '#94a3b8',
  footer: '#94a3b8',
};

export interface ChatExportMessage {
  body: string;
  createdAt: Date;
  senderName: string;
  isMine: boolean;
}

export interface ChatExportMeta {
  selfName: string;
  selfRole: string;
  selfEmail?: string | null;
  otherName: string;
  otherRole: string;
  otherEmail?: string | null;
  exportedAt: Date;
}

/**
 * PDF conversacional: cabecera, tarjetas de participantes y burbujas alineadas.
 */
export function pipeChatExportPdf(
  res: NodeJS.WritableStream,
  messages: ChatExportMessage[],
  meta: ChatExportMeta,
  onDocError?: (err: unknown) => void
): void {
  const margin = 40;
  const doc = new PDFDocument({
    size: 'A4',
    margin,
    bufferPages: true,
    info: {
      Title: `Chat · ${meta.otherName}`,
      Author: 'NwSPayFlow',
    },
  });
  if (onDocError) {
    doc.on('error', onDocError);
  }
  doc.pipe(res);

  const innerW = PAGE_W - margin * 2;
  const bubbleMax = Math.min(292, innerW * 0.78);
  let y = margin;

  // Cabecera
  doc.save();
  doc.rect(0, 0, PAGE_W, 6).fill(C.headerStripe);
  doc.rect(0, 6, PAGE_W, 94).fill(C.headerBg);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('Conversación', margin, 28, {
    width: innerW,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(9).fillColor(C.subtitle).text('Mensajes internos · NwSPayFlow', margin, 58, {
    width: innerW,
    align: 'center',
  });
  doc.fontSize(8).fillColor('#64748b').text(
    meta.exportedAt.toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' }),
    margin,
    76,
    { width: innerW, align: 'center' }
  );
  doc.restore();

  y = 118;

  // Tarjetas participantes
  const cardH = 58;
  const gap = 12;
  const cardW = (innerW - gap) / 2;

  const drawCard = (
    x: number,
    name: string,
    role: string,
    email: string | null | undefined,
    accent: string
  ) => {
    doc.save();
    doc.roundedRect(x, y, cardW, cardH, 10).fillAndStroke(C.cardBg, C.cardBorder);
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(7).text('Participante', x + 14, y + 10);
    doc.fillColor(C.body).font('Helvetica-Bold').fontSize(11).text(name, x + 14, y + 22, { width: cardW - 28 });
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(role, x + 14, y + 38, { width: cardW - 28 });
    if (email) {
      doc.fontSize(7).text(email, x + 14, y + 48, { width: cardW - 28 });
    }
    doc.restore();
  };

  drawCard(margin, meta.selfName, meta.selfRole, meta.selfEmail, C.mineLabel);
  drawCard(margin + cardW + gap, meta.otherName, meta.otherRole, meta.otherEmail, C.otherLabel);

  y += cardH + 20;

  doc.strokeColor(C.cardBorder).lineWidth(0.75).moveTo(margin, y).lineTo(margin + innerW, y).stroke();
  y += 16;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.body).text('Historial del chat', margin, y);
  y += 22;

  const measureBody = (text: string, w: number) => {
    doc.font('Helvetica').fontSize(9.5);
    return doc.heightOfString(text, { width: w, lineGap: 2 });
  };

  if (messages.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(C.empty).text('No hay mensajes en esta conversación.', margin, y, {
      width: innerW,
      align: 'center',
    });
  } else {
    let lastDayKey: string | null = null;

    for (const m of messages) {
      const dayKey = m.createdAt.toDateString();
      if (dayKey !== lastDayKey) {
        lastDayKey = dayKey;
        const dayLabel = m.createdAt.toLocaleDateString('es', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        const pillW = Math.min(innerW * 0.72, 340);
        const pillX = margin + (innerW - pillW) / 2;
        const pillH = 22;
        if (y + pillH + 24 > PAGE_H - margin - 36) {
          doc.addPage();
          y = margin;
        }
        doc.save();
        doc.roundedRect(pillX, y, pillW, pillH, 11).fillAndStroke(C.dayPillBg, C.dayPillBorder);
        doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(8).text(dayLabel, pillX, y + 7, {
          width: pillW,
          align: 'center',
        });
        doc.restore();
        y += pillH + 14;
      }

      const label = m.isMine ? 'Tú' : m.senderName;
      const when = m.createdAt.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
      const header = `${label}  ·  ${when}`;
      const padding = 12;
      const bodyW = bubbleMax - padding * 2;
      const headerH = 13;
      const bodyH = measureBody(m.body, bodyW);
      const bubbleH = padding + headerH + 6 + bodyH + padding;

      if (y + bubbleH > PAGE_H - margin - 36) {
        doc.addPage();
        y = margin;
      }

      const xBase = m.isMine ? margin + innerW - bubbleMax : margin;
      const fill = m.isMine ? C.mineFill : C.otherFill;
      const stroke = m.isMine ? C.mineBorder : C.otherBorder;
      const labelColor = m.isMine ? C.mineLabel : C.otherLabel;

      doc.save();
      doc.roundedRect(xBase, y, bubbleMax, bubbleH, 12).fillAndStroke(fill, stroke);
      doc.fillColor(labelColor).font('Helvetica-Bold').fontSize(8).text(header, xBase + padding, y + padding, {
        width: bodyW,
      });
      doc.fillColor(C.body).font('Helvetica').fontSize(9.5).text(m.body, xBase + padding, y + padding + headerH + 5, {
        width: bodyW,
        lineGap: 2,
      });
      doc.restore();

      y += bubbleH + 12;
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.save();
    const footerText =
      range.count > 1
        ? `NwSPayFlow · Confidencial · Página ${i + 1} de ${range.count}`
        : 'NwSPayFlow · Confidencial · Documento de conversación';
    doc.font('Helvetica').fontSize(7).fillColor(C.footer).text(footerText, margin, PAGE_H - 30, {
      width: innerW,
      align: 'center',
    });
    doc.restore();
  }

  doc.end();
}
