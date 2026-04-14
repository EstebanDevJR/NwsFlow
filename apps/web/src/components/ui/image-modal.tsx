import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import gsap from 'gsap';
import { api } from '@/lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface ImageModalProps {
  /** URL directa (p. ej. comprobante externo o uso sin id de evidencia). */
  url?: string;
  /** Con id, la vista previa usa GET /upload/evidence/:id/file con el token (evita 403 en &lt;img&gt; sin Authorization). */
  evidenceId?: string;
  mimeType?: string;
  onClose: () => void;
  footerSlot?: React.ReactNode;
}

export function ImageModal({ url, evidenceId, mimeType, onClose, footerSlot }: ImageModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const blobRevokeRef = useRef<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const src = evidenceId ? blobUrl : url;
  const isPdf =
    mimeType === 'application/pdf' || (!!src && /\.pdf(\?|$)/i.test(src));

  useEffect(() => {
    if (!evidenceId) {
      setBlobUrl(null);
      setFailed(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setFailed(false);
      if (blobRevokeRef.current) {
        URL.revokeObjectURL(blobRevokeRef.current);
        blobRevokeRef.current = null;
      }
      setBlobUrl(null);
      try {
        const token = api.getToken();
        const res = await fetch(`${API_URL}/upload/evidence/${encodeURIComponent(evidenceId)}/file`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const created = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(created);
          return;
        }
        blobRevokeRef.current = created;
        setBlobUrl(created);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobRevokeRef.current) {
        URL.revokeObjectURL(blobRevokeRef.current);
        blobRevokeRef.current = null;
      }
    };
  }, [evidenceId]);

  useEffect(() => {
    if (overlayRef.current && contentRef.current) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, scale: 0.95, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.2)', delay: 0.1 }
      );
    }
  }, []);

  const handleClose = () => {
    if (overlayRef.current && contentRef.current) {
      gsap.to(contentRef.current, { opacity: 0, scale: 0.95, y: 10, duration: 0.2, ease: 'power2.in' });
      gsap.to(overlayRef.current, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: onClose,
      });
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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
          <h3 className="font-medium">Vista Previa de Evidencia</h3>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center bg-black/5 dark:bg-black/20 gap-3 min-h-[200px]">
          {evidenceId && loading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">Cargando evidencia…</span>
            </div>
          ) : evidenceId && failed ? (
            <p className="text-sm text-destructive text-center px-4">
              No se pudo cargar el archivo. Cierra e intenta de nuevo; si persiste, contacta al administrador.
            </p>
          ) : !src ? (
            <p className="text-sm text-muted-foreground">Sin vista previa disponible.</p>
          ) : isPdf ? (
            <>
              <iframe
                title="Evidencia PDF"
                src={src}
                className="w-full min-h-[60vh] rounded-lg border border-border/50 bg-white"
              />
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Abrir PDF en una pestaña nueva
              </a>
            </>
          ) : (
            <img
              src={src}
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
