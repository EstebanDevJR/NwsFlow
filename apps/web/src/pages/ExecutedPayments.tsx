import { useEffect, useRef, useState } from 'react';
import { usePayments } from '@/hooks/useApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Card } from '@/components/ui/card';
import { FileText, Eye } from 'lucide-react';
import { ImageModal } from '@/components/ui/image-modal';
import {
  PaymentFiltersBar,
  PaymentPagination,
  defaultPaymentFilters,
  type PaymentListFilters,
} from '@/components/payment-filters';
import gsap from 'gsap';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrencyAmount, paymentMethodLabel, type CurrencyCode } from '@paymentflow/shared';

export function ExecutedPayments() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<
    { evidenceId: string; mimeType?: string } | { url: string; mimeType?: string } | null
  >(null);
  const [filters, setFilters] = useState<PaymentListFilters>(() => defaultPaymentFilters());
  const [page, setPage] = useState(1);
  const limit = 25;
  const qDebounced = useDebouncedValue(filters.q, 400);

  const patchFilters = (patch: Partial<PaymentListFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(defaultPaymentFilters());
    setPage(1);
  };

  const { data: listResponse, isLoading } = usePayments({
    status: 'PAID',
    page,
    limit,
    q: qDebounced.trim() || undefined,
    category: filters.category.trim() || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });

  const paidRequests = listResponse?.data ?? [];
  const meta = listResponse?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.2)' }
      );
    }
  }, []);

  return (
    <div className="space-y-6" ref={containerRef}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Pagos Ejecutados</h2>
        <p className="text-muted-foreground mt-1">Registro de todos los pagos completados.</p>
      </div>

      <PaymentFiltersBar filters={filters} onChange={patchFilters} onReset={resetFilters} />

      <Card className="overflow-hidden liquid-glass">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">ID / Fecha Pago</th>
                <th className="px-6 py-4 font-medium">Detalle</th>
                <th className="px-6 py-4 font-medium">Monto</th>
                <th className="px-6 py-4 font-medium">Evidencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : (
                <>
                  {paidRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-foreground">#{req.id.slice(-6)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {req.updatedAt
                            ? format(new Date(req.updatedAt), 'dd MMM yyyy, HH:mm', { locale: es })
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground max-w-[250px] truncate" title={req.concept}>
                          {req.concept}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">Solicitado por {req.user?.name}</div>
                        {req.paymentMethod ? (
                          <div
                            className="text-xs text-muted-foreground mt-1 max-w-[280px] line-clamp-2"
                            title={`${paymentMethodLabel(req.paymentMethod)}${req.paymentMethodDetail ? ` — ${req.paymentMethodDetail}` : ''}`}
                          >
                            <span className="font-medium text-foreground/80">{paymentMethodLabel(req.paymentMethod)}</span>
                            {req.paymentMethodDetail ? ` · ${req.paymentMethodDetail}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-primary">
                        {formatCurrencyAmount(Number(req.amount), (req.currency ?? 'COP') as CurrencyCode)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {req.evidences && req.evidences.length > 0 ? (
                          <button
                            onClick={() =>
                              setPreview({
                                evidenceId: req.evidences![0].id,
                                mimeType: req.evidences![0].mimetype,
                              })
                            }
                            className="inline-flex items-center gap-1.5 text-primary hover:underline"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Ver evidencia solicitud</span>
                          </button>
                        ) : req.paymentProofUrl ? (
                          <button
                            onClick={() => setPreview({ url: req.paymentProofUrl!, mimeType: 'application/pdf' })}
                            className="inline-flex items-center gap-1.5 text-primary hover:underline"
                          >
                            <FileText className="w-4 h-4" />
                            <span>Comprobante de pago</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sin adjunto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {paidRequests.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                        No hay pagos ejecutados con los filtros actuales.
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <PaymentPagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      {preview && (
        <ImageModal
          {...('evidenceId' in preview
            ? { evidenceId: preview.evidenceId, mimeType: preview.mimeType }
            : { url: preview.url, mimeType: preview.mimeType })}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
