/** Monedas soportadas para solicitudes de pago. */
export type CurrencyCode = 'ROBUX' | 'COP' | 'USD';

export const CURRENCY_OPTIONS: { value: CurrencyCode; label: string }[] = [
  { value: 'ROBUX', label: 'Robux' },
  { value: 'COP', label: 'Pesos colombianos (COP)' },
  { value: 'USD', label: 'Dólares (USD)' },
];

export function isCurrencyCode(s: string): s is CurrencyCode {
  return s === 'ROBUX' || s === 'COP' || s === 'USD';
}

/** Texto legible con símbolo según moneda (para UI, emails, Telegram). */
export function formatCurrencyAmount(amount: number, currency: CurrencyCode): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  switch (currency) {
    case 'ROBUX':
      return `${Math.round(n).toLocaleString('es-CO')} Robux`;
    case 'COP':
      return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP`;
    case 'USD':
      return `US$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    default:
      return String(n);
  }
}

export function currencySymbolHint(currency: CurrencyCode): string {
  switch (currency) {
    case 'ROBUX':
      return 'Robux';
    case 'COP':
      return 'COP';
    case 'USD':
      return 'USD';
    default:
      return '';
  }
}
