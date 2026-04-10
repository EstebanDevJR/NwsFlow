/** Props comunes para Recharts: colores vía CSS variables + tooltip encima del SVG. */
export const chartTickProps = {
  fill: 'var(--chart-tick)',
  fontSize: 11,
} as const;

export const chartTooltipShared = {
  wrapperStyle: { zIndex: 100 },
  contentStyle: {
    backgroundColor: 'var(--chart-tooltip-bg)',
    borderColor: 'var(--chart-tooltip-border)',
    borderRadius: 8,
    zIndex: 100,
  },
  labelStyle: { color: 'var(--chart-tooltip-label)' },
  itemStyle: { color: 'var(--chart-tooltip-label)' },
} as const;
