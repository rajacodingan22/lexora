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
        'inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-container-low p-1',
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
        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-[var(--dur-fast)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-primary-soft text-primary shadow-sm'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high',
        className
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
            isActive ? 'bg-primary text-primary-foreground' : 'bg-surface-container-high text-on-surface-variant'
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
      className={cn('animate-fade-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      {children}
    </div>
  )
}
