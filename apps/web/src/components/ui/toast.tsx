import * as React from "react"
import { cn } from "@/lib/utils"
import { X, CheckCircle, AlertCircle, Info } from "lucide-react"

export type ToastVariant = "default" | "success" | "destructive" | "info"

export interface ToastData {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
}

interface ToastContextValue {
  toasts: ToastData[]
  toast: (data: Omit<ToastData, "id">) => void
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue>({
  toasts: [],
  toast: () => {},
  dismiss: () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([])

  const toast = React.useCallback((data: Omit<ToastData, "id">) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...data, id }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return React.useContext(ToastContext)
}

const variantStyles: Record<ToastVariant, string> = {
  default: "border-border bg-card text-foreground",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
}

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  default: null,
  success: <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />,
  destructive: <AlertCircle className="h-4 w-4 text-destructive shrink-0" />,
  info: <Info className="h-4 w-4 text-blue-500 shrink-0" />,
}

function ToastViewport({
  toasts,
  dismiss,
}: {
  toasts: ToastData[]
  dismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "relative flex items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full",
            variantStyles[t.variant ?? "default"]
          )}
        >
          {variantIcons[t.variant ?? "default"]}
          <div className="flex-1 min-w-0">
            {t.title && <p className="text-sm font-medium">{t.title}</p>}
            {t.description && <p className="text-xs opacity-80 mt-0.5">{t.description}</p>}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="absolute right-2 top-2 rounded-sm opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
