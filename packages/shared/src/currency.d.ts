/** Monedas soportadas para solicitudes de pago. */
export type CurrencyCode = 'ROBUX' | 'COP' | 'USD';
export declare const CURRENCY_OPTIONS: {
    value: CurrencyCode;
    label: string;
}[];
export declare function isCurrencyCode(s: string): s is CurrencyCode;
/** Texto legible con símbolo según moneda (para UI, emails, Telegram). */
export declare function formatCurrencyAmount(amount: number, currency: CurrencyCode): string;
export declare function currencySymbolHint(currency: CurrencyCode): string;
