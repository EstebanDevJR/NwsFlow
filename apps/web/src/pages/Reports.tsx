import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import gsap from 'gsap';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Filter, Loader2, RefreshCw } from 'lucide-react';
import { useReports, useIncomeReports, type IncomeCustomerType, type IncomePaymentMethod } from '@/hooks/useApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { downloadReportFile } from '@/lib/reportDownload';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { RequestStatus } from '@/store/useAppStore';
import { chartTickProps, chartTooltipShared } from '@/lib/rechartsTheme';
import { formatCurrencyAmount, paymentMethodLabel, type CurrencyCode } from '@paymentflow/shared';

type ReportMode = 'solicitudes' | 'pagos' | 'ingresos';

const PREVIEW_PAGE_SIZE = 50;

function formatShortDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function statusLabel(s: RequestStatus): string {
  switch (s) {
    case 'PENDING':
      return 'Pendiente';
    case 'APPROVED':
      return 'Aprobado';
    case 'REJECTED':
      return 'Rechazado';
    case 'PAID':
      return 'Pagado';
    default:
      return s;
  }
}

function statusBadgeVariant(s: RequestStatus): 'warning' | 'secondary' | 'destructive' | 'success' {
  switch (s) {
    case 'PENDING':
      return 'warning';
    case 'APPROVED':
      return 'secondary';
    case 'REJECTED':
      return 'destructive';
    case 'PAID':
      return 'success';
    default:
      return 'secondary';
  }
}

