import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { usePayments, usePaymentStats } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, ArrowRight, FileText, Loader2, CreditCard } from 'lucide-react';
import gsap from 'gsap';
import { EmptyState } from '@/components/ui/empty-state';
import { format, startOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Legend,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartTickProps, chartTooltipShared } from '@/lib/rechartsTheme';
import { formatCurrencyAmount, paymentMethodLabel, type CurrencyCode } from '@paymentflow/shared';

function sumByCurrency(items: { amount: number; currency?: CurrencyCode }[]): Map<CurrencyCode, number> {
  const m = new Map<CurrencyCode, number>();
  for (const it of items) {
    const c = (it.currency ?? 'COP') as CurrencyCode;
    m.set(c, (m.get(c) ?? 0) + Number(it.amount));
  }
  return m;
}

function currencyFromPieName(name: string): CurrencyCode {
  const match = name.match(/\((COP|USD|ROBUX)\)\s*$/);
  return (match?.[1] as CurrencyCode) ?? 'COP';
}

const PIE_COLORS_LIGHT = ['#10b981', '#22c55e', '#eab308', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const PIE_COLORS_DARK = ['#a7f3d0', '#5eead4', '#fde047', '#c4b5fd', '#f9a8d4', '#67e8f9', '#fdba74'];

export function Dashboard() {
  const { user, theme } = useAuthStore();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const paymentsQuery = usePayments(
    user?.role === 'HOLDER' ? { limit: 500 } : user?.role === 'CAJERO' ? { limit: 120 } : { limit: 200 }
  );
  const {
    data: paymentsResponse,
    isLoading: loadingPayments,
    isError: paymentsFailed,
    error: paymentsQueryError,
    refetch: refetchPayments,
  } = paymentsQuery;
  const payments = paymentsResponse?.data;
  const { data: stats, isLoading: loadingStats } = usePaymentStats();

  useEffect(() => {
    if (!loadingPayments && payments && containerRef.current) {
      const cards = containerRef.current.querySelectorAll('.gsap-card');
      gsap.fromTo(cards,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.1, ease: 'back.out(1.2)' }
      );

      const items = containerRef.current.querySelectorAll('.gsap-list-item');
      if (items.length > 0) {
        gsap.fromTo(items,
          { opacity: 0, x: -20 },
          { opacity: 1, x: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.3 }
        );
      }
    }
  }, [payments, loadingPayments]);

  const holderCharts = useMemo(() => {
    if (user?.role !== 'HOLDER' || !payments?.length) {
      return { byMonth: [], byCategory: [], spendingTrend: [] };
    }

    const now = new Date();
    const monthKeys: string[] = [];
    const monthLabels: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(startOfMonth(now), i);
      monthKeys.push(format(d, 'yyyy-MM'));
      monthLabels.push(format(d, 'MMM', { locale: es }));
    }

    const countByMonth = new Map<string, number>();
    monthKeys.forEach((k) => {
      countByMonth.set(k, 0);
    });

    const categoryTotals = new Map<string, number>();

    for (const p of payments) {
      const created = new Date(p.createdAt);
      const key = format(created, 'yyyy-MM');
      if (countByMonth.has(key)) {
        countByMonth.set(key, (countByMonth.get(key) || 0) + 1);
      }
      const cur = (p.currency ?? 'COP') as CurrencyCode;
      const cat = (p.category || 'Sin categoría').trim() || 'Sin categoría';
      if (p.status === 'APPROVED' || p.status === 'PAID') {
        const catKey = `${cat} (${cur})`;
        categoryTotals.set(catKey, (categoryTotals.get(catKey) || 0) + Number(p.amount));
      }
    }

    const byMonth = monthKeys.map((k, i) => ({
      name: monthLabels[i],
      solicitudes: countByMonth.get(k) || 0,
    }));

    const spendingTrend = monthKeys.map((k, i) => {
      const row: { name: string; COP: number; USD: number; ROBUX: number } = {
        name: monthLabels[i],
        COP: 0,
        USD: 0,
        ROBUX: 0,
      };
      for (const p of payments) {
        if (p.status !== 'APPROVED' && p.status !== 'PAID') continue;
        const created = new Date(p.createdAt);
        if (format(created, 'yyyy-MM') !== k) continue;
        const c = (p.currency ?? 'COP') as 'COP' | 'USD' | 'ROBUX';
        if (c === 'COP' || c === 'USD' || c === 'ROBUX') {
          row[c] = Math.round((row[c] + Number(p.amount)) * 100) / 100;
        }
      }
      return row;
    });

    const byCategory = Array.from(categoryTotals.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    return { byMonth, byCategory, spendingTrend };
  }, [user?.role, payments]);

  const pieColors = theme === 'dark' ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;

  if (!user) return null;

  const formatSafe = (iso: string | undefined, fmt: string) => {
    try {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return format(d, fmt, { locale: es });
    } catch {
      return '—';
    }
  };

  const myPayments = user.role === 'LIDER'
    ? payments?.filter((r) => r.userId === user.id) || []
    : payments || [];

  const pendingPayments = myPayments.filter((r) => r.status === 'PENDING');
  const approvedPayments = myPayments.filter((r) => r.status === 'APPROVED');
  const paidPayments = myPayments.filter((r) => r.status === 'PAID');

  const totalByCurrency = sumByCurrency(myPayments);
  const pendingByCurrency = sumByCurrency(pendingPayments);
  const approvedForAvg = myPayments.filter((r) => r.status === 'APPROVED' || r.status === 'PAID');
  const avgBuckets = new Map<CurrencyCode, number[]>();
  for (const r of approvedForAvg) {
    const c = (r.currency ?? 'COP') as CurrencyCode;
    const arr = avgBuckets.get(c) ?? [];
    arr.push(Number(r.amount));
    avgBuckets.set(c, arr);
  }
  const avgByCurrency = Array.from(avgBuckets.entries()).map(([c, vals]) => ({
    currency: c,
    avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
  }));
  const approvedCount = myPayments.filter((r) => r.status === 'APPROVED' || r.status === 'PAID').length;
  const paidRate = approvedCount > 0 ? (paidPayments.length / approvedCount) * 100 : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <Badge variant="warning">Pendiente</Badge>;
      case 'APPROVED': return <Badge variant="success">Aprobado</Badge>;
      case 'REJECTED': return <Badge variant="destructive">Rechazado</Badge>;
      case 'PAID': return <Badge variant="default" className="bg-indigo-500">Pagado</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const displayStats =
    user.role === 'HOLDER' && stats
      ? stats
      : { pending: pendingPayments.length, approved: approvedPayments.length, totalApprovedAmount: 0 };

  const approvedForPayment = myPayments.filter((r) => r.status === 'APPROVED');
  const approvedQueueByCurrency = sumByCurrency(approvedForPayment);

  return (
    <div className="space-y-8" ref={containerRef}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Hola, {user.name.split(' ')[0]}</h2>
        <p className="text-muted-foreground mt-1">
          {user.role === 'HOLDER'
            ? 'Vista global de solicitudes y métricas del sistema.'
            : user.role === 'CAJERO'
              ? 'Resumen operativo para ejecutar pagos (sin estadísticas globales).'
              : 'Aquí tienes el resumen de tu actividad en NWSPayFlow.'}
        </p>
      </div>

      {loadingPayments || (user.role === 'HOLDER' && loadingStats) ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {paymentsFailed && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <p className="font-medium">No se pudieron cargar las solicitudes</p>
              <p className="mt-1 text-destructive/90">
                {paymentsQueryError instanceof Error ? paymentsQueryError.message : 'Error de red o del servidor.'}{' '}
                Revisa que la API esté en marcha y vuelve a intentar.
              </p>
              <button
                type="button"
                className="mt-2 text-sm underline font-medium"
                onClick={() => refetchPayments()}
              >
                Reintentar
              </button>
            </div>
          )}
          {user.role === 'CAJERO' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="gsap-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cola de ejecución</CardTitle>
                  <CreditCard className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{approvedForPayment.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Aprobados pendientes de marcar como pagados</p>
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5 border-t border-border/50 pt-2">
                    {approvedQueueByCurrency.size === 0 ? (
                      <span>Montos: —</span>
                    ) : (
                      Array.from(approvedQueueByCurrency.entries()).map(([cur, amt]) => (
                        <div key={cur} className="font-medium text-foreground">
                          {formatCurrencyAmount(amt, cur)}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="gsap-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">En aprobación</CardTitle>
                  <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{pendingPayments.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Pendientes de aprobación (referencia)</p>
                </CardContent>
              </Card>
              <Card className="gsap-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pagadas</CardTitle>
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{paidPayments.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Solicitudes ya ejecutadas</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="gsap-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total solicitado</CardTitle>
                  <span className="text-muted-foreground font-bold text-lg">∑</span>
                </CardHeader>
                <CardContent>
                  <div className="space-y-0.5">
                    {totalByCurrency.size === 0 ? (
                      <div className="text-2xl font-bold">—</div>
                    ) : (
                      Array.from(totalByCurrency.entries()).map(([cur, amt]) => (
                        <div key={cur} className="text-xl font-bold">
                          {formatCurrencyAmount(amt, cur)}
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Por moneda</p>
                </CardContent>
              </Card>
              <Card className="gsap-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                  <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{displayStats.pending}</div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {pendingByCurrency.size === 0 ? (
                      <span>Sin montos pendientes</span>
                    ) : (
                      Array.from(pendingByCurrency.entries()).map(([cur, amt]) => (
                        <div key={cur}>{formatCurrencyAmount(amt, cur)} por procesar</div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="gsap-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{displayStats.approved}</div>
                  <p className="text-xs text-muted-foreground mt-1">Listas para pago</p>
                </CardContent>
              </Card>
              <Card className="gsap-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pagadas</CardTitle>
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{paidPayments.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Completadas con éxito</p>
                </CardContent>
              </Card>
            </div>
          )}
          {user.role === 'HOLDER' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="gsap-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Ticket promedio (aprobado/pagado)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-0.5">
                    {avgByCurrency.length === 0 ? (
                      <div className="text-2xl font-bold">—</div>
                    ) : (
                      avgByCurrency.map(({ currency: cur, avg }) => (
                        <div key={cur} className="text-lg font-bold">
                          {formatCurrencyAmount(Math.round(avg * 100) / 100, cur)}
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ticket promedio por moneda ({approvedCount} solicitudes aprobadas/pagadas)
                  </p>
                </CardContent>
              </Card>
              <Card className="gsap-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Tasa de ejecución</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{paidRate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Solicitudes pagadas sobre aprobadas</p>
                </CardContent>
              </Card>
            </div>
          )}

          {user.role === 'HOLDER' && payments && payments.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="gsap-card liquid-glass overflow-visible">
                <CardHeader>
                  <CardTitle className="text-base font-medium">Solicitudes por mes</CardTitle>
                </CardHeader>
                <CardContent className="h-[280px] overflow-visible">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={holderCharts.byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="name" tick={{ ...chartTickProps }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ ...chartTickProps }} axisLine={false} tickLine={false} />
                      <Tooltip {...chartTooltipShared} />
                      <Bar dataKey="solicitudes" fill="var(--chart-bar)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="gsap-card liquid-glass overflow-visible">
                <CardHeader>
                  <CardTitle className="text-base font-medium">Monto por categoría (aprobado / pagado)</CardTitle>
                  <p className="text-xs text-muted-foreground font-normal">
                    Cada segmento incluye la moneda; no se mezclan COP, USD ni Robux en un mismo total.
                  </p>
                </CardHeader>
                <CardContent className="h-[280px] overflow-visible">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={holderCharts.byCategory}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={88}
                        paddingAngle={2}
                      >
                        {holderCharts.byCategory.map((_, i) => (
                          <Cell key={i} fill={pieColors[i % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          formatCurrencyAmount(v, currencyFromPieName(String(name))),
                          'Monto',
                        ]}
                        {...chartTooltipShared}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="gsap-card liquid-glass overflow-visible">
                <CardHeader>
                  <CardTitle className="text-base font-medium">Tendencia de gastos aprobados</CardTitle>
                  <p className="text-xs text-muted-foreground font-normal">
                    Una serie por moneda (COP, USD, Robux); las escalas son comparables solo dentro de cada serie.
                  </p>
                </CardHeader>
                <CardContent className="h-[280px] overflow-visible">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={holderCharts.spendingTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="name" tick={{ ...chartTickProps }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ ...chartTickProps }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          formatCurrencyAmount(Number(v), name as CurrencyCode),
                          name,
                        ]}
                        {...chartTooltipShared}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="COP" name="COP" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="USD" name="USD" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="ROBUX" name="Robux" stroke="#d97706" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="gsap-card">
            <h3 className="text-lg font-medium mb-4">Actividad Reciente</h3>
            <Card>
              <div className="divide-y divide-border/50">
                {myPayments.slice(0, 5).map((req) => (
                  <div key={req.id} className="gsap-list-item flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{req.concept}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSafe(req.createdAt, "d 'de' MMMM, yyyy")}
                        </p>
                        {req.paymentMethod ? (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate" title={req.paymentMethodDetail ?? undefined}>
                            {paymentMethodLabel(req.paymentMethod)}
                            {req.paymentMethodDetail ? ` · ${req.paymentMethodDetail}` : ''}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-medium text-sm text-primary">
                          {formatCurrencyAmount(Number(req.amount), (req.currency ?? 'COP') as CurrencyCode)}
                        </p>
                        <div className="mt-1">{getStatusBadge(req.status)}</div>
                      </div>
                      <button 
                        type="button" 
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          if (user.role === 'CAJERO') {
                            navigate('/payments');
                          } else if (user.role === 'LIDER') {
                            navigate('/history');
                          } else {
                            navigate('/approvals');
                          }
                        }}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {myPayments.length === 0 && (
                  <div className="p-6">
                    <EmptyState
                      title="Sin actividad reciente"
                      description="Aún no hay solicitudes para mostrar."
                      icon={FileText}
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
