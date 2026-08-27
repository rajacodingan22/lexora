import { cn } from '@/lib/utils'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: ReactNode
  suffix?: ReactNode
  hint?: string
  error?: string
  success?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, icon, suffix, hint, error, success, disabled, ...props }, ref) => {
    const hasError = Boolean(error)
    const genId = useId()
    const id = props.id ?? `input-${genId}`
    const describedBy = hint || error ? `${id}-hint` : undefined
    const input = (
      <div className="relative">
        {icon && (
          <div
            className={cn(
              'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted transition-colors',
              hasError && 'text-destructive',
              !hasError && success && 'text-success'
            )}
          >
            {icon}
          </div>
        )}
        <input
          type={type}
          ref={ref}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex h-11 w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2 text-sm text-on-surface',
            'placeholder:text-muted',
            'transition-all duration-[var(--dur-fast)] ease-[var(--ease-out)]',
            'hover:border-border-strong',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            hasError
              ? 'border-destructive/60 focus:ring-destructive/40 focus:border-destructive'
              : success
                ? 'border-success/60 focus:ring-success/40 focus:border-success'
                : 'border-border',
            icon && 'pl-11',
            suffix && 'pr-11',
            className
          )}
          {...props}
        />
        {suffix && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            {suffix}
          </div>
        )}
      </div>
    )

    if (!label && !hint && !error) return input

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-on-surface">
            {label}
          </label>
        )}
        {input}
        {(hint || error) && (
          <p
            id={`${id}-hint`}
            className={cn(
              'text-xs',
              hasError ? 'text-destructive' : 'text-on-surface-variant'
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
