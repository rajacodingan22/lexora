'use client'

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

interface TabsContextType {
  value: string
  onValueChange: (value: string) => void
  uid: string
  triggersRef: React.MutableRefObject<Map<string, HTMLButtonElement>>
}

const TabsContext = createContext<TabsContextType>({
  value: '',
  onValueChange: () => {},
  uid: '',
  triggersRef: { current: new Map() } as React.MutableRefObject<Map<string, HTMLButtonElement>>,
})

export interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  const uid = useId()
  const triggersRef = useRef<Map<string, HTMLButtonElement>>(new Map())

  return (
    <TabsContext.Provider value={{ value, onValueChange, uid, triggersRef }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  const ctx = useContext(TabsContext)

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const order = Array.from(ctx.triggersRef.current.keys())
    if (order.length < 2) return
    e.preventDefault()
    const idx = order.indexOf(ctx.value)
    if (idx < 0) return
    const nextIdx = e.key === 'ArrowRight'
      ? (idx + 1) % order.length
      : (idx - 1 + order.length) % order.length
    const nextVal = order[nextIdx]
    ctx.onValueChange(nextVal)
    // focus after React commits the new selected state
    requestAnimationFrame(() => ctx.triggersRef.current.get(nextVal)?.focus())
  }

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/50 bg-surface-container-low/50 backdrop-blur-sm p-1.5',
        className
      )}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: ReactNode
  className?: string
  icon?: ReactNode
  count?: number | string
  ref?: React.Ref<HTMLButtonElement>
}

export function TabsTrigger({ value, children, className, icon, count, ref }: TabsTriggerProps) {
  const ctx = useContext(TabsContext)
  const isActive = ctx.value === value

  useEffect(() => {
    // triggersRef is set via the ref callback below; nothing to do here
    return () => {
      ctx.triggersRef.current.delete(value)
    }
  }, [ctx.triggersRef, value])

  return (
    <button
      ref={(el) => {
        if (el) ctx.triggersRef.current.set(value, el)
        else ctx.triggersRef.current.delete(value)
        if (typeof ref === 'function') ref(el)
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el
      }}
      id={`tab-${ctx.uid}-${value}`}
      role="tab"
      type="button"
      aria-selected={isActive}
      aria-controls={`panel-${ctx.uid}-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
        'hover:-translate-y-0.5',
        isActive
          ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/25 scale-105'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50',
        className
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-bold',
            isActive ? 'bg-white/20 text-primary-foreground' : 'bg-surface-container-high text-on-surface-variant'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const ctx = useContext(TabsContext)
  if (ctx.value !== value) return null
  return (
    <div
      id={`panel-${ctx.uid}-${value}`}
      role="tabpanel"
      aria-labelledby={`tab-${ctx.uid}-${value}`}
      tabIndex={0}
      className={cn('animate-fade-in rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20', className)}
    >
      {children}
    </div>
  )
}
