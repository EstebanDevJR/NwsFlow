import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { Check, ChevronRight, Circle } from "lucide-react"

const MENU_MIN_WIDTH_PX = 160

interface DropdownMenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  containerRef: React.RefObject<HTMLDivElement | null>
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  open: false,
  setOpen: () => {},
  containerRef: { current: null },
})

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, containerRef }}>
      <div ref={containerRef} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

function DropdownMenuTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode
  asChild?: boolean
}) {
  const { open, setOpen } = React.useContext(DropdownMenuContext)
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => setOpen(!open),
    })
  }
  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {children}
    </button>
  )
}

function DropdownMenuContent({
  className,
  children,
  align = "start",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: "start" | "end" | "center" }) {
  const { open, setOpen, containerRef } = React.useContext(DropdownMenuContext)
  const [coords, setCoords] = React.useState({ top: 0, left: 0 })

  React.useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 4
      let left: number
      if (align === "end") {
        left = r.right - MENU_MIN_WIDTH_PX
      } else if (align === "center") {
        left = r.left + r.width / 2 - MENU_MIN_WIDTH_PX / 2
      } else {
        left = r.left
      }
      const vw = typeof window !== "undefined" ? window.innerWidth : 0
      left = Math.max(8, Math.min(left, vw - MENU_MIN_WIDTH_PX - 8))
      const top = r.bottom + gap
      setCoords({ top, left })
    }

    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open, align, containerRef])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] bg-transparent"
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <div
        role="menu"
        className={cn(
          "fixed z-[110] min-w-[10rem] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg",
          className
        )}
        style={{ top: coords.top, left: coords.left }}
        {...props}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

function DropdownMenuItem({
  className,
  inset,
  children,
  onClick,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-muted/50 focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        className
      )}
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onCheckedChange,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-muted/50",
        className
      )}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {checked && <Check className="h-4 w-4" />}
      </span>
      {children}
    </div>
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  value,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-muted/50",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <Circle className="h-2 w-2 fill-current" />
      </span>
      {children}
    </div>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", inset && "pl-8", className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("-mx-1 my-1 h-px bg-border/50", className)} {...props} />
}

function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />
  )
}

function DropdownMenuGroup({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}

function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  return <div className="relative">{children}</div>
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        "flex cursor-default select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-muted/50",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" />
    </div>
  )
}

function DropdownMenuSubContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "absolute left-full top-0 z-50 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
}