export function Reports() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ReportMode>('solicitudes');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<string>('');
  const [qInput, setQInput] = useState('');
  const [incomeCustomerType, setIncomeCustomerType] = useState<IncomeCustomerType | ''>('');
  const [incomePaymentMethod, setIncomePaymentMethod] = useState<IncomePaymentMethod | ''>('');
  const [incomeDigitalService, setIncomeDigitalService] = useState('');
  const [incomePeriod, setIncomePeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const qDebounced = useDebouncedValue(qInput, 400);
  const [page, setPage] = useState(1);

  const dateField = mode === 'pagos' ? 'paid' : 'created';

  useEffect(() => {
    setPage(1);
  }, [mode, startDate, endDate, category, status, qDebounced]);

  const reportFilters = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      dateField,
      category: category.trim() || undefined,
      status: mode === 'solicitudes' && status ? status : undefined,
      q: qDebounced.trim() || undefined,
      limit: PREVIEW_PAGE_SIZE,
      page,
    }),
    [startDate, endDate, dateField, category, mode, status, qDebounced, page]
  );

  const {
    data: reportResponse,
    isLoading: paymentsLoading,
    isFetching: paymentsFetching,
    refetch: refetchPayments,
    error: paymentsError,
  } = useReports(reportFilters);
  const {
    data: incomeResponse,
    isLoading: incomesLoading,
    isFetching: incomesFetching,
    refetch: refetchIncomes,
    error: incomesError,
  } = useIncomeReports({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    customerType: incomeCustomerType || undefined,
    paymentMethod: incomePaymentMethod || undefined,
    digitalService: incomeDigitalService.trim() || undefined,
    period: incomePeriod,
    page,
    limit: PREVIEW_PAGE_SIZE,
  });

  const isIncomeMode = mode === 'ingresos';
  const reports = isIncomeMode ? incomeResponse?.data ?? [] : reportResponse?.data ?? [];
  const reportTotal = isIncomeMode ? incomeResponse?.meta?.total ?? 0 : reportResponse?.meta?.total ?? 0;
  const totalPages = isIncomeMode ? incomeResponse?.meta?.totalPages ?? 1 : reportResponse?.meta?.totalPages ?? 1;
  const agg = isIncomeMode ? incomeResponse?.meta?.aggregates : reportResponse?.meta?.aggregates;
  const statusBreakdown = isIncomeMode ? [] : reportResponse?.meta?.statusBreakdown ?? [];

  const dataByStatus = useMemo(() => {
    if (isIncomeMode) {
      const rows = incomeResponse?.meta?.byCustomerType ?? [];
      return rows.map((r) => ({ name: r.label, value: r.recordsCount }));
    }
    const map = Object.fromEntries(statusBreakdown.map((r) => [r.status, r.count]));
    return [
      { name: 'Pendientes', value: map['PENDING'] ?? 0 },
      { name: 'Aprobadas', value: map['APPROVED'] ?? 0 },
      { name: 'Pagadas', value: map['PAID'] ?? 0 },
      { name: 'Rechazadas', value: map['REJECTED'] ?? 0 },
    ];
  }, [isIncomeMode, incomeResponse?.meta?.byCustomerType, statusBreakdown]);
  const incomeByPaymentMethod = incomeResponse?.meta?.byPaymentMethod ?? [];
  const incomeByService = incomeResponse?.meta?.byDigitalService ?? [];
  const incomeTimeline = incomeResponse?.meta?.timeline ?? [];

  const incomePeriodLabel =
    incomePeriod === 'day' ? 'Día' : incomePeriod === 'week' ? 'Semana' : incomePeriod === 'month' ? 'Mes' : 'Año';

  useEffect(() => {
    if (containerRef.current) {
      const cards = containerRef.current.querySelectorAll('.gsap-item');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 24, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.06, ease: 'power2.out' }
      );
    }
  }, [mode, reportTotal, page]);

  const buildExportQuery = () => {
    const p = new URLSearchParams();
    if (startDate) p.append('startDate', startDate);
    if (endDate) p.append('endDate', endDate);
    if (mode === 'pagos') p.append('dateField', 'paid');
    if (mode === 'ingresos') {
      if (incomeCustomerType) p.append('customerType', incomeCustomerType);
      if (incomePaymentMethod) p.append('paymentMethod', incomePaymentMethod);
      if (incomeDigitalService.trim()) p.append('digitalService', incomeDigitalService.trim());
      p.append('period', incomePeriod);
    }
    if (category.trim()) p.append('category', category.trim());
    if (mode === 'solicitudes' && status) p.append('status', status);
    if (qDebounced.trim()) p.append('q', qDebounced.trim());
    return p.toString();
  };

  const downloadExcel = () => {
    const q = buildExportQuery();
    return downloadReportFile(mode === 'ingresos' ? `/reports/incomes/export/excel?${q}` : `/reports/export/excel?${q}`);
  };

  const downloadPdf = () => {
    const q = buildExportQuery();
    return downloadReportFile(mode === 'ingresos' ? `/reports/incomes/export/pdf?${q}` : `/reports/export/pdf?${q}`);
  };

  const pendingCountAgg = isIncomeMode ? 0 : (agg as any)?.pendingCount ?? 0;
  const approvedAmountAgg = isIncomeMode ? 0 : (agg as any)?.approvedAmount ?? 0;
  const amountByCurrency = isIncomeMode ? {} : (agg as any)?.amountByCurrency ?? {};
  const approvedAmountByCurrency = isIncomeMode ? {} : (agg as any)?.approvedAmountByCurrency ?? {};
  const loading = isIncomeMode ? incomesLoading || incomesFetching : paymentsLoading || paymentsFetching;
  const error = isIncomeMode ? incomesError : paymentsError;

  const rangeFrom = reportTotal === 0 ? 0 : (page - 1) * PREVIEW_PAGE_SIZE + 1;
  const rangeTo = Math.min(page * PREVIEW_PAGE_SIZE, reportTotal);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setCategory('');
    setStatus('');
    setIncomeCustomerType('');
    setIncomePaymentMethod('');
    setIncomeDigitalService('');
    setIncomePeriod('day');
    setQInput('');
  };

  const dateHint =
    mode === 'pagos'
      ? 'Las fechas filtran por el día en que se registró el pago (pagos ejecutados).'
      : mode === 'ingresos'
        ? 'Las fechas filtran por la fecha del ingreso registrado.'
        : 'Las fechas filtran por el día en que se creó la solicitud.';

  return (
    <div className="space-y-8" ref={containerRef}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Reportes</h2>
          <p className="text-muted-foreground mt-1 max-w-xl">
            NWSPayFlow — consulta agregada y descarga informes en Excel o PDF. Puedes trabajar con{' '}
            <strong>solicitudes</strong>, <strong>pagos ejecutados</strong> o <strong>ingresos</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" disabled={loading} onClick={() => downloadExcel()}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button className="gap-2" disabled={loading} onClick={() => downloadPdf()}>
            <FileText className="h-4 w-4" />
            PDF formal
          </Button>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-border/60 bg-muted/25 p-1">
        <button
          type="button"
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-all',
            mode === 'solicitudes' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setMode('solicitudes')}
        >
          Solicitudes
        </button>
        <button
          type="button"
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-all',
            mode === 'pagos' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setMode('pagos')}
        >
          Pagos ejecutados
        </button>
        <button
          type="button"
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-all',
            mode === 'ingresos' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setMode('ingresos')}
        >
          Ingresos
        </button>
      </div>

      <Card className="gsap-item liquid-glass border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">Filtros</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground font-normal">{dateHint}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Desde</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-background/70" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Hasta</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-background/70" />
            </div>
            {mode !== 'ingresos' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Categoría (exacta)</label>
                  <Input
                    placeholder="Ej. Servicios"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="bg-background/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Buscar texto</label>
                  <Input
                    placeholder="Concepto, descripción o categoría…"
                    value={qInput}
                    onChange={(e) => setQInput(e.target.value)}
                    className="bg-background/70"
                  />
                </div>
              </>
            )}
          </div>
          {mode === 'solicitudes' && (
            <div className="max-w-xs space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
                <SelectTrigger className="bg-background/70">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="PENDING">Pendiente</SelectItem>
                  <SelectItem value="APPROVED">Aprobado</SelectItem>
                  <SelectItem value="REJECTED">Rechazado</SelectItem>
                  <SelectItem value="PAID">Pagado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === 'ingresos' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Tipo de cliente</label>
                <Select value={incomeCustomerType || 'all'} onValueChange={(v) => setIncomeCustomerType(v === 'all' ? '' : (v as IncomeCustomerType))}>
                  <SelectTrigger className="bg-background/70"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="CLIENTE">Cliente</SelectItem>
                    <SelectItem value="DESTACADO">Destacado</SelectItem>
                    <SelectItem value="RICACHON">Ricachon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Metodo de pago</label>
                <Select value={incomePaymentMethod || 'all'} onValueChange={(v) => setIncomePaymentMethod(v === 'all' ? '' : (v as IncomePaymentMethod))}>
                  <SelectTrigger className="bg-background/70"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="NEQUI">Nequi</SelectItem>
                    <SelectItem value="DAVIPLATA">Daviplata</SelectItem>
                    <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                    <SelectItem value="PAYPAL">Paypal</SelectItem>
                    <SelectItem value="OTRO">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Cant. servicio digital</label>
                <Input
                  placeholder="Ej. 1000"
                  value={incomeDigitalService}
                  onChange={(e) => setIncomeDigitalService(e.target.value)}
                  className="bg-background/70"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Agrupar por</label>
                <Select value={incomePeriod} onValueChange={(v) => setIncomePeriod(v as 'day' | 'week' | 'month' | 'year')}>
                  <SelectTrigger className="bg-background/70"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Diario</SelectItem>
                    <SelectItem value="week">Semanal</SelectItem>
                    <SelectItem value="month">Mensual</SelectItem>
                    <SelectItem value="year">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" className="gap-2" onClick={() => (isIncomeMode ? refetchIncomes() : refetchPayments())} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Actualizar vista
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive">No se pudieron cargar los datos. Comprueba la conexión e inténtalo de nuevo.</p>
      )}

      <Card className="gsap-item liquid-glass border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Vista previa de registros</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Listado de las solicitudes que cumplen los filtros (máx. {PREVIEW_PAGE_SIZE} por página). Las descargas incluyen el conjunto completo filtrado.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando vista previa…
            </div>
          ) : reports.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No hay registros que coincidan con los filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[110px]">{mode === 'ingresos' ? 'Fecha' : 'Fecha sol.'}</TableHead>
                  {mode === 'pagos' && <TableHead className="w-[110px]">Fecha pago</TableHead>}
                  <TableHead>{mode === 'ingresos' ? 'Cant. servicio digital' : 'Concepto'}</TableHead>
                  <TableHead className="w-[120px] hidden md:table-cell">
                    {mode === 'ingresos' ? 'Tipo cliente' : 'Categoría'}
                  </TableHead>
                  <TableHead className="w-[72px] hidden sm:table-cell">{mode === 'ingresos' ? 'Método' : 'Moneda'}</TableHead>
                  <TableHead className="text-right w-[120px]">{mode === 'ingresos' ? 'Cantidad' : 'Monto'}</TableHead>
                  <TableHead className="w-[110px]">{mode === 'ingresos' ? 'Recibido' : 'Estado'}</TableHead>
                  <TableHead className="min-w-[140px] hidden lg:table-cell">{mode === 'ingresos' ? 'Registrado por' : 'Solicitante'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                      {formatShortDate((r as any).date ?? r.createdAt)}
                    </TableCell>
                    {mode === 'pagos' && (
                      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                        {formatShortDate(r.paidAt)}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="max-w-[min(28rem,55vw)]">
                        <p className="font-medium leading-snug line-clamp-2" title={r.concept}>
                          {(r as any).concept || (r as any).digitalService || '—'}
                        </p>
                        {(r as any).description ? (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5" title={r.description}>
                            {r.description}
                          </p>
                        ) : null}
                        {(r as any).paymentMethod && mode !== 'ingresos' ? (
                          <p
                            className="text-xs text-muted-foreground line-clamp-1 mt-0.5"
                            title={`${(r as any).paymentMethod}${(r as any).paymentMethodDetail ? ` — ${(r as any).paymentMethodDetail}` : ''}`}
                          >
                            <span className="font-medium text-foreground/70">{(r as any).paymentMethod}</span>
                            {(r as any).paymentMethodDetail ? ` · ${(r as any).paymentMethodDetail}` : ''}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{(r as any).category || (r as any).customerType || '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                      {mode === 'ingresos'
                        ? (() => {
                            const method = (r as any).paymentMethod as string | undefined;
                            const other = (r as any).paymentMethodOther as string | undefined;
                            if (!method) return '—';
                            if (method === 'OTRO' && other?.trim()) return `OTRO (${other.trim()})`;
                            return method;
                          })()
                        : (r as any).currency ?? 'COP'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {mode === 'ingresos'
                        ? Number((r as any).digitalService ?? 0).toLocaleString('es-CO')
                        : formatCurrencyAmount(Number((r as any).amount ?? 0), ((r as any).currency ?? 'COP') as CurrencyCode)}
                    </TableCell>
                    <TableCell>
                      {mode === 'ingresos' ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="secondary">
                            {formatCurrencyAmount(Number((r as any).receivedAmount ?? 0), 'COP')}
                          </Badge>
                          {(r as any).paymentMethod === 'OTRO' && (r as any).paymentMethodOther ? (
                            <span className="text-[10px] text-muted-foreground">
                              OTRO: {(r as any).paymentMethodOther}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant={statusBadgeVariant((r as any).status)}>{statusLabel((r as any).status)}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {(r as any).user?.name || (r as any).createdBy?.name || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && reportTotal > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border/50 pt-4">
              <p className="text-xs text-muted-foreground">
                Mostrando <span className="font-medium text-foreground">{rangeFrom}</span>–
                <span className="font-medium text-foreground">{rangeTo}</span> de{' '}
                <span className="font-medium text-foreground">{reportTotal}</span>
                {totalPages > 1 ? (
                  <span className="text-muted-foreground"> · Página {page} de {totalPages}</span>
                ) : null}
              </p>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="gsap-item liquid-glass">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold tabular-nums">{loading ? '—' : reportTotal}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === 'pagos' ? 'Pagos en el resultado' : mode === 'ingresos' ? 'Ingresos en el resultado' : 'Solicitudes (filtradas)'}
            </p>
          </CardContent>
        </Card>
        <Card className="gsap-item liquid-glass">
          <CardContent className="pt-6">
            <div className="space-y-0.5 text-emerald-600">
              {loading ? (
                '—'
              ) : isIncomeMode ? (
                <span className="text-2xl font-bold tabular-nums">
                  {Number((agg as any)?.quantityTotal ?? 0).toLocaleString('es-CO')}
                </span>
              ) : Object.keys(amountByCurrency).length === 0 ? (
                <span className="text-2xl font-bold tabular-nums">—</span>
              ) : (
                Object.entries(amountByCurrency as Record<string, number>).map(([cur, n]) => (
                  <div key={cur} className="text-lg font-bold tabular-nums">
                    {formatCurrencyAmount(n, cur as CurrencyCode)}
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === 'ingresos' ? 'Servicios digitales prestados' : 'Monto total por moneda'}
            </p>
          </CardContent>
        </Card>
        <Card className="gsap-item liquid-glass">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold tabular-nums text-amber-600">
              {loading ? '—' : isIncomeMode ? reportTotal : pendingCountAgg}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === 'ingresos' ? 'Cantidad de registros' : 'Pendientes (total filtrado)'}
            </p>
          </CardContent>
        </Card>
        <Card className="gsap-item liquid-glass">
          <CardContent className="pt-6">
            <div className="space-y-0.5 text-indigo-600">
              {loading ? (
                '—'
              ) : !isIncomeMode && Object.keys(approvedAmountByCurrency).length > 0 ? (
                Object.entries(approvedAmountByCurrency as Record<string, number>).map(([cur, n]) => (
                  <div key={cur} className="text-lg font-bold tabular-nums">
                    {formatCurrencyAmount(n, cur as CurrencyCode)}
                  </div>
                ))
              ) : (
                <span className="text-2xl font-bold tabular-nums">
                  {isIncomeMode
                    ? formatCurrencyAmount((agg as any)?.receivedTotal ?? 0, 'COP')
                    : approvedAmountAgg === 0
                      ? '—'
                      : approvedAmountAgg.toLocaleString('es-CO')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{isIncomeMode ? 'Total vendido' : 'Solo aprobadas (monto por moneda)'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="gsap-item liquid-glass overflow-visible">
          <CardHeader>
            <CardTitle className="text-base font-medium">
              {mode === 'ingresos' ? 'Distribución por tipo de cliente' : 'Distribución por estado'}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Totales del conjunto filtrado (no solo la página de la tabla).
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full overflow-visible">
              {loading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Cargando…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dataByStatus} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ ...chartTickProps }}
                      dy={8}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ ...chartTickProps }}
                      dx={-6}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--chart-cursor)' }}
                      {...chartTooltipShared}
                    />
                    <Bar dataKey="value" fill="var(--chart-bar)" radius={[4, 4, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="gsap-item liquid-glass">
          <CardHeader>
            <CardTitle className="text-base font-medium">Descargas</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Los archivos usan los <strong>mismos filtros</strong> que la vista. El PDF incluye cabecera corporativa, tabla y totales.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
              <p className="text-sm font-medium">
                {mode === 'pagos' ? 'Informe de pagos ejecutados' : mode === 'ingresos' ? 'Informe de ingresos' : 'Informe de solicitudes'}
              </p>
              <p className="text-xs text-muted-foreground">
                Excel: columnas detalladas incl. descripción{mode === 'pagos' ? ' y fecha de pago' : ''}. PDF: diseño horizontal con
                bandas y pie de página.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" size="sm" className="gap-2" disabled={loading} onClick={() => downloadExcel()}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Descargar Excel
                </Button>
                <Button size="sm" className="gap-2" disabled={loading} onClick={() => downloadPdf()}>
                  <FileText className="h-4 w-4" />
                  Descargar PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isIncomeMode && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="gsap-item liquid-glass">
            <CardHeader>
              <CardTitle className="text-base font-medium">Total por método de pago</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">
                Distribución de ingreso vendido por cada canal.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {incomeByPaymentMethod.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos para los filtros actuales.</p>
              ) : (
                incomeByPaymentMethod.map((row) => (
                  <div key={row.label} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                    <span className="text-sm font-medium">{row.label}</span>
                    <span className="text-sm tabular-nums">{formatCurrencyAmount(row.receivedTotal, 'COP')}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="gsap-item liquid-glass">
            <CardHeader>
              <CardTitle className="text-base font-medium">Servicios digitales prestados</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">
                Cantidad acumulada por tipo de servicio.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {incomeByService.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos para los filtros actuales.</p>
              ) : (
                incomeByService.slice(0, 8).map((row) => (
                  <div key={row.label} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                    <span className="text-sm font-medium truncate pr-2">{row.label}</span>
                    <span className="text-sm tabular-nums">{Number(row.quantityTotal).toLocaleString('es-CO')}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="gsap-item liquid-glass">
            <CardHeader>
              <CardTitle className="text-base font-medium">Evolución por {incomePeriodLabel.toLowerCase()}</CardTitle>
              <p className="text-xs text-muted-foreground font-normal">
                Últimos periodos según el agrupador seleccionado.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {incomeTimeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos para los filtros actuales.</p>
              ) : (
                incomeTimeline.slice(-8).map((row) => (
                  <div key={row.bucket} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-border/50 px-3 py-2">
                    <span className="text-sm text-muted-foreground">{formatShortDate(row.bucket)}</span>
                    <span className="text-sm tabular-nums">{Number(row.quantityTotal).toLocaleString('es-CO')}</span>
                    <span className="text-sm tabular-nums font-medium">{formatCurrencyAmount(row.receivedTotal, 'COP')}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
