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
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="text-sm font-bold text-on-surface tracking-wide">
            {label}
          </label>
        )}
        <div className="relative group">
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            className={cn(
              'flex h-14 w-full appearance-none rounded-2xl border bg-surface-container-lowest/50 pl-4 pr-12 py-3 text-sm text-on-surface backdrop-blur-sm',
              'transition-all duration-300 ease-out',
              'hover:border-border-strong hover:bg-surface-container-lowest/80',
              'focus:outline-none focus:ring-4 focus:border-primary focus:shadow-lg focus:shadow-primary/10',
              'disabled:cursor-not-allowed disabled:opacity-50',
              hasError
                ? 'border-destructive/60 focus:ring-destructive/30 focus:border-destructive bg-destructive-soft/30'
                : 'border-border/70 focus:ring-primary/20',
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary"
          />
        </div>
        {(hint || error) && (
          <p className={cn('text-xs font-medium', hasError ? 'text-destructive' : 'text-on-surface-variant')}>
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)
Select.displayName = 'Select'

export { Select }
