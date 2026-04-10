/** Coincide con el enum Prisma `PaymentMethod`. */
export type PaymentMethodType = 'BANK' | 'ROBLOX' | 'PAYPAL';

export const PAYMENT_METHOD_OPTIONS: {
  value: PaymentMethodType;
  label: string;
  placeholder: string;
}[] = [
  {
    value: 'BANK',
    label: 'Transferencia bancaria',
    placeholder: 'Banco, tipo de cuenta, número de cuenta, titular…',
  },
  {
    value: 'ROBLOX',
    label: 'Roblox',
    placeholder: 'Usuario de Roblox o datos acordados para el pago en Robux…',
  },
  {
    value: 'PAYPAL',
    label: 'PayPal',
    placeholder: 'Correo de PayPal o enlace…',
  },
];

export function paymentMethodLabel(m: PaymentMethodType | string | null | undefined): string {
  if (!m) return '—';
  const opt = PAYMENT_METHOD_OPTIONS.find((o) => o.value === m);
  return opt?.label ?? String(m);
}
