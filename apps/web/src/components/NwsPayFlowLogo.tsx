import { cn } from '@/lib/utils';

type NwsPayFlowLogoProps = {
  className?: string;
  /** Tamaño en píxeles (ancho y alto). Por defecto escala con el contenedor si pasas className w-* h-*. */
  size?: number;
};

/**
 * Marca NWSPayFlow: media luna clara sobre fondo negro (dos círculos superpuestos).
 */
export function NwsPayFlowLogo({ className, size }: NwsPayFlowLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn('shrink-0', !size && 'h-full w-full', className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="#000000" />
      {/* Luna centrada en el icono e inclinada (~15°) alrededor del centro */}
      <g transform="rotate(-15 16 16)">
        <circle cx="16" cy="16" r="8.15" fill="#f5f5f0" />
        <circle cx="23.35" cy="16" r="7.75" fill="#000000" />
      </g>
    </svg>
  );
}
