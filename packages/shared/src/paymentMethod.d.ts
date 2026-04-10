/** Coincide con el enum Prisma `PaymentMethod`. */
export type PaymentMethodType = 'BANK' | 'ROBLOX' | 'PAYPAL';
export declare const PAYMENT_METHOD_OPTIONS: {
    value: PaymentMethodType;
    label: string;
    placeholder: string;
}[];
export declare function paymentMethodLabel(m: PaymentMethodType | string | null | undefined): string;
