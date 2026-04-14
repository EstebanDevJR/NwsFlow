import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePayments } from '@/hooks/useApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
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

export function History() {
  const { user } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<PaymentListFilters>(() => defaultPaymentFilters());
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ evidenceId: string; mimeType?: string } | null>(null);
  const limit = 20;
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
    page,
    limit,
    q: qDebounced.trim() || undefined,
    category: filters.category.trim() || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    status: filters.status || undefined,
  });

  const requests = listResponse?.data ?? [];
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

  if (!user) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">Pendiente</Badge>;
      case 'APPROVED':
        return <Badge variant="success">Aprobado</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive">Rechazado</Badge>;
      case 'PAID':
        return <Badge variant="default" className="bg-indigo-500">Pagado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6" ref={containerRef}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Historial de Solicitudes</h2>
        <p className="text-muted-foreground mt-1">Registro completo de todas las solicitudes.</p>
      </div>

      <PaymentFiltersBar
        filters={filters}
        onChange={patchFilters}
        onReset={resetFilters}
        showStatus
      />

      <Card className="overflow-hidden liquid-glass">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">ID / Fecha</th>
                <th className="px-6 py-4 font-medium">Detalle</th>
                <th className="px-6 py-4 font-medium">Solicitante</th>
                <th className="px-6 py-4 font-medium">Monto</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : (
                <>
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-foreground">#{req.id.slice(-6)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(req.createdAt), 'dd MMM yyyy', { locale: es })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground max-w-[200px] truncate" title={req.concept}>
                          {req.concept}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate" title={req.description}>
                          {req.description}
                        </div>
                        {req.paymentMethod ? (
                          <div
                            className="text-xs text-muted-foreground mt-1 max-w-[240px] line-clamp-2"
                            title={`${paymentMethodLabel(req.paymentMethod)}${req.paymentMethodDetail ? ` — ${req.paymentMethodDetail}` : ''}`}
                          >
                            <span className="font-medium text-foreground/80">{paymentMethodLabel(req.paymentMethod)}</span>
                            {req.paymentMethodDetail ? ` · ${req.paymentMethodDetail}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-xs font-medium text-white">
                            {req.user?.name?.charAt(0) || 'U'}
                          </div>
                          <span>{req.user?.name || 'Usuario'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-primary">
                        {formatCurrencyAmount(Number(req.amount), (req.currency ?? 'COP') as CurrencyCode)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(req.status)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {req.evidences && req.evidences.length > 0 ? (
                          <button
                            onClick={() =>
                              setPreview({
                                evidenceId: req.evidences![0].id,
                                mimeType: req.evidences![0].mimetype,
                              })
                            }
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Ver evidencia"
                          >
                            <Eye className="w-4 h-4 inline-block" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        No se encontraron resultados.
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
        <ImageModal evidenceId={preview.evidenceId} mimeType={preview.mimeType} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
