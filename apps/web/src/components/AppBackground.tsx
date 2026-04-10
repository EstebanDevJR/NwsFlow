/**
 * Fondo estilo iOS: halos de marca (esmeralda / teal / cian), luminado superior,
 * brillo diagonal y capa de ondas sutiles — paleta NWSPayFlow (flujo, confianza, digital).
 */
export function AppBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Base */}
      <div className="absolute inset-0 bg-[#f2f4f8] dark:bg-[#060a10]" />

      {/* Halo superior — “flow” esmeralda / teal (animación en capa interna para no romper el centrado) */}
      <div className="absolute -top-[28%] left-1/2 h-[72vh] w-[min(140vw,120rem)] -translate-x-1/2">
        <div className="nws-bg-blob-top h-full w-full rounded-[100%] bg-gradient-to-b from-emerald-400/[0.28] via-teal-400/[0.14] to-transparent blur-[88px] dark:from-emerald-500/[0.22] dark:via-teal-500/[0.1] dark:to-transparent" />
      </div>

      {/* Orbes laterales */}
      <div className="absolute -right-[18%] top-[8%] h-[58vh] w-[58vw] max-w-[52rem]">
        <div className="nws-bg-blob-tr h-full w-full rounded-full bg-cyan-400/[0.14] blur-[100px] dark:bg-cyan-500/[0.16]" />
      </div>
      <div className="absolute -left-[22%] bottom-[12%] h-[48vh] w-[52vw] max-w-[48rem]">
        <div className="nws-bg-blob-bl h-full w-full rounded-full bg-teal-400/[0.11] blur-[95px] dark:bg-teal-500/[0.13]" />
      </div>

      {/* Arco inferior — onda suave */}
      <div className="absolute -bottom-[28%] left-1/2 h-[48vh] w-[min(160vw,140rem)] -translate-x-1/2">
        <div className="nws-bg-blob-arc h-full w-full rounded-[100%] border border-white/[0.05] bg-gradient-to-t from-emerald-500/[0.07] via-teal-500/[0.04] to-transparent blur-[2px] dark:border-white/[0.04] dark:from-emerald-500/[0.1] dark:via-teal-600/[0.05] dark:to-transparent" />
      </div>

      {/* Luminado superior */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.38] via-white/[0.06] to-transparent to-[48%] dark:from-white/[0.09] dark:via-transparent dark:to-transparent dark:to-[42%]" />

      {/* Brillo diagonal */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-transparent via-white/[0.07] to-transparent dark:via-white/[0.03]"
        style={{ backgroundSize: '180% 180%', backgroundPosition: '30% 20%' }}
      />

      {/* Ondas */}
      <div className="nws-wave-layer absolute inset-0 opacity-[0.35] mix-blend-soft-light dark:opacity-[0.28] dark:mix-blend-overlay" />

      {/* Textura fina */}
      <div
        className="absolute inset-0 opacity-[0.22] dark:opacity-[0.12]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}
