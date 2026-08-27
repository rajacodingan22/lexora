import { cn } from '@/lib/utils'
import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, label, error, hint, disabled, ...props }, ref) => {
    const hasError = Boolean(error)
    const genId = useId()
    const id = props.id ?? `select-${genId}`
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-on-surface">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            className={cn(
              'flex h-11 w-full appearance-none rounded-lg border bg-surface-container-lowest pl-3.5 pr-10 py-2 text-sm text-on-surface',
              'transition-all duration-[var(--dur-fast)] ease-[var(--ease-out)]',
              'hover:border-border-strong',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
              hasError
                ? 'border-destructive/60 focus:ring-destructive/40 focus:border-destructive'
                : 'border-border',
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
        </div>
        {(hint || error) && (
          <p className={cn('text-xs', hasError ? 'text-destructive' : 'text-on-surface-variant')}>
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Select }
