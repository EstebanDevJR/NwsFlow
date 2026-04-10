import { useEffect, useRef, useState } from 'react';
import { usePayments, useUpdatePaymentStatus } from '@/hooks/useApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, Clock, FileText, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import {
  PaymentFiltersBar,
  PaymentPagination,
  defaultPaymentFilters,
  type PaymentListFilters,
} from '@/components/payment-filters';
import gsap from 'gsap';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ImageModal } from '@/components/ui/image-modal';
import type { Evidence } from '@/store/useAppStore';
import { formatCurrencyAmount, paymentMethodLabel, type CurrencyCode } from '@paymentflow/shared';

export function Approvals() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [evidencePreview, setEvidencePreview] = useState<{ evidences: Evidence[]; index: number } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [filters, setFilters] = useState<PaymentListFilters>(() => defaultPaymentFilters());
  const [page, setPage] = useState(1);
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
    status: 'PENDING',
    page,
    limit,
    q: qDebounced.trim() || undefined,
    category: filters.category.trim() || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });

  const payments = listResponse?.data ?? [];
  const meta = listResponse?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const approveMutation = useUpdatePaymentStatus();

  useEffect(() => {
    if (!isLoading && payments && containerRef.current) {
      const cards = containerRef.current.querySelectorAll('.gsap-item');
      gsap.fromTo(
        cards,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.1, ease: 'power2.out' }
      );
    }
  }, [payments, isLoading]);

  const handleApprove = async (id: string) => {
    await approveMutation.mutateAsync({ id, status: 'APPROVED' });
  };

  const handleReject = (id: string) => {
    setRejectingId(id);
  };

  const confirmReject = async (id: string) => {
    if (!rejectComment.trim()) return;
    await approveMutation.mutateAsync({ id, status: 'REJECTED', rejectionComment: rejectComment });
    setRejectingId(null);
    setRejectComment('');
  };

  const isPending = approveMutation.isPending;

  const previewCurrent =
    evidencePreview && evidencePreview.evidences[evidencePreview.index]
      ? evidencePreview.evidences[evidencePreview.index]
      : null;
  const previewTotal = evidencePreview?.evidences.length ?? 0;

  return (
    <div className="space-y-8" ref={containerRef}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Aprobaciones Pendientes</h2>
        <p className="text-muted-foreground mt-1">Revisa y gestiona las solicitudes de pago de los líderes.</p>
      </div>

      <PaymentFiltersBar filters={filters} onChange={patchFilters} onReset={resetFilters} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !payments || payments.length === 0 ? (
        <EmptyState
          title="Todo al día"
          description="No hay solicitudes pendientes de aprobación con los filtros actuales."
          icon={CheckCircle}
        />
      ) : (
        <>
          <div className="space-y-4">
            {payments.map((req) => (
              <Card key={req.id} className="gsap-item overflow-hidden liquid-glass">
                <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">#{req.id.slice(-6)}</span>
                          <Badge variant="warning" className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pendiente
                          </Badge>
                        </div>
                        <h3 className="text-lg font-semibold">{req.concept}</h3>
                        <p className="text-xs text-muted-foreground">{req.category}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">
                          {formatCurrencyAmount(Number(req.amount), (req.currency ?? 'COP') as CurrencyCode)}
                        </div>
                      </div>
                    </div>

                    <div className="bg-background/30 backdrop-blur-sm rounded-lg p-4 text-sm border border-border/50">
                      <p className="text-foreground/80">{req.description}</p>
                    </div>

                    {req.paymentMethod && (
                      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
                        <p className="text-xs font-medium text-muted-foreground">Pago a / método</p>
                        <p className="font-medium text-foreground">{paymentMethodLabel(req.paymentMethod)}</p>
                        {req.paymentMethodDetail ? (
                          <p className="mt-1 whitespace-pre-wrap text-foreground/90">{req.paymentMethodDetail}</p>
                        ) : null}
                      </div>
                    )}

                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-xs font-medium text-white">
                          {req.user?.name?.charAt(0) || 'U'}
                        </div>
                        <span>{req.user?.name || 'Usuario'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{format(new Date(req.createdAt), 'd MMM yyyy, HH:mm', { locale: es })}</span>
                      </div>
                      {req.evidences && req.evidences.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setEvidencePreview({ evidences: req.evidences!, index: 0 })
                          }
                          className="flex items-center gap-2 text-primary hover:underline cursor-pointer bg-transparent border-0 p-0 font-inherit text-sm"
                        >
                          <FileText className="w-4 h-4 shrink-0" />
                          <span>Adjuntos ({req.evidences.length})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex md:flex-col gap-3 border-t md:border-t-0 md:border-l border-border/50 pt-4 md:pt-0 md:pl-6">
                    <Button
                      className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleApprove(req.id)}
                      disabled={isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Aprobar
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 md:flex-none text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleReject(req.id)}
                      disabled={isPending}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Rechazar
                    </Button>
                  </div>
                </div>

                {rejectingId === req.id && (
                  <div className="px-6 pb-6 pt-0">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Comentario de rechazo (obligatorio)"
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                      />
                      <Button onClick={() => confirmReject(req.id)} disabled={!rejectComment.trim() || isPending}>
                        Confirmar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectComment('');
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
          <PaymentPagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </>
      )}

      {evidencePreview && previewCurrent && (
        <ImageModal
          url={previewCurrent.url || previewCurrent.filepath}
          mimeType={previewCurrent.mimetype}
          onClose={() => setEvidencePreview(null)}
          footerSlot={
            previewTotal > 1 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEvidencePreview((p) =>
                      p && previewTotal > 0
                        ? {
                            ...p,
                            index: (p.index - 1 + previewTotal) % previewTotal,
                          }
                        : null
                    )
                  }
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {evidencePreview.index + 1} / {previewTotal}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEvidencePreview((p) =>
                      p && previewTotal > 0
                        ? {
                            ...p,
                            index: (p.index + 1) % previewTotal,
                          }
                        : null
                    )
                  }
                >
                  Siguiente
                </Button>
              </>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
