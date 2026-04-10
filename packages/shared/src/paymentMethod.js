export const PAYMENT_METHOD_OPTIONS = [
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
export function paymentMethodLabel(m) {
    if (!m)
        return '—';
    const opt = PAYMENT_METHOD_OPTIONS.find((o) => o.value === m);
    return opt?.label ?? String(m);
}
//# sourceMappingURL=paymentMethod.js.map