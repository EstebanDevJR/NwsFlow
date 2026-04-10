import { Search, FilterX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type PaymentListFilters = {
  q: string;
  category: string;
  startDate: string;
  endDate: string;
  status: '' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
};

export const defaultPaymentFilters = (): PaymentListFilters => ({
  q: '',
  category: '',
  startDate: '',
  endDate: '',
  status: '',
});

type Props = {
  filters: PaymentListFilters;
  onChange: (patch: Partial<PaymentListFilters>) => void;
  onReset: () => void;
  /** Mostrar selector de estado (historial completo). */
  showStatus?: boolean;
  /** Texto del campo búsqueda. */
  searchPlaceholder?: string;
};

export function PaymentFiltersBar({
  filters,
  onChange,
  onReset,
  showStatus,
  searchPlaceholder = 'Buscar en concepto, descripción o categoría…',
}: Props) {
  const hasActive =
    !!filters.q.trim() ||
    !!filters.category.trim() ||
    !!filters.startDate ||
    !!filters.endDate ||
    (showStatus && !!filters.status);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[min(100%,280px)] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-9 bg-background/60"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
          />
        </div>
        {showStatus && (
          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => onChange({ status: v === 'all' ? '' : (v as PaymentListFilters['status']) })}
          >
            <SelectTrigger className="w-full sm:w-[180px] bg-background/60">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="PENDING">Pendiente</SelectItem>
              <SelectItem value="APPROVED">Aprobado</SelectItem>
              <SelectItem value="REJECTED">Rechazado</SelectItem>
              <SelectItem value="PAID">Pagado</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={!hasActive} className="gap-1.5">
          <FilterX className="h-4 w-4" />
          Limpiar filtros
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Categoría (coincidencia exacta)</label>
          <Input
            placeholder="ej. Servicios"
            className="bg-background/60"
            value={filters.category}
            onChange={(e) => onChange({ category: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Desde (creación)</label>
          <Input
            type="date"
            className="bg-background/60"
            value={filters.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Hasta (creación)</label>
          <Input
            type="date"
            className="bg-background/60"
            value={filters.endDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function PaymentPagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        {total} resultado{total !== 1 ? 's' : ''} · Página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
