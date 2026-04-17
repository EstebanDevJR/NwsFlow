import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCreateIncome, useIncomes, useIncomeSummary, type IncomeCustomerType, type IncomePaymentMethod } from '@/hooks/useApi';
import { formatCurrencyAmount } from '@paymentflow/shared';
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

export function Incomes() {
  const [date, setDate] = useState('');
  const [customerType, setCustomerType] = useState<IncomeCustomerType>('CLIENTE');
  const [paymentMethod, setPaymentMethod] = useState<IncomePaymentMethod>('NEQUI');
  const [paymentMethodOther, setPaymentMethodOther] = useState('');
  const [digitalService, setDigitalService] = useState('');
  const [soldAmount, setSoldAmount] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [note, setNote] = useState('');

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
    if (!date || !digitalService.trim() || !soldAmount || !receivedAmount) return;
    await createIncome.mutateAsync({
      date: new Date(date).toISOString(),
      customerType,
      paymentMethod,
      paymentMethodOther: paymentMethod === 'OTRO' ? paymentMethodOther.trim() : undefined,
      digitalService: digitalService.trim(),
      soldAmount: Number(soldAmount),
      receivedAmount: Number(receivedAmount),
      note: note.trim() || undefined,
    });
    setDate('');
    setDigitalService('');
    setSoldAmount('');
    setReceivedAmount('');
    setPaymentMethodOther('');
    setNote('');
  };

  const totalSold = summaryRes?.totals.soldTotal ?? 0;
  const totalReceived = summaryRes?.totals.receivedTotal ?? 0;
  const totalRecords = summaryRes?.totals.recordsCount ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Ingresos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Registro y reportes de servicios digitales por fecha, tipo de cliente y método de pago.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar ingreso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Select value={customerType} onValueChange={(v) => setCustomerType(v as IncomeCustomerType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CLIENTE">Cliente</SelectItem>
                <SelectItem value="DESTACADO">Destacado</SelectItem>
                <SelectItem value="RICACHON">Ricachon</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as IncomePaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NEQUI">Nequi</SelectItem>
                <SelectItem value="DAVIPLATA">Daviplata</SelectItem>
                <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                <SelectItem value="PAYPAL">Paypal</SelectItem>
                <SelectItem value="OTRO">Otro</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Servicio digital prestado" value={digitalService} onChange={(e) => setDigitalService(e.target.value)} />
            <Input type="number" min="0" step="0.01" placeholder="Total vendido" value={soldAmount} onChange={(e) => setSoldAmount(e.target.value)} />
            <Input type="number" min="0" step="0.01" placeholder="Total recibido" value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} />
            {paymentMethod === 'OTRO' && (
              <Input placeholder="Especifica método de pago" value={paymentMethodOther} onChange={(e) => setPaymentMethodOther(e.target.value)} />
            )}
            <Input placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={createIncome.isPending}>
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
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total vendido</p><p className="text-2xl font-semibold">{formatCurrencyAmount(totalSold, 'COP')}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total recibido</p><p className="text-2xl font-semibold">{formatCurrencyAmount(totalReceived, 'COP')}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Registros</p><p className="text-2xl font-semibold">{totalRecords}</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Resumen por método de pago</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(summaryRes?.byPaymentMethod ?? []).map((x) => (
              <div key={x.label} className="flex items-center justify-between border-b border-border/40 pb-2">
                <span>{paymentMethodLabel[x.label as IncomePaymentMethod] ?? x.label}</span>
                <span>{x.recordsCount} · {formatCurrencyAmount(x.receivedTotal, 'COP')}</span>
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
                <span>{x.recordsCount} · {formatCurrencyAmount(x.receivedTotal, 'COP')}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Servicios digitales prestados</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(summaryRes?.byDigitalService ?? []).slice(0, 12).map((x) => (
            <div key={x.label} className="flex items-center justify-between border-b border-border/40 pb-2">
              <span>{x.label}</span>
              <span>{x.recordsCount} · {formatCurrencyAmount(x.receivedTotal, 'COP')}</span>
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
                  <TableHead>Servicio digital</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Recibido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(incomesRes?.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.date).toLocaleDateString('es-CO')}</TableCell>
                    <TableCell>{customerTypeLabel[r.customerType]}</TableCell>
                    <TableCell>{paymentMethodLabel[r.paymentMethod]}{r.paymentMethod === 'OTRO' && r.paymentMethodOther ? ` (${r.paymentMethodOther})` : ''}</TableCell>
                    <TableCell>{r.digitalService}</TableCell>
                    <TableCell className="text-right">{formatCurrencyAmount(Number(r.soldAmount), 'COP')}</TableCell>
                    <TableCell className="text-right">{formatCurrencyAmount(Number(r.receivedAmount), 'COP')}</TableCell>
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
