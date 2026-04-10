import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePayments } from '@/hooks/useApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAppStore } from '@/store/useAppStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, CreditCard, FileText, Upload } from 'lucide-react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';
import {
  PaymentFiltersBar,
  PaymentPagination,
  defaultPaymentFilters,
  type PaymentListFilters,
} from '@/components/payment-filters';
import { formatCurrencyAmount, paymentMethodLabel, type CurrencyCode } from '@paymentflow/shared';

export function Payments() {
  const queryClient = useQueryClient();
  const { updateRequestStatus, isLoading } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedReq, setSelectedReq] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
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

  const { data: listResponse, isLoading: loadingList } = usePayments({
    status: 'APPROVED',
    page,
    limit,
    q: qDebounced.trim() || undefined,
    category: filters.category.trim() || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });

  const approvedRequests = listResponse?.data ?? [];
  const meta = listResponse?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  useEffect(() => {
    if (containerRef.current && approvedRequests.length > 0) {
      const cards = containerRef.current.querySelectorAll('.gsap-item');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.1, ease: 'power2.out' }
      );
    }
  }, [approvedRequests.length, page]);

  const handleExecutePayment = async (id: string) => {
    const random =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const idempotencyKey = `payment-proof:${id}:${random}`;

    if (proofFile) {
      const fd = new FormData();
      fd.append('proof', proofFile);
      await api.post(`/upload/payment-proof/${id}`, fd, {
        'Idempotency-Key': idempotencyKey,
      });
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
    } else if (evidenceUrl.trim()) {
      await updateRequestStatus(id, 'PAID', { paymentProofUrl: evidenceUrl.trim() });
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
    } else {
      alert('Sube un archivo de comprobante (PDF o imagen) o pega una URL de comprobante.');
      return;
    }
    setSelectedReq(null);
    setEvidenceUrl('');
    setProofFile(null);
  };

  return (
    <div className="space-y-8" ref={containerRef}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Ejecución de Pagos</h2>
        <p className="text-muted-foreground mt-1">Solicitudes aprobadas listas para ser pagadas.</p>
      </div>

      <PaymentFiltersBar filters={filters} onChange={patchFilters} onReset={resetFilters} />

      {loadingList ? (
        <div className="flex justify-center py-12 text-muted-foreground text-sm">Cargando…</div>
      ) : approvedRequests.length === 0 ? (
        <EmptyState
          title="Bandeja limpia"
          description="No hay pagos pendientes por ejecutar con los filtros actuales."
          icon={CheckCircle}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {approvedRequests.map((req) => (
              <Card key={req.id} className="gsap-item flex flex-col liquid-glass">
                <div className="p-6 flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <Badge variant="success" className="mb-2">Aprobado</Badge>
                      <h3 className="text-lg font-semibold leading-tight">{req.concept}</h3>
                      <p className="text-sm text-muted-foreground mt-1">Solicitado por {req.user?.name}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-primary">
                        {formatCurrencyAmount(Number(req.amount), (req.currency ?? 'COP') as CurrencyCode)}
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-foreground/80 mb-6 bg-background/30 backdrop-blur-sm p-3 rounded-md border border-border/50">
                    {req.description}
                  </div>

                  {req.paymentMethod && (
                    <div className="mb-4 rounded-md border border-border/50 bg-muted/15 p-3 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">Pago a</p>
                      <p className="font-medium">{paymentMethodLabel(req.paymentMethod)}</p>
                      {req.paymentMethodDetail ? (
                        <p className="mt-1 whitespace-pre-wrap text-foreground/90">{req.paymentMethodDetail}</p>
                      ) : null}
                    </div>
                  )}

                  {selectedReq === req.id ? (
                    <div className="space-y-4 border-t border-border/50 pt-4 mt-auto">
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Subir comprobante (PDF o imagen)</label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border/80 bg-background/40 px-3 py-2 text-sm hover:bg-muted/30">
                          <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-muted-foreground">
                            {proofFile ? proofFile.name : 'Seleccionar archivo…'}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,application/pdf,.pdf"
                            className="hidden"
                            onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                          />
                        </label>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">O bien, URL del comprobante</label>
                        <Input
                          placeholder="https://..."
                          value={evidenceUrl}
                          onChange={(e) => setEvidenceUrl(e.target.value)}
                          className="flex-1 bg-background/50 backdrop-blur-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          className="flex-1"
                          onClick={() => {
                            setSelectedReq(null);
                            setProofFile(null);
                            setEvidenceUrl('');
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button className="flex-1" onClick={() => handleExecutePayment(req.id)} disabled={isLoading}>
                          Confirmar Pago
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-border/50 pt-4 mt-auto flex justify-between items-center">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <FileText className="w-4 h-4" /> #{req.id.slice(-6)}
                      </span>
                      <Button onClick={() => setSelectedReq(req.id)} disabled={isLoading}>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Ejecutar Pago
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <PaymentPagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
