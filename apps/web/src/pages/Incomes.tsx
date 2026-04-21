import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { useCreateIncome, useIncomes, useIncomeSummary, type IncomeCurrency, type IncomeCustomerType, type IncomePaymentMethod } from '@/hooks/useApi';
import { formatCalendarDateFromIso } from '@/lib/utils';
import { formatCurrencyAmount, type CurrencyCode } from '@paymentflow/shared';
import { Loader2 } from 'lucide-react';

const paymentMethodLabel: Record<IncomePaymentMethod, string> = {
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  BANCOLOMBIA: 'Bancolombia',
  PAYPAL: 'Paypal',
  OTRO: 'Otro',
};

const customerTypeLabel: Record<IncomeCustomerType, string> = {
  CLIENTE: 'Cliente',
  DESTACADO: 'Destacado',
  RICACHON: 'Ricachon',
};

function parseIncomeAmount(rawInput: string, currency: IncomeCurrency): number | null {
  const raw = rawInput.trim().replace(/\s+/g, '');
  if (!raw) return null;

  if (currency === 'COP') {
    if (/^\d+$/.test(raw)) return Number(raw);
    if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ''));
    if (/^\d+[.,]00$/.test(raw)) return Number(raw.split(/[.,]/)[0]);
    return null;
  }

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const decimalPos = Math.max(lastComma, lastDot);
  let normalized = raw;

  if (decimalPos >= 0) {
    const intPart = raw.slice(0, decimalPos).replace(/[.,]/g, '');
    const fracPart = raw.slice(decimalPos + 1).replace(/[.,]/g, '');
    if (!intPart || !fracPart) return null;
    normalized = `${intPart}.${fracPart}`;
  } else {
    normalized = raw.replace(/[.,]/g, '');
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function Incomes() {
  const [date, setDate] = useState('');
  const [customerType, setCustomerType] = useState<IncomeCustomerType>('CLIENTE');
  const [paymentMethod, setPaymentMethod] = useState<IncomePaymentMethod>('NEQUI');
  const [paymentMethodOther, setPaymentMethodOther] = useState('');
  const [currency, setCurrency] = useState<IncomeCurrency>('COP');
  const [digitalService, setDigitalService] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('day');

  const filters = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      limit: 50,
    }),
    [startDate, endDate]
  );

  const { data: incomesRes, isFetching: loadingIncomes } = useIncomes(filters);
  const { data: summaryRes, isFetching: loadingSummary } = useIncomeSummary({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    period,
  });
  const createIncome = useCreateIncome();

  const submit = async () => {
    setFormError('');
    if (!date) {
      setFormError('Selecciona una fecha para registrar el ingreso.');
      return;
    }
    if (!digitalService.trim()) {
      setFormError('Indica la cantidad de servicio digital prestado.');
      return;
    }
    if (!String(receivedAmount).trim()) {
      setFormError('Indica el total recibido.');
      return;
    }
    if (paymentMethod === 'OTRO' && !paymentMethodOther.trim()) {
      setFormError('Indica qué método de pago usaste al elegir «Otros».');
      return;
    }
    const qty = digitalService.trim();
    if (!/^\d+(\.\d+)?$/.test(qty)) {
      setFormError('La cantidad de servicio digital debe ser un número (ej. 1000 o 10.5).');
      return;
    }
    const amountParsed = parseIncomeAmount(receivedAmount, currency);
    if (amountParsed == null) {
      setFormError(
        currency === 'COP'
          ? 'Para COP usa número entero (ej. 26000 o 26.000).'
          : 'El total recibido no es un número válido.'
      );
      return;
    }
    try {
      await createIncome.mutateAsync({
        date: new Date(date).toISOString(),
        customerType,
        paymentMethod,
        paymentMethodOther: paymentMethod === 'OTRO' ? paymentMethodOther.trim() : undefined,
        currency,
        digitalService: qty,
        receivedAmount: amountParsed,
        note: note.trim() || undefined,
      });
      setDate('');
      setDigitalService('');
      setReceivedAmount('');
      setPaymentMethodOther('');
      setNote('');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No se pudo guardar el ingreso.');
    }
  };

  const totalQuantity = summaryRes?.totals.quantityTotal ?? 0;
  const totalReceivedByCurrency = summaryRes?.totals.receivedByCurrency ?? {};
  const totalRecords = summaryRes?.totals.recordsCount ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Ingresos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Registro y reportes de ingresos por fecha, tipo de cliente, método de pago y cantidad de servicio digital prestado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar ingreso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Completa el registro del ingreso. Si eliges <strong>Otros</strong> en método de pago, debes especificar cuál.
            </p>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (formError) setFormError('');
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de cliente</Label>
                <Select value={customerType} onValueChange={(v) => setCustomerType(v as IncomeCustomerType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLIENTE">Cliente</SelectItem>
                    <SelectItem value="DESTACADO">Destacado</SelectItem>
                    <SelectItem value="RICACHON">Ricachon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Método de pago</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as IncomePaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEQUI">Nequi</SelectItem>
                    <SelectItem value="DAVIPLATA">Daviplata</SelectItem>
                    <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                    <SelectItem value="PAYPAL">Paypal</SelectItem>
                    <SelectItem value="OTRO">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cant. servicio digital prestado</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Ej. 1000"
                  value={digitalService}
                  onChange={(e) => {
                    setDigitalService(e.target.value);
                    if (formError) setFormError('');
                  }}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as IncomeCurrency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COP">COP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Total recibido</Label>
                <Input
                  type="text"
                  inputMode={currency === 'COP' ? 'numeric' : 'decimal'}
                  placeholder={currency === 'COP' ? 'Ej. 26000 o 26.000' : 'Ej. 1500.50 o 1.500,50'}
                  value={receivedAmount}
                  onChange={(e) => {
                    setReceivedAmount(e.target.value);
                    if (formError) setFormError('');
                  }}
                />
              </div>
              {paymentMethod === 'OTRO' && (
                <div className="space-y-1.5">
                  <Label>Especifica cuál método</Label>
                  <Input
                    placeholder="Ej. Binance, efectivo, etc."
                    value={paymentMethodOther}
                    onChange={(e) => {
                      setPaymentMethodOther(e.target.value);
                      if (formError) setFormError('');
                    }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Nota (opcional)</Label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Agrega contexto del ingreso, detalle del acuerdo, observaciones, etc."
                className="flex min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              />
            </div>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button onClick={() => void submit()} disabled={createIncome.isPending}>
            {createIncome.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar ingreso
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros y periodo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <Select value={period} onValueChange={(v) => setPeriod(v as 'day' | 'week' | 'month' | 'year')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Diario</SelectItem>
              <SelectItem value="week">Semanal</SelectItem>
              <SelectItem value="month">Mensual</SelectItem>
              <SelectItem value="year">Anual</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total vendido</p>
            {Object.keys(totalReceivedByCurrency).length === 0 ? (
              <p className="text-2xl font-semibold">—</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(totalReceivedByCurrency).map(([cur, n]) => (
                  <p key={cur} className="text-xl font-semibold">
                    {formatCurrencyAmount(n, cur as CurrencyCode)}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Servicios digitales prestados</p>
            <p className="text-2xl font-semibold">{totalQuantity.toLocaleString('es-CO')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Cantidad de registros</p>
            <p className="text-2xl font-semibold">{totalRecords}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Resumen por método de pago</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(summaryRes?.byPaymentMethod ?? []).map((x) => (
              <div key={x.label} className="flex items-center justify-between border-b border-border/40 pb-2">
                <span>{paymentMethodLabel[x.label as IncomePaymentMethod] ?? x.label}</span>
                <span>{Number(x.receivedTotal).toLocaleString('es-CO')}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Resumen por tipo de cliente</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(summaryRes?.byCustomerType ?? []).map((x) => (
              <div key={x.label} className="flex items-center justify-between border-b border-border/40 pb-2">
                <span>{customerTypeLabel[x.label as IncomeCustomerType] ?? x.label}</span>
                <span>{x.recordsCount}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Activos vendidos (servicio digital)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(summaryRes?.byDigitalService ?? []).slice(0, 12).map((x) => (
            <div key={x.label} className="flex items-center justify-between border-b border-border/40 pb-2">
              <span>{x.label}</span>
              <span>{x.quantityTotal.toLocaleString('es-CO')}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Historial de ingresos</CardTitle></CardHeader>
        <CardContent>
          {loadingIncomes || loadingSummary ? (
            <div className="py-10 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Cargando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Activo vendido</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">$ Recibido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(incomesRes?.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatCalendarDateFromIso(r.date)}</TableCell>
                    <TableCell>{customerTypeLabel[r.customerType]}</TableCell>
                    <TableCell>{paymentMethodLabel[r.paymentMethod]}{r.paymentMethod === 'OTRO' && r.paymentMethodOther ? ` (${r.paymentMethodOther})` : ''}</TableCell>
                    <TableCell>{r.digitalService}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="text-right">{formatCurrencyAmount(Number(r.receivedAmount), r.currency as CurrencyCode)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
