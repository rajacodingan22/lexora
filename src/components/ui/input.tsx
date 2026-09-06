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
      <div className="relative group">
        {icon && (
          <div
            className={cn(
              'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted transition-all duration-300 group-focus-within:text-primary',
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
            'flex h-14 w-full rounded-2xl border bg-surface-container-lowest/50 px-4 py-3 text-sm text-on-surface backdrop-blur-sm',
            'placeholder:text-muted',
            'transition-all duration-300 ease-out',
            'hover:border-border-strong hover:bg-surface-container-lowest/80',
            'focus:outline-none focus:ring-4 focus:border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'group-focus-within:shadow-lg group-focus-within:shadow-primary/10',
            hasError
              ? 'border-destructive/60 focus:ring-destructive/30 focus:border-destructive bg-destructive-soft/30'
              : success
                ? 'border-success/60 focus:ring-success/30 focus:border-success bg-success-soft/30'
                : 'border-border/70 focus:ring-primary/20',
            icon && 'pl-12',
            suffix && 'pr-12',
            className
          )}
          {...props}
        />
        {suffix && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {suffix}
          </div>
        )}
      </div>
    )

    if (!label && !hint && !error) return input

    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="text-sm font-bold text-on-surface tracking-wide">
            {label}
          </label>
        )}
        {input}
        {(hint || error) && (
          <p
            id={`${id}-hint`}
            className={cn(
              'text-xs font-medium',
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
