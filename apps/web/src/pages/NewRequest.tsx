import { useRef, useEffect, useState, useMemo, FormEvent, Fragment, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, UploadCloud, X, FileText, CheckCircle2 } from 'lucide-react';
import gsap from 'gsap';
import { api } from '@/lib/api';
import {
  CURRENCY_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
  type CurrencyCode,
  type PaymentMethodType,
} from '@paymentflow/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(f: File) {
  return f.type.startsWith('image/');
}

function isPdfFile(f: File) {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

export function NewRequest() {
  const { createRequest, isLoading } = useAppStore();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [concept, setConcept] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('COP');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('BANK');
  const [paymentMethodDetail, setPaymentMethodDetail] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const [error, setError] = useState('');

  const previewItems = useMemo(
    () =>
      attachedFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [attachedFiles]
  );

  useEffect(() => {
    return () => {
      previewItems.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [previewItems]);

  const paymentMethodPlaceholder =
    PAYMENT_METHOD_OPTIONS.find((o) => o.value === paymentMethod)?.placeholder ?? '';

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current,
        { opacity: 0, y: 30, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.2)' }
      );
    }
  }, []);

  const addFiles = (incoming: FileList | File[]) => {
    setFileError('');
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const next: File[] = [...attachedFiles];
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) {
        setFileError(`"${f.name}" supera 10 MB.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setFileError(`Máximo ${MAX_FILES} archivos.`);
        break;
      }
      next.push(f);
    }
    setAttachedFiles(next);
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError('');
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDragActive(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const amountNum = parseFloat(amount.replace(',', '.'));
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        setError('Introduce un monto válido mayor que 0.');
        return;
      }
      const desc = description.trim();
      const conc = concept.trim();
      if (conc.length < 3) {
        setError('El concepto debe tener al menos 3 caracteres.');
        return;
      }
      if (desc.length < 10) {
        setError('La descripción debe tener al menos 10 caracteres.');
        return;
      }

      const created = await createRequest({
        amount: amountNum,
        currency,
        concept: conc,
        description: desc,
        category: category.trim(),
        paymentMethod,
        paymentMethodDetail: paymentMethodDetail.trim(),
        requiredDate,
      });

      if (attachedFiles.length > 0) {
        setUploadingEvidence(true);
        try {
          const formData = new FormData();
          for (const f of attachedFiles) {
            formData.append('files', f);
          }
          await api.post(`/upload/${created.id}`, formData);
        } finally {
          setUploadingEvidence(false);
        }
      }

      gsap.to(containerRef.current, {
        opacity: 0,
        y: -20,
        scale: 0.95,
        duration: 0.3,
        onComplete: () => navigate('/history')
      });
    } catch (err: any) {
      setError(err.message || 'Error al crear solicitud');
    }
  };

  return (
    <div className="max-w-2xl mx-auto" ref={containerRef}>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Nueva Solicitud de Pago</h2>
        <p className="text-muted-foreground mt-1">Completa los detalles para solicitar una aprobación de gasto.</p>
      </div>

      <Card className="liquid-glass">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Concepto</label>
              <Input 
                required 
                minLength={3}
                placeholder="Ej: Pago a desarrolladores" 
                value={concept}
                onChange={e => setConcept(e.target.value)}
                className="bg-background/50 backdrop-blur-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Moneda</label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                  <SelectTrigger className="bg-background/50 backdrop-blur-sm">
                    <SelectValue placeholder="Moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((opt) => (
                      <Fragment key={opt.value}>
                        <SelectItem value={opt.value}>{opt.label}</SelectItem>
                      </Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Monto</label>
                <Input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="bg-background/50 backdrop-blur-sm"
                  placeholder="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Categoría</label>
                <Input 
                  required 
                  placeholder="Ej: Servicios" 
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="bg-background/50 backdrop-blur-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Requerida</label>
              <Input 
                required 
                type="date"
                value={requiredDate}
                onChange={e => setRequiredDate(e.target.value)}
                className="bg-background/50 backdrop-blur-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Descripción y Justificación</label>
              <textarea 
                required
                minLength={10}
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                placeholder="Explica el motivo de este gasto (mínimo 10 caracteres)..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-1">
                <label className="text-sm font-medium">Método de pago</label>
                <p className="text-xs text-muted-foreground">
                  Cómo quieres recibir el pago (transferencia, Roblox o PayPal).
                </p>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethodType)}
                >
                  <SelectTrigger className="bg-background/50 backdrop-blur-sm">
                    <span className={!paymentMethod ? 'text-muted-foreground' : undefined}>
                      {paymentMethod ? paymentMethodLabel(paymentMethod) : 'Selecciona método'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <Fragment key={opt.value}>
                        <SelectItem value={opt.value}>{opt.label}</SelectItem>
                      </Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Datos de la cuenta o destino</label>
                <textarea
                  required
                  minLength={3}
                  maxLength={4000}
                  className="flex min-h-[88px] w-full rounded-md border border-input bg-background/50 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  placeholder={paymentMethodPlaceholder}
                  value={paymentMethodDetail}
                  onChange={(e) => setPaymentMethodDetail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Número de cuenta, usuario de Roblox, correo de PayPal u otros datos para ejecutar el pago.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Evidencias (Opcional)</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                id="file-upload"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <label
                htmlFor="file-upload"
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer group bg-background/30 backdrop-blur-sm block ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-border/50'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Haz clic para subir o arrastra archivos</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, JPG o PNG · máx. 10 MB por archivo · hasta {MAX_FILES} archivos</p>
              </label>

              {attachedFiles.length > 0 && (
                <div
                  className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-100"
                  role="status"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <strong>{attachedFiles.length}</strong>{' '}
                    {attachedFiles.length === 1 ? 'archivo listo' : 'archivos listos'} para enviarse con la solicitud.
                  </span>
                </div>
              )}

              {fileError && <p className="text-sm text-amber-600 dark:text-amber-400">{fileError}</p>}

              {previewItems.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {previewItems.map(({ file, url }, index) => (
                    <div
                      key={`${file.name}-${file.size}-${index}`}
                      className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/20"
                    >
                      <div className="relative flex min-h-[140px] items-center justify-center bg-background/40">
                        {isImageFile(file) ? (
                          <img
                            src={url}
                            alt={`Vista previa: ${file.name}`}
                            className="max-h-40 w-full object-contain"
                          />
                        ) : isPdfFile(file) ? (
                          <iframe
                            src={url}
                            title={`Vista previa PDF: ${file.name}`}
                            className="h-44 w-full border-0 bg-white dark:bg-zinc-900"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 p-6 text-muted-foreground">
                            <FileText className="h-10 w-10" />
                            <span className="text-xs text-center">Vista previa no disponible</span>
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute right-2 top-2 h-8 w-8 shrink-0 shadow-md"
                          onClick={() => removeFile(index)}
                          aria-label={`Quitar ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2 py-1.5 text-xs">
                        <span className="truncate font-medium text-foreground" title={file.name}>
                          {file.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end pt-4 border-t border-border/50">
              <Button type="button" variant="ghost" className="mr-2" onClick={() => navigate(-1)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading || uploadingEvidence}>
                <Send className="w-4 h-4 mr-2" />
                {uploadingEvidence
                  ? 'Subiendo evidencias...'
                  : isLoading
                    ? 'Enviando...'
                    : 'Enviar Solicitud'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
