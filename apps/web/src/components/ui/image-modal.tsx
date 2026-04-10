import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import gsap from 'gsap';

interface ImageModalProps {
  url: string;
  /** Si viene de la API (evidencias), permite mostrar PDF en iframe */
  mimeType?: string;
  onClose: () => void;
  /** Contenido opcional bajo la vista previa (p. ej. navegación entre varios adjuntos) */
  footerSlot?: React.ReactNode;
}

export function ImageModal({ url, mimeType, onClose, footerSlot }: ImageModalProps) {
  const isPdf =
    mimeType === 'application/pdf' ||
    /\.pdf(\?|$)/i.test(url);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (overlayRef.current && contentRef.current) {
      gsap.fromTo(overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
      gsap.fromTo(contentRef.current,
        { opacity: 0, scale: 0.95, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.2)', delay: 0.1 }
      );
    }
  }, []);

  const handleClose = () => {
    if (overlayRef.current && contentRef.current) {
      gsap.to(contentRef.current, { opacity: 0, scale: 0.95, y: 10, duration: 0.2, ease: 'power2.in' });
      gsap.to(overlayRef.current, { opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: onClose });
    } else {
      onClose();
    }
  };

  return (
    <div 
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div 
        ref={contentRef}
        className="relative max-w-4xl w-full max-h-[90vh] bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
          <h3 className="font-medium">Vista Previa de Evidencia</h3>
          <button 
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center bg-black/5 dark:bg-black/20 gap-3">
          {isPdf ? (
            <>
              <iframe title="Evidencia PDF" src={url} className="w-full min-h-[60vh] rounded-lg border border-border/50 bg-white" />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Abrir PDF en una pestaña nueva
              </a>
            </>
          ) : (
            <img
              src={url}
              alt="Evidencia"
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://placehold.co/800x600/e2e8f0/64748b?text=Archivo+no+disponible';
              }}
            />
          )}
        </div>
        {footerSlot ? (
          <div className="border-t border-border/50 bg-muted/20 px-4 py-3 flex items-center justify-center gap-3 shrink-0">
            {footerSlot}
          </div>
        ) : null}
      </div>
    </div>
  );
}
